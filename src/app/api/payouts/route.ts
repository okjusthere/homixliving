import { NextRequest, NextResponse } from "next/server";
import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { agentPayouts, agents } from "@/db/schema";
import { requireActiveAgentApi, requireAdminApi } from "@/lib/auth-guards";
import { logAudit } from "@/lib/audit";
import { notify } from "@/lib/notify";

const METHODS = new Set(["ach", "check", "quickbooks", "zelle", "other"]);

// Payout ledger. Money moves OUTSIDE the system (QuickBooks ACH / checks);
// admins record each disbursement here. Yearly per-agent sums are the 1099
// figures, so rows freeze amounts at record time.

export async function GET() {
  const auth = await requireActiveAgentApi();
  if ("error" in auth) return auth.error;

  const rows = auth.session.user.isAdmin
    ? await db.select().from(agentPayouts).orderBy(desc(agentPayouts.paidAt), desc(agentPayouts.id))
    : await db
        .select()
        .from(agentPayouts)
        .where(eq(agentPayouts.agentId, auth.session.user.agentId ?? -1))
        .orderBy(desc(agentPayouts.paidAt), desc(agentPayouts.id));
  return NextResponse.json(rows);
}

export async function POST(req: NextRequest) {
  const auth = await requireAdminApi();
  if ("error" in auth) return auth.error;

  let body: Record<string, unknown> = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const agentId = Number(body.agentId);
  const amountCents = Math.round(Number(body.amountCents));
  const paidAt = String(body.paidAt || "").slice(0, 10);
  const method = String(body.method || "ach");
  if (!Number.isInteger(agentId) || agentId <= 0) {
    return NextResponse.json({ error: "agentId is required" }, { status: 400 });
  }
  if (!Number.isFinite(amountCents) || amountCents <= 0) {
    return NextResponse.json({ error: "Amount must be positive" }, { status: 400 });
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(paidAt)) {
    return NextResponse.json({ error: "paidAt must be YYYY-MM-DD" }, { status: 400 });
  }
  if (!METHODS.has(method)) {
    return NextResponse.json({ error: "Unknown method" }, { status: 400 });
  }
  const [agent] = await db.select().from(agents).where(eq(agents.id, agentId)).limit(1);
  if (!agent) return NextResponse.json({ error: "Agent not found" }, { status: 404 });

  const dealType = String(body.dealType || "").trim();
  const dealId = Number(body.dealId);
  const [row] = await db
    .insert(agentPayouts)
    .values({
      agentId,
      amountCents,
      method,
      reference: String(body.reference || "").trim().slice(0, 120) || null,
      memo: String(body.memo || "").trim().slice(0, 500) || null,
      dealType: ["rental", "sale"].includes(dealType) ? dealType : null,
      dealId: Number.isInteger(dealId) && dealId > 0 ? dealId : null,
      paidAt,
      createdByEmail: auth.session.user.email ?? null,
    })
    .returning();

  await logAudit(
    auth.session,
    "create",
    "agent_payout",
    row.id,
    `登记佣金发放：${agent.name} $${(amountCents / 100).toFixed(2)}（${method}）`,
  );
  try {
    await notify({
      recipientAgentIds: [agentId],
      type: "payout_recorded",
      title: `佣金发放已登记 / Commission payout recorded`,
      body: `$${(amountCents / 100).toFixed(2)} · ${paidAt} · ${method.toUpperCase()}${row.reference ? ` · ${row.reference}` : ""}`,
      href: "/profile",
      email: true,
    });
  } catch (error) {
    console.error("payout notification failed", error);
  }

  return NextResponse.json(row);
}
