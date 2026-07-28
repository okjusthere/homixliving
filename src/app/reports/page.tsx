import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requireActiveAgent } from "@/lib/auth-guards";
import ReportsConsole from "./reports-client";

export const metadata: Metadata = { title: "Reports · Homix" };

// Server-side admin gate, same as /roster.
export default async function ReportsPage() {
  const session = await requireActiveAgent();
  if (!session.user.isAdmin) redirect("/");

  return <ReportsConsole />;
}
