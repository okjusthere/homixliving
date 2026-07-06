// Notification fan-out: writes one in-app notification row per recipient and
// (optionally) sends a best-effort email via Resend. All failures are
// swallowed by callers' design — notifying must never break the underlying
// action (deal save, approval, cron run).
import { Resend } from "resend";
import { inArray } from "drizzle-orm";
import { db } from "@/db";
import { agents, notifications } from "@/db/schema";

let _resend: Resend | null = null;
function getResend(): Resend | null {
  const key = process.env.RESEND_API_KEY?.trim();
  if (!key) return null;
  if (!_resend) _resend = new Resend(key);
  return _resend;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export type NotifyInput = {
  recipientAgentIds: number[];
  type: string;
  title: string;
  body?: string;
  /** In-app path the notification links to, e.g. /rental/123 */
  href?: string;
  /**
   * Logical event key (e.g. "renewal:12:60"). A per-recipient suffix is added
   * automatically; re-notifying the same event is a silent no-op, which lets
   * daily crons re-scan safely.
   */
  dedupeKey?: string;
  /** Also send an email to each recipient (best-effort). */
  email?: boolean;
};

export async function notify(input: NotifyInput): Promise<number> {
  const ids = [...new Set(input.recipientAgentIds)].filter(
    (n) => Number.isFinite(n) && n > 0
  );
  if (ids.length === 0) return 0;

  const now = new Date().toISOString();
  const rows = ids.map((agentId) => ({
    recipientAgentId: agentId,
    type: input.type,
    title: input.title,
    body: input.body ?? null,
    href: input.href ?? null,
    dedupeKey: input.dedupeKey ? `${input.dedupeKey}:a${agentId}` : null,
    createdAt: now,
  }));

  const inserted = await db
    .insert(notifications)
    .values(rows)
    .onConflictDoNothing()
    .returning({ recipientAgentId: notifications.recipientAgentId });

  if (inserted.length === 0) return 0;

  if (input.email) {
    try {
      const resend = getResend();
      if (resend) {
        const recipientIds = [...new Set(inserted.map((r) => r.recipientAgentId))];
        const recipients = await db
          .select({ email: agents.email, name: agents.name })
          .from(agents)
          .where(inArray(agents.id, recipientIds));
        const from =
          process.env.NOTIFY_FROM_EMAIL?.trim() || "Homix <invoice@homixny.com>";
        const base = (
          process.env.APP_BASE_URL?.trim() || "https://agents.homixny.com"
        ).replace(/\/$/, "");
        await Promise.allSettled(
          recipients
            .filter((r) => r.email)
            .map((r) =>
              resend.emails.send({
                from,
                to: r.email,
                subject: input.title,
                html: `
                  <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                    <h2 style="font-size:16px;">${escapeHtml(input.title)}</h2>
                    ${input.body ? `<p>${escapeHtml(input.body)}</p>` : ""}
                    ${input.href ? `<p><a href="${base}${input.href}">在系统中查看 / View in Homix</a></p>` : ""}
                    <p style="color:#888;font-size:12px;">Homix 内部系统通知 · Homix internal notification</p>
                  </div>
                `,
              })
            )
        );
      }
    } catch (error) {
      console.error("notify: email fan-out failed", error);
    }
  }

  return inserted.length;
}

/** All active admin agent ids — the default audience for operational alerts. */
export async function adminAgentIds(): Promise<number[]> {
  const rows = await db
    .select({ id: agents.id, isAdmin: agents.isAdmin })
    .from(agents);
  return rows.filter((r) => r.isAdmin).map((r) => r.id);
}
