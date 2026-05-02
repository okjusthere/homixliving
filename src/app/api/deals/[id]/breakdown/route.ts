import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { agents, dealAgents, deals } from "@/db/schema";
import { eq } from "drizzle-orm";
import { computeCommission } from "@/lib/commission";
import { requireActiveAgentApi } from "@/lib/auth-guards";
import { canViewDeal } from "@/lib/visibility";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authResult = await requireActiveAgentApi();
  if ("error" in authResult) return authResult.error;

  const { id } = await params;
  const parsedId = parseInt(id, 10);
  if (!Number.isFinite(parsedId)) {
    return NextResponse.json({ error: "Valid deal id is required" }, { status: 400 });
  }

  if (!(await canViewDeal(authResult.session, parsedId))) {
    return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  }

  const deal = await db.select().from(deals).where(eq(deals.id, parsedId)).get();
  if (!deal) return NextResponse.json({ error: "Deal not found" }, { status: 404 });

  const participantRows = await db
    .select({
      dealAgent: dealAgents,
      agent: agents,
    })
    .from(dealAgents)
    .innerJoin(agents, eq(agents.id, dealAgents.agentId))
    .where(eq(dealAgents.dealId, deal.id));

  return NextResponse.json(
    computeCommission({
      totalCommission: Number(deal.totalCommission || 0),
      referrer:
        deal.referrerType === "percent" || deal.referrerType === "flat"
          ? { type: deal.referrerType, amount: Number(deal.referrerAmount || 0) }
          : null,
      agents: participantRows.map(({ dealAgent, agent }) => ({
        agentId: agent.id,
        name: agent.name,
        sharePct: Number(dealAgent.sharePct || 0),
        splitPct: Number(agent.splitPct || 0),
        isPrimary: Boolean(dealAgent.isPrimary),
      })),
    })
  );
}
