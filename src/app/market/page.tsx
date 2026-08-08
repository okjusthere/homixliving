import type { Metadata } from "next";
import { requireActiveAgent } from "@/lib/auth-guards";
import MarketClient from "./market-client";

export const metadata: Metadata = { title: "Market Overview · Homix" };

export default async function MarketPage() {
  await requireActiveAgent();
  return <MarketClient />;
}
