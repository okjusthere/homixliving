import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requireActiveAgent } from "@/lib/auth-guards";
import { fetchAllPublicAgents } from "@/lib/homixweb";
import { PageHeader } from "@/components/homix/page-kit";
import { RosterConsole } from "./console";

export const metadata: Metadata = { title: "Public Roster · Homix Deals" };

// Admin console for the public advisor roster on www.homixny.com — replaces the
// old website /admin page. Lists every advisor (including those with no portal
// account) and lets admins publish/hide, reorder, delete, create, and edit. All
// writes flow through the website, which owns public.agents.
export default async function RosterPage() {
  const session = await requireActiveAgent();
  if (!session.user.isAdmin) redirect("/profile");

  const { agents, unreachable } = await fetchAllPublicAgents();

  return (
    <div className="space-y-7">
      <PageHeader
        eyebrow="管理员"
        title="对外名册"
        description="管理 www.homixny.com 的经纪人列表——上/下架、排序、编辑资料、新建。这里的改动会同步到对外网站。"
      />
      <RosterConsole initialAgents={agents} unreachable={!!unreachable} />
    </div>
  );
}
