import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { agentPaymentProfiles, agents } from "@/db/schema";
import { requireAdminApi } from "@/lib/auth-guards";
import { logAuditStrict } from "@/lib/audit";

// Admin reveal of an agent's FULL payout instructions (payee entity, routing,
// account). This is the one place full digits leave the server — needed once
// per agent to set up ACH in QuickBooks. Every call is audited (no digits in
// the audit detail itself), and responses are never cacheable.
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAdminApi();
  if ("error" in auth) return auth.error;
  const { id } = await params;
  const agentId = parseInt(String(id), 10);
  if (!Number.isFinite(agentId)) {
    return NextResponse.json({ error: "Invalid agent id" }, { status: 400 });
  }

  const [agent] = await db.select().from(agents).where(eq(agents.id, agentId)).limit(1);
  if (!agent) return NextResponse.json({ error: "Agent not found" }, { status: 404 });

  const [profile] = await db
    .select()
    .from(agentPaymentProfiles)
    .where(eq(agentPaymentProfiles.agentId, agentId))
    .limit(1);
  if (!profile || (!profile.routingNumber && !profile.accountNumber)) {
    return NextResponse.json({ error: "No payment info on file" }, { status: 404 });
  }

  // Fail closed: the reveal is only permitted because it leaves an audit
  // trail. If the audit row can't be written, no digits go out.
  try {
    await logAuditStrict(
      auth.session,
      "download",
      "agent",
      agentId,
      `查看经纪人 #${agentId}（${agent.name}）收款账户完整信息`,
    );
  } catch (error) {
    console.error("payment reveal blocked: audit write failed", agentId, error);
    return NextResponse.json(
      { error: "Audit log unavailable — reveal blocked. Try again." },
      { status: 500 },
    );
  }

  return NextResponse.json(
    {
      agentId,
      agentName: agent.name,
      payeeType: profile.payeeType,
      payeeName: profile.payeeName,
      bankName: profile.bankName,
      accountType: profile.accountType,
      routingNumber: profile.routingNumber,
      accountNumber: profile.accountNumber,
    },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
