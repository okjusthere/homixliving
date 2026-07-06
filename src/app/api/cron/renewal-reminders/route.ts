import { NextResponse } from "next/server";
import { and, eq, isNotNull } from "drizzle-orm";
import { db } from "@/db";
import { buildings, dealAgents, deals } from "@/db/schema";
import { daysUntil, renewalWindow } from "@/lib/renewals";
import { notify } from "@/lib/notify";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Fail closed: require the CRON_SECRET bearer (Vercel Cron sends it
// automatically once the env var is set). Same posture as workspace-retention.
function isAuthorizedCronRequest(request: Request): boolean {
  const configuredSecret = process.env.CRON_SECRET?.trim();
  if (!configuredSecret) return false;
  const authorization = request.headers.get("authorization") || "";
  return authorization === `Bearer ${configuredSecret}`;
}

const WINDOW_LABEL: Record<string, string> = {
  "90": "还有 60–90 天",
  "60": "还有 30–60 天",
  "30": "30 天内",
  overdue: "已过租约到期日",
};

export async function GET(request: Request) {
  if (!isAuthorizedCronRequest(request)) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  // Active rentals with a known lease end that haven't been resolved yet.
  const candidates = await db
    .select({
      id: deals.id,
      unit: deals.unit,
      tenantName: deals.tenantName,
      leaseEndDate: deals.leaseEndDate,
      renewalStatus: deals.renewalStatus,
      renewedToDealId: deals.renewedToDealId,
      buildingName: buildings.name,
    })
    .from(deals)
    .leftJoin(buildings, eq(deals.buildingId, buildings.id))
    .where(and(eq(deals.status, "active"), isNotNull(deals.leaseEndDate)));

  let scanned = 0;
  let notified = 0;
  const failures: Array<{ dealId: number; error: string }> = [];

  for (const deal of candidates) {
    scanned += 1;
    // Already handled — renewed into a new deal, or explicitly closed out.
    if (deal.renewedToDealId) continue;
    if (deal.renewalStatus === "renewed" || deal.renewalStatus === "lost") continue;

    const days = daysUntil(deal.leaseEndDate);
    const window = renewalWindow(days);
    if (!window) continue; // more than 90 days out

    try {
      const participants = await db
        .select({ agentId: dealAgents.agentId })
        .from(dealAgents)
        .where(eq(dealAgents.dealId, deal.id));
      if (participants.length === 0) continue;

      const where = `${deal.buildingName || ""} ${deal.unit || ""}`.trim();
      const title =
        window === "overdue"
          ? `续租跟进：${where} 租约已到期`
          : `续租窗口：${where} ${WINDOW_LABEL[window]}`;
      const body = `租客 ${deal.tenantName || "—"} · 租约到期 ${deal.leaseEndDate}。请联系确认续租意向。`;

      // dedupe per deal+window: the daily cron re-scans everything, but each
      // deal notifies its agents at most once per window (90 → 60 → 30 → overdue).
      const count = await notify({
        recipientAgentIds: participants.map((p) => p.agentId),
        type: "renewal_window",
        title,
        body,
        href: `/rental/${deal.id}`,
        dedupeKey: `renewal:${deal.id}:${window}`,
        email: true,
      });
      notified += count;
    } catch (error) {
      failures.push({
        dealId: deal.id,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  const responseBody = { scanned, notified, failed: failures.length };
  if (failures.length > 0) {
    console.error("Renewal reminder cron had failures", failures);
    return NextResponse.json(responseBody, { status: 500 });
  }
  return NextResponse.json(responseBody);
}
