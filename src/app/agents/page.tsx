import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requireActiveAgent } from "@/lib/auth-guards";
import AgentsConsole from "./agents-client";

export const metadata: Metadata = { title: "Agents · Homix" };

// Same server-side gate as /roster: a non-admin never receives this page, not
// even as an empty shell. The console itself stays a client component — it is
// all interactive state — but admission is decided here, before any of it
// ships to the browser.
export default async function AgentsPage() {
  const session = await requireActiveAgent();
  if (!session.user.isAdmin) redirect("/");

  return <AgentsConsole />;
}
