import { sql } from "drizzle-orm";
import { db } from "@/db";

export type DbTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

const DEAL_LOCK_NAMESPACE = 31001;
const AGENT_LEDGER_LOCK_NAMESPACE = 31002;
const TEAM_CONFIGURATION_LOCK_NAMESPACE = 31003;
const ONBOARDING_AGENT_LOCK_NAMESPACE = 31004;

export async function lockCompensationDeal(
  tx: DbTransaction,
  dealType: "rental" | "sale",
  dealId: number,
) {
  const lockId = dealType === "rental" ? dealId : -dealId;
  await tx.execute(sql`SELECT pg_advisory_xact_lock(${DEAL_LOCK_NAMESPACE}, ${lockId})`);
}

export async function lockAgentLedgers(tx: DbTransaction, agentIds: number[]) {
  const ids = [...new Set(agentIds)]
    .filter((id) => Number.isInteger(id) && id > 0)
    .sort((a, b) => a - b);
  for (const id of ids) {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(${AGENT_LEDGER_LOCK_NAMESPACE}, ${id})`);
  }
}

export async function lockTeamConfiguration(tx: DbTransaction, teamId: number) {
  await tx.execute(sql`SELECT pg_advisory_xact_lock(${TEAM_CONFIGURATION_LOCK_NAMESPACE}, ${teamId})`);
}

export async function lockOnboardingAgent(tx: DbTransaction, agentId: number) {
  await tx.execute(sql`SELECT pg_advisory_xact_lock(${ONBOARDING_AGENT_LOCK_NAMESPACE}, ${agentId})`);
}
