import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { agents } from "@/db/schema";
import { requireActiveAgent } from "@/lib/auth-guards";
import { fetchPublicProfile } from "@/lib/homixweb";
import { PageHeader } from "@/components/homix/page-kit";
import { PublicProfileEditor } from "./editor";
import { getLocale } from "@/lib/i18n";

const M = {
  en: {
    ownEyebrow: "Profile",
    adminEyebrow: (id: number) => `Admin edit · #${id}`,
    ownTitle: "My public profile",
    adminTitle: (name: string) => `${name}'s public profile`,
    description: "Changes here sync to www.homixny.com and appear exactly as visitors will see them.",
  },
  zh: {
    ownEyebrow: "个人中心",
    adminEyebrow: (id: number) => `管理员编辑 · #${id}`,
    ownTitle: "我的对外主页",
    adminTitle: (name: string) => `${name} 的对外主页`,
    description: "这里编辑的内容会同步到对外网站 www.homixny.com，访客看到的就是这份资料。",
  },
} as const;

export const metadata: Metadata = { title: "Public Profile · Homix" };

// Edit the agent's public marketing-site profile (www.homixny.com) from inside
// the portal — no magic link. Agents edit their own; admins may edit anyone via
// ?agentId=. Data + writes flow through the website (which owns public.agents).
export default async function PublicProfilePage({
  searchParams,
}: {
  searchParams: Promise<{ agentId?: string }>;
}) {
  const session = await requireActiveAgent();
  const t = M[await getLocale()];
  const sp = await searchParams;

  // Whose profile? Own by default; admins may target another via ?agentId=.
  let targetAgentId = session.user.agentId ?? 0;
  const requested = sp.agentId ? Number(sp.agentId) : null;
  if (requested && requested !== session.user.agentId) {
    if (!session.user.isAdmin) redirect("/profile");
    targetAgentId = requested;
  }
  if (!targetAgentId) redirect("/profile");

  const isOwn = targetAgentId === session.user.agentId;
  const [agent] = await db.select().from(agents).where(eq(agents.id, targetAgentId)).limit(1);
  if (!agent) redirect("/agents");

  const { linked, profile, unreachable } = await fetchPublicProfile(targetAgentId);

  return (
    <div className="space-y-7">
      <PageHeader
        eyebrow={isOwn ? t.ownEyebrow : t.adminEyebrow(targetAgentId)}
        title={isOwn ? t.ownTitle : t.adminTitle(agent.name)}
        description={t.description}
      />
      <PublicProfileEditor
        linked={linked}
        unreachable={!!unreachable}
        profile={profile ?? null}
        targetAgentId={targetAgentId}
        isOwn={isOwn}
        canCreate={session.user.isAdmin}
        agentName={agent.name}
        agentPhone={agent.phone}
        agentLicense={agent.licenseNumber}
      />
    </div>
  );
}
