import Link from "next/link";
import { requireAdmin } from "@/lib/auth-guards";
import { adminGroups } from "@/lib/admin-navigation";
import { getLocale } from "@/lib/i18n";
import { PageHeader } from "@/components/homix/page-kit";
import { asc, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { agents, auditLog } from "@/db/schema";
import { CelebrationSummary } from "@/components/admin/celebration-summary";

export const metadata = { title: "Admin · Homix" };
export default async function AdminPage() {
  await requireAdmin();
  const locale = await getLocale();
  const zh = locale === "zh";
  const [pending, recent] = await Promise.all([
    db
      .select({ id: agents.id, name: agents.name })
      .from(agents)
      .where(eq(agents.accountStatus, "pending"))
      .orderBy(asc(agents.id))
      .limit(5)
      .catch((error) => {
        console.error("Admin overview pending unavailable", error);
        return null;
      }),
    db
      .select({ id: auditLog.id, summary: auditLog.summary })
      .from(auditLog)
      .orderBy(desc(auditLog.id))
      .limit(5)
      .catch((error) => {
        console.error("Admin overview audit unavailable", error);
        return null;
      }),
  ]);
  return (
    <div className="space-y-8">
      <PageHeader
        title={locale === "zh" ? "管理中心" : "Administration"}
        description={
          locale === "zh"
            ? "人员、内容、培训和财务管理。"
            : "Manage people, content, learning and finance."
        }
      />
      <CelebrationSummary zh={zh} />
      <div className="grid gap-8 lg:grid-cols-2">
        <section className="rounded-lg border border-line bg-white p-5">
          <div className="mb-3 flex items-center justify-between gap-3">
            <h2 className="font-medium">
              {zh ? "入职待办" : "Pending onboarding"}
            </h2>
            <Link
              className="text-xs underline"
              href="/admin/agents?view=onboarding"
            >
              {zh ? "查看全部" : "View all"} →
            </Link>
          </div>
          {pending === null ? (
            <p className="text-sm text-ink-50">
              {zh
                ? "暂时无法读取待办，请进入名单重试。"
                : "Tasks unavailable. Open the list to retry."}
            </p>
          ) : pending.length === 0 ? (
            <p className="text-sm text-ink-50">
              {zh ? "目前没有待开通账号。" : "No accounts awaiting activation."}
            </p>
          ) : (
            <ul className="divide-y divide-line">
              {pending.map((agent) => (
                <li key={agent.id}>
                  <Link
                    className="flex items-center justify-between gap-3 py-3 text-sm"
                    href={`/admin/agents?view=onboarding&q=${encodeURIComponent(agent.name)}`}
                  >
                    <span className="min-w-0 truncate">{agent.name}</span>
                    <span className="shrink-0 text-xs text-ink-50">
                      {zh ? "查看进度" : "View progress"} →
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
        <section className="rounded-lg border border-line bg-white p-5">
          <div className="mb-3 flex items-center justify-between gap-3">
            <h2 className="font-medium">
              {zh ? "最近操作" : "Recent activity"}
            </h2>
            <Link className="text-xs underline" href="/admin/audit">
              {zh ? "操作审计" : "Audit log"} →
            </Link>
          </div>
          {recent === null ? (
            <p className="text-sm text-ink-50">
              {zh ? "暂时无法读取操作记录。" : "Recent activity unavailable."}
            </p>
          ) : recent.length === 0 ? (
            <p className="text-sm text-ink-50">
              {zh ? "暂无操作记录。" : "No activity yet."}
            </p>
          ) : (
            <ul className="divide-y divide-line">
              {recent.map((entry) => (
                <li key={entry.id} className="py-3 text-sm">
                  <p className="line-clamp-2 break-words">{entry.summary}</p>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
      <div className="grid gap-x-12 gap-y-8 md:grid-cols-2">
        {adminGroups.map((group) => (
          <section key={group.en}>
            <h2 className="mb-3 text-sm font-medium text-ink-50">
              {group[locale]}
            </h2>
            <div className="divide-y divide-line border-y border-line">
              {group.items.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className="flex items-center justify-between py-4 text-sm hover:text-accent"
                >
                  {item[locale]}
                  <span aria-hidden>→</span>
                </Link>
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
