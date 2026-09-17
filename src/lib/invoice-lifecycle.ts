import "server-only";
import { and, eq, isNotNull, or } from "drizzle-orm";
import { db } from "@/db";
import { compensationReceipts, dealCompensationSnapshots, invoices, invoiceSendLog, type Invoice } from "@/db/schema";
import { lockCompensationDeal, type DbTransaction } from "@/lib/advisory-locks";

export class InvoiceLifecycleError extends Error {
  constructor(message: string, readonly status = 409) { super(message); }
}

// Use the same lock order as receipt/finalization operations. The row must be
// re-read after waiting: a concurrent deletion must never create an orphan receipt.
export async function lockInvoice(tx: DbTransaction, invoice: Invoice) {
  if (invoice.dealId) await lockCompensationDeal(tx, "rental", invoice.dealId);
  const [current] = await tx.select().from(invoices).where(eq(invoices.id, invoice.id)).for("update");
  if (!current) throw new InvoiceLifecycleError("Invoice not found / 未找到发票", 404);
  if (current.dealId !== invoice.dealId) throw new InvoiceLifecycleError("Invoice changed. Refresh and retry / 发票已更新，请刷新后重试");
  return current;
}

export async function invoiceDeletionAllowed(invoice: Invoice, executor: typeof db | DbTransaction = db) {
  if (invoice.status !== "draft" || invoice.sentAt || invoice.paidAt || invoice.paidAmount !== null) return false;
  const [attempt] = await executor.select({ id: invoiceSendLog.id }).from(invoiceSendLog)
    .where(eq(invoiceSendLog.invoiceId, invoice.id)).limit(1);
  if (attempt) return false;
  if (!invoice.dealId) return true;
  const [financialRecord] = await executor.select({ id: dealCompensationSnapshots.id })
    .from(dealCompensationSnapshots)
    .leftJoin(compensationReceipts, eq(compensationReceipts.snapshotId, dealCompensationSnapshots.id))
    .where(and(
      eq(dealCompensationSnapshots.dealType, "rental"),
      eq(dealCompensationSnapshots.dealId, invoice.dealId),
      or(eq(dealCompensationSnapshots.status, "finalized"), isNotNull(compensationReceipts.id)),
    )).limit(1);
  return !financialRecord;
}

export const INVOICE_DELETE_BLOCKED = "Only unsent, unpaid drafts without finalized commission can be deleted. Financial records must be retained / 仅可删除未发送、未收款且尚未冻结佣金的草稿，已有财务记录须保留。";
