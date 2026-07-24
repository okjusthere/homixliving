import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { asc, eq } from "drizzle-orm";
import { requireActiveAgent } from "@/lib/auth-guards";
import { fetchAllPublicAgents } from "@/lib/homixweb";
import { PageHeader } from "@/components/homix/page-kit";
import { db } from "@/db";
import { agents as portalAgents } from "@/db/schema";
import { RosterConsole } from "./console";

export const metadata: Metadata = { title: "Public Roster · Homix Deals" };

// Admin console for the public advisor roster on www.homixny.com — replaces the
// old website /admin page. Account creation/deactivation lives in /agents;
// this page controls public visibility, ordering, and marketing fields.
export default async function RosterPage() {
  const session = await requireActiveAgent();
  if (!session.user.isAdmin) redirect("/profile");

  const { agents, unreachable } = await fetchAllPublicAgents();
  const activePortalAgents = await db
    .select({
      id: portalAgents.id,
      name: portalAgents.name,
      email: portalAgents.email,
    })
    .from(portalAgents)
    .where(eq(portalAgents.accountStatus, "active"))
    .orderBy(asc(portalAgents.name), asc(portalAgents.email));

  return (
    <div className="space-y-7">
      <PageHeader
        eyebrow="管理员"
        title="对外名册"
        description="管理 www.homixny.com 的经纪人显示状态、顺序与官网资料。新增和停用经纪人统一在“经纪人”页面完成。"
      />
      <RosterConsole
        initialAgents={agents}
        portalAgents={activePortalAgents}
        unreachable={!!unreachable}
      />
    </div>
  );
}
