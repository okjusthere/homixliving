import Link from "next/link";
import { requireAdmin } from "@/lib/auth-guards";
import { pgPool } from "@/db";
import { InvitationForm } from "./invitation-form";

export const dynamic = "force-dynamic";
export const metadata = { title: "存量经纪人接入 · Homix" };

export default async function LegacyAccessPage() {
  await requireAdmin();
  const { rows: [schema] } = await pgPool.query("SELECT to_regclass('portal.legacy_agent_claims') IS NOT NULL AS ready");
  const { rows } = schema.ready ? await pgPool.query<{
    public_profile_id: string; name: string | null; slug: string | null; expected_email: string | null;
    allow_email_login: boolean; revoked_at: string | null; claimed_agent_id: number | null;
    claimed_email: string | null; portal_agent_id: number | null; token_expires_at: Date | null;
  }>(`SELECT c.public_profile_id,p.name,p.slug,c.expected_email,c.allow_email_login,c.revoked_at,
    c.claimed_agent_id,c.claimed_email,p.portal_agent_id,c.token_expires_at
    FROM portal.legacy_agent_claims c LEFT JOIN public.agents p ON p.id::text=c.public_profile_id
    ORDER BY p.sort,p.id`) : { rows: [] };
  return <div className="space-y-6">
    <Link href="/admin/agents?view=public&size=all" className="text-sm underline">← 返回经纪人</Link>
    <h1 className="text-3xl">存量经纪人接入 / Existing agent access</h1>
    <p>共 {rows.length} 份预登记 · 已认领 {rows.filter(r => r.claimed_agent_id).length} 份。Gmail 同邮箱登录可自动认领；其他情况使用专属邀请。预登记不是邮箱验证。</p>
    <p className="text-sm text-stone-600">邀请只用于关联原官网档案，不签协议、不触发付款、不改变主页公开状态。已绑定到其他账号的邮箱或身份不会自动合并。</p>
    {!schema.ready && <p role="alert">存量接入数据库尚未部署；暂未启用。</p>}
    <div className="overflow-x-auto rounded-xl border bg-white"><table className="w-full text-left text-sm">
      <thead><tr className="border-b"><th className="p-4">官网档案</th><th className="p-4">预登记登录邮箱</th><th className="p-4">状态 / 操作</th></tr></thead>
      <tbody>{rows.map(row => <tr key={row.public_profile_id} className="border-b align-top">
        <td className="p-4">{row.name || "档案已不存在"}<div className="text-xs text-stone-500">/{row.slug || row.public_profile_id}</div></td>
        <td className="p-4">{row.expected_email || "暂无邮箱，使用专属邀请"}<div className="mt-1 text-xs text-stone-500">{row.allow_email_login ? "Gmail 验证后自动关联" : "需通过邀请选择 Google 登录邮箱"}</div></td>
        <td className="min-w-80 max-w-lg p-4">{row.claimed_agent_id ? <p>已认领 #{row.claimed_agent_id}<br />{row.claimed_email}</p> : row.revoked_at ? "已撤销" : row.portal_agent_id ? `已由其他方式关联 #${row.portal_agent_id}` : !row.name ? "档案不可用" : <>
          {row.token_expires_at && <p className="mb-2 text-xs">上次邀请到期：{new Date(row.token_expires_at).toISOString()}</p>}
          <InvitationForm publicId={row.public_profile_id} />
        </>}</td>
      </tr>)}</tbody>
    </table></div>
  </div>;
}
