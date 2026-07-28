import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requireActiveAgent } from "@/lib/auth-guards";
import SettingsConsole from "./settings-client";

export const metadata: Metadata = { title: "Settings · Homix" };

// Server-side admin gate, same as /roster — this page edits company-wide
// invoice and banking settings and was previously reachable (read-only render)
// by any active agent who typed the URL.
export default async function SettingsPage() {
  const session = await requireActiveAgent();
  if (!session.user.isAdmin) redirect("/");

  return <SettingsConsole />;
}
