import { requireAdmin } from "@/lib/auth-guards";
import AgentDetailConsole from "@/app/agents/[id]/agent-detail-client";
export const metadata = { title: "Agent · Homix" };
export default async function Page() {
  await requireAdmin();
  return <AgentDetailConsole />;
}
