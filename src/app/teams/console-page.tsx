import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requireActiveAgent } from "@/lib/auth-guards";
import TeamsConsole from "./teams-client";

export const metadata: Metadata = { title: "Teams · Homix" };

// Server-side admin gate, same as /roster. The teams API already slims its
// payload for non-admins; this closes the page shell itself.
export default async function TeamsPage() {
  const session = await requireActiveAgent();
  if (!session.user.isAdmin) redirect("/");

  return <TeamsConsole />;
}
