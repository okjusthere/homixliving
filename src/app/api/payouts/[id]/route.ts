import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { agentPayouts } from "@/db/schema";
import { requireAdminApi } from "@/lib/auth-guards";
import { logAudit } from "@/lib/audit";
import { reversePayoutApplications } from "@/lib/compensation-ledger";

// Delete a payout record (data-entry corrections). The disbursement itself
// lives in QuickBooks/the bank — this only fixes the in-system record.
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAdminApi();
  if ("error" in auth) return auth.error;
  const { id } = await params;
  const pid = parseInt(String(id), 10);
  if (!Number.isFinite(pid)) return NextResponse.json({ error: "Invalid id" }, { status: 400 });

  await db.transaction(async (tx) => {
    await reversePayoutApplications(tx, pid);
    await tx.delete(agentPayouts).where(eq(agentPayouts.id, pid));
  });
  await logAudit(auth.session, "delete", "agent_payout", pid, `删除佣金发放记录 #${pid}`);
  return NextResponse.json({ success: true });
}
