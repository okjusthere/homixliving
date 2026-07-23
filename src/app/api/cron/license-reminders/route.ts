import { NextResponse } from "next/server";
import { isNotNull } from "drizzle-orm";
import { db } from "@/db";
import { agents } from "@/db/schema";
import { daysUntil, renewalWindow } from "@/lib/renewals";
import { adminAgentIds, notify } from "@/lib/notify";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Real-estate license renewals (NY: every 2 years). Watches
// agents.license_expires_at and nudges the agent + admins at 90/60/30 days
// and past-due. Same window helpers and dedupe discipline as the lease
// renewal cron: each agent is notified at most once per window.

const WINDOW_LABEL: Record<string, string> = {
  "90": "还有 60–90 天到期",
  "60": "还有 30–60 天到期",
  "30": "30 天内到期",
  overdue: "已过期",
};

function isAuthorizedCronRequest(request: Request): boolean {
  const configuredSecret = process.env.CRON_SECRET?.trim();
  if (!configuredSecret) return false;
  return request.headers.get("authorization") === `Bearer ${configuredSecret}`;
}

export async function GET(request: Request) {
  if (!isAuthorizedCronRequest(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rows = await db
    .select()
    .from(agents)
    .where(isNotNull(agents.licenseExpiresAt));

  const admins = await adminAgentIds();
  let scanned = 0;
  let notified = 0;
  const failures: string[] = [];

  for (const agent of rows) {
    if (!agent.isActive) continue;
    scanned += 1;
    const days = daysUntil(agent.licenseExpiresAt);
    const window = renewalWindow(days);
    if (!window) continue;

    const label = WINDOW_LABEL[window];
    try {
      notified += await notify({
        recipientAgentIds: [agent.id],
        type: "license_expiry",
        title: `执照${label} / License ${window === "overdue" ? "expired" : "expiring"}`,
        body: `你的地产执照（${agent.licenseNumber || "未登记执照号"}）${label}：${agent.licenseExpiresAt}。请尽快完成续期并更新到期日。`,
        href: "/profile",
        // Expiry date in the key: licenses renew every 2 years, so the same
        // agent+window pair legitimately recurs — dedupe per expiry cycle.
        dedupeKey: `license:${agent.id}:${agent.licenseExpiresAt}:${window}`,
        email: true,
      });
      // Admins see the roster-wide risk; 30-day and overdue only, to stay quiet.
      if ((window === "30" || window === "overdue") && admins.length > 0) {
        notified += await notify({
          recipientAgentIds: admins.filter((id) => id !== agent.id),
          type: "license_expiry",
          title: `经纪人执照${label}：${agent.name}`,
          body: `${agent.name}（${agent.licenseNumber || "未登记执照号"}）执照${label}：${agent.licenseExpiresAt}。`,
          href: "/agents",
          dedupeKey: `license-admin:${agent.id}:${agent.licenseExpiresAt}:${window}`,
          email: true,
        });
      }
    } catch (error) {
      console.error("license reminder failed", agent.id, error);
      failures.push(`agent ${agent.id}`);
    }
  }

  const payload = { scanned, notified, failed: failures.length };
  if (failures.length > 0) return NextResponse.json(payload, { status: 500 });
  return NextResponse.json(payload);
}
