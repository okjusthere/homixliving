import type { Metadata } from "next";
import { requireActiveAgent } from "@/lib/auth-guards";
import ExpiredListingsClient from "./expired-listings-client";

export const metadata: Metadata = { title: "Expired Listings · Homix" };

export default async function ExpiredListingsPage() {
  await requireActiveAgent();
  return <ExpiredListingsClient />;
}
