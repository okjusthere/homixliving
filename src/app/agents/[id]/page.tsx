import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requireActiveAgent } from "@/lib/auth-guards";
import AgentDetailConsole from "./agent-detail-client";

export const metadata: Metadata = { title: "Agent · Homix" };

// Admin or self — the same rule the data APIs enforce
// (src/app/api/agents/[id]/route.ts). Anyone else is bounced before the
// client console ships.
export default async function AgentDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await requireActiveAgent();
  const { id } = await params;
  const isSelf = Number(id) === session.user.agentId;
  if (!session.user.isAdmin && !isSelf) redirect("/profile");

  return <AgentDetailConsole />;
}
