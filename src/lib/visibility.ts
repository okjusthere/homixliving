import { sql, and, eq } from "drizzle-orm";
import { db } from "@/db";
import { agents, dealAgents, deals, saleDealAgents, saleDeals, teams } from "@/db/schema";

type AccessSession = {
  user: {
    agentId: number | null;
    isAdmin: boolean;
    isActive: boolean;
  };
};

/**
 * SQL fragment for WHERE clauses on deal-list queries.
 * Returns undefined for admins (no filter, sees all).
 * Otherwise returns the 2-clause OR (self + team-leader read).
 */
export function dealsVisibleToSql(session: AccessSession) {
  if (session.user.isAdmin) return undefined;
  if (!session.user.isActive) return sql`1 = 0`;
  const me = session.user.agentId;
  if (me == null) return sql`1 = 0`;
  return sql`(
    ${deals.id} IN (
      SELECT ${dealAgents.dealId} FROM ${dealAgents}
      WHERE ${dealAgents.agentId} = ${me}
    )
    OR ${deals.id} IN (
      SELECT ${dealAgents.dealId}
      FROM ${dealAgents}
      JOIN ${agents} ON ${agents.id} = ${dealAgents.agentId}
      JOIN ${teams} ON ${teams.id} = ${agents.teamId}
      WHERE ${teams.leaderAgentId} = ${me}
    )
  )`;
}

/**
 * Boolean check for reading a single deal.
 * Admin, personal participant, or leader of a participant's team can read.
 */
export async function canViewDeal(
  session: AccessSession,
  dealId: number,
): Promise<boolean> {
  if (session.user.isAdmin) return true;
  if (!session.user.isActive) return false;
  const me = session.user.agentId;
  if (me == null) return false;

  const selfRow = await db
    .select({ id: dealAgents.dealId })
    .from(dealAgents)
    .where(and(eq(dealAgents.dealId, dealId), eq(dealAgents.agentId, me)))
    .get();
  if (selfRow) return true;

  const leaderRow = await db
    .select({ id: dealAgents.dealId })
    .from(dealAgents)
    .innerJoin(agents, eq(agents.id, dealAgents.agentId))
    .innerJoin(teams, eq(teams.id, agents.teamId))
    .where(and(eq(dealAgents.dealId, dealId), eq(teams.leaderAgentId, me)))
    .get();
  return !!leaderRow;
}

/**
 * Boolean check for mutating a single deal.
 * Team-leader read access does not grant write.
 */
export async function canEditDeal(
  session: AccessSession,
  dealId: number,
): Promise<boolean> {
  if (session.user.isAdmin) return true;
  if (!session.user.isActive) return false;
  const me = session.user.agentId;
  if (me == null) return false;
  const row = await db
    .select({ id: dealAgents.dealId })
    .from(dealAgents)
    .where(and(eq(dealAgents.dealId, dealId), eq(dealAgents.agentId, me)))
    .get();
  return !!row;
}

/**
 * SQL fragment for WHERE clauses on sale-deal list queries.
 * Mirrors Rental deal visibility: admins see all; agents see their own sales;
 * team leaders can read sales where a team member participates.
 */
export function saleDealsVisibleToSql(session: AccessSession) {
  if (session.user.isAdmin) return undefined;
  if (!session.user.isActive) return sql`1 = 0`;
  const me = session.user.agentId;
  if (me == null) return sql`1 = 0`;
  return sql`(
    ${saleDeals.id} IN (
      SELECT ${saleDealAgents.saleDealId} FROM ${saleDealAgents}
      WHERE ${saleDealAgents.agentId} = ${me}
    )
    OR ${saleDeals.id} IN (
      SELECT ${saleDealAgents.saleDealId}
      FROM ${saleDealAgents}
      JOIN ${agents} ON ${agents.id} = ${saleDealAgents.agentId}
      JOIN ${teams} ON ${teams.id} = ${agents.teamId}
      WHERE ${teams.leaderAgentId} = ${me}
    )
  )`;
}

export async function canViewSaleDeal(
  session: AccessSession,
  saleDealId: number,
): Promise<boolean> {
  if (session.user.isAdmin) return true;
  if (!session.user.isActive) return false;
  const me = session.user.agentId;
  if (me == null) return false;

  const selfRow = await db
    .select({ id: saleDealAgents.saleDealId })
    .from(saleDealAgents)
    .where(and(eq(saleDealAgents.saleDealId, saleDealId), eq(saleDealAgents.agentId, me)))
    .get();
  if (selfRow) return true;

  const leaderRow = await db
    .select({ id: saleDealAgents.saleDealId })
    .from(saleDealAgents)
    .innerJoin(agents, eq(agents.id, saleDealAgents.agentId))
    .innerJoin(teams, eq(teams.id, agents.teamId))
    .where(and(eq(saleDealAgents.saleDealId, saleDealId), eq(teams.leaderAgentId, me)))
    .get();
  return !!leaderRow;
}

export async function canEditSaleDeal(
  session: AccessSession,
  saleDealId: number,
): Promise<boolean> {
  if (session.user.isAdmin) return true;
  if (!session.user.isActive) return false;
  const me = session.user.agentId;
  if (me == null) return false;
  const row = await db
    .select({ id: saleDealAgents.saleDealId })
    .from(saleDealAgents)
    .where(and(eq(saleDealAgents.saleDealId, saleDealId), eq(saleDealAgents.agentId, me)))
    .get();
  return !!row;
}
