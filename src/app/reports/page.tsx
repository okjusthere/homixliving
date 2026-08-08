import type { Metadata } from "next";
import { requireActiveAgent } from "@/lib/auth-guards";
import ReportsConsole from "./reports-client";

export const metadata: Metadata = { title: "Reports · Homix" };

export default async function ReportsPage() {
  await requireActiveAgent();
  return <ReportsConsole />;
}
