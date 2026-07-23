import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { agents } from "@/db/schema";
import { requireActiveAgent } from "@/lib/auth-guards";
import { fetchPublicProfile } from "@/lib/homixweb";
import { PageHeader } from "@/components/homix/page-kit";
import { PublicProfileEditor } from "./editor";

export const metadata: Metadata = { title: "Public Profile · Homix Deals" };

// Edit the agent's public marketing-site profile (www.homixny.com) from inside
// the portal — no magic link. Agents edit their own; admins may edit anyone via
// ?agentId=. Data + writes flow through the website (which owns public.agents).
export default async function PublicProfilePage({
  searchParams,
}: {
  searchParams: Promise<{ agentId?: string }>;
}) {
  const session = await requireActiveAgent();
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
        eyebrow={isOwn ? "个人中心" : `管理员编辑 · #${targetAgentId}`}
        title={isOwn ? "我的对外主页" : `${agent.name} 的对外主页`}
        description="这里编辑的内容会同步到对外网站 www.homixny.com——访客看到的就是这份资料。"
      />
      <PublicProfileEditor
        linked={linked}
        unreachable={!!unreachable}
        profile={profile ?? null}
        targetAgentId={targetAgentId}
        isOwn={isOwn}
        agentName={agent.name}
        agentEmail={agent.email}
      />
    </div>
  );
}
