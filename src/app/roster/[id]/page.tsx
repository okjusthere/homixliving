import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { requireActiveAgent } from "@/lib/auth-guards";
import { fetchPublicProfileById } from "@/lib/homixweb";
import { PageHeader } from "@/components/homix/page-kit";
import { tone } from "@/components/homix/tokens";
import { PublicProfileEditor } from "../../profile/public/editor";

export const metadata: Metadata = { title: "Edit Advisor · Homix Deals" };

// Admin edit of one advisor's public profile, keyed by PUBLIC agent id — works
// for advisors with no portal account too. Reuses the self-service editor with
// adminPublicId set so saves go to the admin endpoint.
export default async function RosterEditPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await requireActiveAgent();
  if (!session.user.isAdmin) redirect("/profile");
  const { id } = await params;

  const { profile, unreachable, notFound } = await fetchPublicProfileById(id);
  if (notFound) redirect("/roster");

  return (
    <div className="space-y-6">
      <Link href="/roster" className="text-[12.5px]" style={{ color: tone.ink50 }}>
        ← 返回对外名册
      </Link>
      <PageHeader
        eyebrow={`管理员编辑 · ${id}`}
        title={`${profile?.name || id} 的对外主页`}
        description="以管理员身份编辑该经纪人在 www.homixny.com 上的资料——即使对方没有 portal 账号也可编辑。"
      />
      <PublicProfileEditor
        linked={!!profile}
        unreachable={!!unreachable}
        profile={profile ?? null}
        targetAgentId={0}
        isOwn={false}
        agentName={profile?.name || id}
        agentEmail={profile?.email ?? null}
        adminPublicId={id}
      />
    </div>
  );
}
