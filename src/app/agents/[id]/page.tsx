import type { Metadata } from "next";
import { legacyAdminUrl } from "@/lib/admin-navigation";
import { redirect } from "next/navigation";
import { requireActiveAgent } from "@/lib/auth-guards";
import AgentDetailConsole from "./agent-detail-client";

export const metadata: Metadata = { title: "Agent · Homix" };

// Admin or self — the same rule the data APIs enforce
// (src/app/api/agents/[id]/route.ts). Anyone else is bounced before the
// client console ships.
export default async function AgentDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await requireActiveAgent();
  const { id } = await params;
  const isSelf = Number(id) === session.user.agentId;
  if (!session.user.isAdmin && !isSelf) redirect("/profile");

  if (session.user.isAdmin) redirect(legacyAdminUrl(`/admin/agents/${encodeURIComponent(id)}`, await searchParams));
  return <AgentDetailConsole />;
}
