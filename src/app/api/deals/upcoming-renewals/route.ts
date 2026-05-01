import { NextResponse } from "next/server";
import { db } from "@/db";
import { agents, buildings, deals } from "@/db/schema";
import { eq } from "drizzle-orm";
import { daysUntil, renewalWindow, isUpcoming } from "@/lib/renewals";

export async function GET() {
  const rows = await db
    .select({
      deal: deals,
      buildingName: buildings.name,
      buildingRegion: buildings.region,
      agentName: agents.name,
      agentEmail: agents.email,
      agentPhone: agents.phone,
    })
    .from(deals)
    .leftJoin(buildings, eq(deals.buildingId, buildings.id))
    .leftJoin(agents, eq(deals.primaryAgentId, agents.id));

  const items = rows
    .filter((r) => isUpcoming(r.deal))
    .map((r) => {
      const days = daysUntil(r.deal.leaseEndDate);
      return {
        ...r,
        daysUntil: days,
        window: renewalWindow(days),
      };
    })
    .sort((a, b) => (a.daysUntil ?? 0) - (b.daysUntil ?? 0));

  return NextResponse.json({ items, total: items.length });
}
