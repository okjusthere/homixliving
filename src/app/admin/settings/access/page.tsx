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
            ? "只有本次实际使用的 Google 登录邮箱在管理员配置中，且账号在职，才有管理权限。同一账号的其他登录邮箱不会继承权限。"
            : "Administrator access requires an active account and the exact Google email used for this login to be configured. Other sign-in addresses on the same account do not inherit access."
        }
      />
      <div className="overflow-x-auto rounded-lg border border-line bg-white">
        <table className="access-table">
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
                      ? "管理员配置"
                      : "Administrator configuration"
                    : zh
                      ? "已失效：配置中已移除"
                      : "Revoked: no configured address"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-sm text-ink-70">
        {zh
          ? "这是只读清单。管理员配置限制每一次 Google 登录使用的邮箱；未列入的别名只能取得普通经纪人权限。旧会话如未记录实际登录邮箱，需退出并用名单内邮箱重新登录。移除配置中的邮箱即撤销该邮箱会话的管理权限。停用账号立即阻止业务访问，重新登录不会自动恢复，恢复需走账号审批。"
          : "Read-only directory. Administrator configuration applies to the exact email used for each Google login. Unlisted aliases have ordinary Agent access. Older sessions without the verified login address must sign out and sign in with a configured email. Removing an address revokes its administrator sessions. Suspension blocks business access; signing in cannot reactivate the account."}
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
