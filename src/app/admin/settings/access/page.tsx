import { asc, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { agents, agentEmailAddresses } from "@/db/schema";
import { configuredAdminEmails } from "@/lib/admin-emails";
import { requireAdmin } from "@/lib/auth-guards";
import { getLocale } from "@/lib/i18n";
import { PageHeader } from "@/components/homix/page-kit";

export const metadata = { title: "Administrator access · Homix" };
export default async function AccessPage() {
  await requireAdmin();
  const zh = (await getLocale()) === "zh";
  const roster = await db
    .select({
      id: agents.id,
      name: agents.name,
      email: agents.email,
      status: agents.accountStatus,
    })
    .from(agents)
    .where(eq(agents.isAdmin, true))
    .orderBy(asc(agents.id));
  const emails = roster.length
    ? await db
        .select({
          agentId: agentEmailAddresses.agentId,
          email: agentEmailAddresses.email,
          verifiedAt: agentEmailAddresses.verifiedAt,
          canSignIn: agentEmailAddresses.canSignIn,
        })
        .from(agentEmailAddresses)
        .where(
          inArray(
            agentEmailAddresses.agentId,
            roster.map((a) => a.id),
          ),
        )
    : [];
  const configured = configuredAdminEmails();
  const unmatched = configured.filter(
    (e) =>
      !roster.some((a) => a.email.toLowerCase() === e) &&
      !emails.some(
        (a) => a.email.toLowerCase() === e && a.verifiedAt && a.canSignIn,
      ),
  );
  return (
    <div className="space-y-6">
      <PageHeader
        title={zh ? "管理员权限" : "Administrator access"}
        description={
          zh
            ? "实际管理员账号及其登录邮箱。权限跟随账号，登录邮箱可以有多个。"
            : "Current administrator accounts and their verified sign-in addresses."
        }
      />
      <div className="overflow-x-auto rounded-lg border border-line bg-white">
        <table className="agent-table">
          <thead>
            <tr>
              {(zh
                ? ["账号", "主邮箱 / 登录别名", "状态", "授权来源"]
                : [
                    "Account",
                    "Primary / sign-in emails",
                    "Status",
                    "Grant source",
                  ]
              ).map((x) => (
                <th key={x}>{x}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {roster.map((a) => (
              <tr key={a.id}>
                <td>
                  {a.name}
                  <div className="secondary">#{a.id}</div>
                </td>
                <td>
                  {a.email}
                  {emails
                    .filter(
                      (e) =>
                        e.agentId === a.id &&
                        e.verifiedAt &&
                        e.canSignIn &&
                        e.email !== a.email,
                    )
                    .map((e) => (
                      <div key={e.email} className="secondary">
                        {e.email}
                      </div>
                    ))}
                </td>
                <td>
                  {zh
                    ? { active: "在职", pending: "待开通", inactive: "停用" }[
                        a.status
                      ]
                    : a.status}
                </td>
                <td>
                  {configured.includes(a.email.toLowerCase()) ||
                  emails.some(
                    (e) =>
                      e.agentId === a.id &&
                      e.verifiedAt &&
                      e.canSignIn &&
                      configured.includes(e.email.toLowerCase()),
                  )
                    ? zh
                      ? "账号授权 + 环境配置"
                      : "Account + environment"
                    : zh
                      ? "账号授权"
                      : "Account grant"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-sm text-ink-70">
        {zh
          ? "这是只读清单。撤销权限时需同时核对环境配置和账号标记，避免下次登录时重新授予。"
          : "Read-only directory. Revocation must account for both environment configuration and account grants."}
      </p>
      {unmatched.length > 0 && (
        <div className="rounded-lg border border-amber-200 p-4 text-sm">
          <p className="mb-2 font-medium">
            {zh
              ? "配置中另有可提升为管理员的邮箱"
              : "Additional configured administrator emails"}
          </p>
          {unmatched.map((e) => (
            <p key={e}>{e}</p>
          ))}
        </div>
      )}
    </div>
  );
}
