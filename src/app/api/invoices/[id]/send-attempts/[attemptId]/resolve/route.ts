import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { auditLog, invoices, invoiceSendLog } from "@/db/schema";
import { requireAdminApi } from "@/lib/auth-guards";
import { parseDbTime } from "@/lib/db-time";
import { InvoiceLifecycleError, lockInvoice } from "@/lib/invoice-lifecycle";
import { requestBytes, RequestBodyTooLarge } from "@/lib/content/request-body";

const resolutionSchema = z.object({
  outcome: z.enum(["sent", "failed"]),
  note: z.string().trim().min(5).max(1000),
}).strict();
// The send route runs for at most 60 seconds. Wait another full minute before
// an administrator can reconcile an uncertain delivery against provider records.
const MIN_RESOLUTION_AGE_MS = 120_000;
const validId = (id: string) => /^\d+$/.test(id) && Number.isSafeInteger(Number(id))
  && Number(id) > 0 && Number(id) <= 2147483647;

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string; attemptId: string }> },
) {
  const auth = await requireAdminApi();
  if ("error" in auth) return auth.error;
  if (request.headers.get("origin") !== new URL(request.url).origin) {
    return Response.json({ error: "Invalid request origin" }, { status: 403 });
  }
  const { id, attemptId } = await params;
  if (!validId(id) || !validId(attemptId)) {
    return Response.json({ error: "Invalid invoice or send attempt id" }, { status: 400 });
  }
  let input: z.infer<typeof resolutionSchema>;
  try {
    input = resolutionSchema.parse(JSON.parse(new TextDecoder().decode(await requestBytes(request, 8192))));
  } catch (error) {
    return Response.json({ error: "Choose a delivery outcome and provide a verification note of 5–1000 characters / 请选择核实结果并填写5–1000字核实说明" },
      { status: error instanceof RequestBodyTooLarge ? 413 : 400 });
  }

  const [invoice] = await db.select().from(invoices).where(eq(invoices.id, Number(id)));
  if (!invoice) return Response.json({ error: "Invoice not found" }, { status: 404 });
  try {
    await db.transaction(async tx => {
      const current = await lockInvoice(tx, invoice);
      const [attempt] = await tx.select().from(invoiceSendLog).where(and(
        eq(invoiceSendLog.id, Number(attemptId)),
        eq(invoiceSendLog.invoiceId, current.id),
      )).for("update");
      if (!attempt) throw new InvoiceLifecycleError("Send attempt not found for this invoice", 404);
      if (attempt.status !== "sending") {
        throw new InvoiceLifecycleError("This send attempt has already finished. Refresh its history / 此发送记录已有结果，请刷新历史记录");
      }
      const startedAt = parseDbTime(attempt.sentAt);
      if (!startedAt || Date.now() - startedAt.getTime() < MIN_RESOLUTION_AGE_MS) {
        throw new InvoiceLifecycleError("Wait at least two minutes after sending starts, then verify delivery with the mail provider / 请在开始发送两分钟后，核实邮件服务商记录再处理");
      }
      const now = new Date().toISOString();
      const hasPayment = current.status === "paid" || current.paidAt !== null || current.paidAmount !== null;
      await tx.update(invoices).set({
        // Delivery reconciliation must never undo a financial receipt.
        status: hasPayment ? current.status : input.outcome,
        ...(input.outcome === "sent" && !current.sentAt ? { sentAt: attempt.sentAt } : {}),
        updatedAt: now,
      }).where(eq(invoices.id, current.id));
      await tx.update(invoiceSendLog).set({
        status: input.outcome,
        errorMessage: input.outcome === "failed" ? `Administrator verified: ${input.note}` : null,
      }).where(eq(invoiceSendLog.id, attempt.id));
      // A resolution is allowed because it leaves this evidence. Keep the audit
      // and state change atomic; an audit failure rolls the entire operation back.
      await tx.insert(auditLog).values({
        actorEmail: auth.session.user.email,
        action: "resolve_invoice_send",
        entityType: "invoice",
        entityId: String(current.id),
        summary: `核实发票 ${current.invoiceNumber} 发送结果：${input.outcome}`.slice(0, 500),
        detail: JSON.stringify({
          actorAgentId: auth.session.user.agentId,
          attemptId: attempt.id,
          previousStatus: attempt.status,
          outcome: input.outcome,
          note: input.note,
          startedAt: attempt.sentAt,
          resolvedAt: now,
        }),
        createdAt: now,
      });
    });
    return Response.json({ success: true, invoiceId: invoice.id, attemptId: Number(attemptId), outcome: input.outcome });
  } catch (error) {
    if (error instanceof InvoiceLifecycleError) return Response.json({ error: error.message }, { status: error.status });
    console.error("Invoice send resolution failed", { type: error instanceof Error ? error.name : "unknown" });
    return Response.json({ error: "Unable to save the verified delivery result / 暂时无法保存核实结果" }, { status: 500 });
  }
}
