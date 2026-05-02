import { NextResponse } from "next/server";
import { db } from "@/db";
import { agents, buildings, dealAgents, deals } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { daysUntil, renewalWindow, isUpcoming } from "@/lib/renewals";
import { requireActiveAgentApi } from "@/lib/auth-guards";
import { dealsVisibleToSql } from "@/lib/visibility";

export async function GET() {
  const authResult = await requireActiveAgentApi();
  if ("error" in authResult) return authResult.error;

  const visibilityFilter = dealsVisibleToSql(authResult.session);
  const dealRows = visibilityFilter
    ? await db.select().from(deals).where(visibilityFilter)
    : await db.select().from(deals);

  const items = await Promise.all(
    dealRows
      .filter((deal) => isUpcoming(deal))
      .map(async (deal) => {
        const [building, primary] = await Promise.all([
          db.select().from(buildings).where(eq(buildings.id, deal.buildingId)).get(),
          db
            .select({ agent: agents })
            .from(dealAgents)
            .innerJoin(agents, eq(agents.id, dealAgents.agentId))
            .where(and(eq(dealAgents.dealId, deal.id), eq(dealAgents.isPrimary, true)))
            .get(),
        ]);
        const days = daysUntil(deal.leaseEndDate);
        return {
          deal,
          buildingName: building?.name || null,
          buildingRegion: building?.region || null,
          agentName: primary?.agent.name || null,
          agentEmail: primary?.agent.email || null,
          agentPhone: primary?.agent.phone || null,
          daysUntil: days,
          window: renewalWindow(days),
        };
      })
  );

  items.sort((a, b) => (a.daysUntil ?? 0) - (b.daysUntil ?? 0));

  return NextResponse.json({ items, total: items.length });
}
