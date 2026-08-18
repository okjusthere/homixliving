import { and, desc, eq, gte, isNull, lt, lte, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  agents,
  dealCompensationAllocations,
  dealCompensationSnapshots,
  teamCompensationConfigs,
  teams,
} from "@/db/schema";
import {
  computeCompensationV31,
  type CompensationResult,
  type CompensationSource,
} from "@/lib/compensation-v31";
import { normalizeAgentPlan } from "@/lib/agent-plans";
import { teamTermsSelection } from "@/lib/team-terms";

type ParticipantFact = { agentId: number; sharePct: number };
type DbTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

const VALID_SOURCES = new Set<CompensationSource>([
  "self",
  "team",
  "homix_rental",
  "homix_sales",
  "outside",
]);

export function normalizeCompensationSource(value: unknown, dealType: "rental" | "sale"): CompensationSource {
  const source = String(value || "self") as CompensationSource;
  if (!VALID_SOURCES.has(source)) return "self";
  if (source === "homix_rental" && dealType !== "rental") return "self";
  if (source === "homix_sales" && dealType !== "sale") return "self";
  return source;
}

export async function buildCompensationEstimate(input: {
  dealType: "rental" | "sale";
  effectiveDate: string;
  grossCommission: number;
  source: CompensationSource;
  outsideReferralAmount?: number;
  rebateAmount?: number;
  participants: ParticipantFact[];
}): Promise<CompensationResult> {
  const agentRows = await Promise.all(
    input.participants.map((participant) =>
      db.select().from(agents).where(eq(agents.id, participant.agentId)).then((rows) => rows[0]),
    ),
  );

  const enriched = await Promise.all(input.participants.map(async (participant, index) => {
    const agent = agentRows[index];
    if (!agent) throw new Error(`Agent ${participant.agentId} not found`);
    const plan = normalizeAgentPlan(agent.plan);
    const terms = teamTermsSelection({
      effectiveDate: input.effectiveDate,
      anniversaryStart: agent.anniversaryStart,
      joinedAt: agent.joinedAt,
      frozenConfigId: agent.teamTermsConfigId,
      frozenEffectiveFrom: agent.teamTermsEffectiveFrom,
    });
    const { window } = terms;
    const [companyUsage] = await db
      .select({ amount: sql<number>`coalesce(sum(${dealCompensationAllocations.companyCapCredit}), 0)` })
      .from(dealCompensationAllocations)
      .innerJoin(
        dealCompensationSnapshots,
        eq(dealCompensationAllocations.snapshotId, dealCompensationSnapshots.id),
      )
      .where(and(
        eq(dealCompensationAllocations.agentId, agent.id),
        eq(dealCompensationSnapshots.status, "finalized"),
        gte(dealCompensationSnapshots.effectiveDate, window.start),
        lt(dealCompensationSnapshots.effectiveDate, window.end),
      ));

    let teamConfig: typeof teamCompensationConfigs.$inferSelect | null = null;
    let leaderAgentId: number | null = null;
    let teamCapUsed = 0;
    if (agent.teamId) {
      if (terms.frozenConfigId) {
        teamConfig = await db
          .select()
          .from(teamCompensationConfigs)
          .where(and(
            eq(teamCompensationConfigs.id, terms.frozenConfigId),
            eq(teamCompensationConfigs.teamId, agent.teamId),
          ))
          .limit(1)
          .then((rows) => rows[0] || null);
      }
      if (!teamConfig) {
        teamConfig = await db
          .select()
          .from(teamCompensationConfigs)
          .where(and(
            eq(teamCompensationConfigs.teamId, agent.teamId),
            lte(teamCompensationConfigs.effectiveFrom, terms.configCutoff),
          ))
          .orderBy(desc(teamCompensationConfigs.effectiveFrom), desc(teamCompensationConfigs.version))
          .limit(1)
          .then((rows) => rows[0] || null);
      }
      const team = await db.select().from(teams).where(eq(teams.id, agent.teamId)).then((rows) => rows[0]);
      leaderAgentId = team?.leaderAgentId || null;
      if (teamConfig?.teamCapCents) {
        const [teamUsage] = await db
          .select({ amount: sql<number>`coalesce(sum(${dealCompensationAllocations.teamCapCredit}), 0)` })
          .from(dealCompensationAllocations)
          .innerJoin(
            dealCompensationSnapshots,
            eq(dealCompensationAllocations.snapshotId, dealCompensationSnapshots.id),
          )
          .where(and(
            eq(dealCompensationAllocations.agentId, agent.id),
            eq(dealCompensationAllocations.teamId, agent.teamId),
            eq(dealCompensationSnapshots.status, "finalized"),
            gte(dealCompensationSnapshots.effectiveDate, window.start),
            lt(dealCompensationSnapshots.effectiveDate, window.end),
          ));
        teamCapUsed = Number(teamUsage?.amount || 0);
      }
    }

    return {
      agentId: agent.id,
      sharePct: participant.sharePct,
      plan,
      companyCapUsed: Number(companyUsage?.amount || 0),
      teamId: agent.teamId,
      teamConfigId: teamConfig?.id || null,
      teamLeaderAgentId: leaderAgentId,
      sponsorAgentId: agent.referredByAgentId,
      teamSplitPct: input.source === "team"
        ? teamConfig?.teamLeadSplitPct ?? 10
        : teamConfig?.defaultTeamSplitPct ?? 10,
      teamCapAmount: teamConfig?.teamCapCents == null ? null : teamConfig.teamCapCents / 100,
      teamCapUsed,
    };
  }));

  return computeCompensationV31({
    dealType: input.dealType,
    grossCommission: input.grossCommission,
    source: input.source,
    outsideReferralAmount: input.outsideReferralAmount,
    rebateAmount: input.rebateAmount,
    participants: enriched,
  });
}

export async function persistCompensationSnapshot(
  tx: DbTransaction,
  input: {
    dealType: "rental" | "sale";
    dealId: number;
    effectiveDate: string;
    result: CompensationResult;
  },
) {
  const now = new Date().toISOString();
  const [current] = await tx
    .select({ status: dealCompensationSnapshots.status })
    .from(dealCompensationSnapshots)
    .where(and(
      eq(dealCompensationSnapshots.dealType, input.dealType),
      eq(dealCompensationSnapshots.dealId, input.dealId),
      isNull(dealCompensationSnapshots.supersededAt),
    ))
    .limit(1);
  if (current?.status === "finalized") {
    throw new Error("Finalized compensation cannot be edited; create a linked correction instead");
  }
  await tx
    .update(dealCompensationSnapshots)
    .set({ supersededAt: now })
    .where(and(
      eq(dealCompensationSnapshots.dealType, input.dealType),
      eq(dealCompensationSnapshots.dealId, input.dealId),
      isNull(dealCompensationSnapshots.supersededAt),
    ));
  const [latest] = await tx
    .select({ version: dealCompensationSnapshots.version })
    .from(dealCompensationSnapshots)
    .where(and(
      eq(dealCompensationSnapshots.dealType, input.dealType),
      eq(dealCompensationSnapshots.dealId, input.dealId),
    ))
    .orderBy(desc(dealCompensationSnapshots.version))
    .limit(1);
  const [snapshot] = await tx.insert(dealCompensationSnapshots).values({
    dealType: input.dealType,
    dealId: input.dealId,
    version: Number(latest?.version || 0) + 1,
    status: "estimated",
    effectiveDate: input.effectiveDate,
    grossCommission: input.result.grossCommission,
    sourceType: input.result.source,
    sourceFee: input.result.sourceFee,
    outsideReferral: input.result.outsideReferral,
    commissionBase: input.result.commissionBase,
    companyDollar: input.result.companyDollar,
    teamAllocation: input.result.teamAllocation,
    transactionFee: input.result.transactionFee,
    rebateAmount: input.result.rebateAmount,
    sponsorAmount: input.result.sponsorAmount,
    agentNetTotal: input.result.agentNetTotal,
    homixRetained: input.result.homixRetained,
    policyVersion: input.result.policyVersion,
    configuration: { source: input.result.source },
    createdAt: now,
  }).returning();
  if (input.result.allocations.length) {
    await tx.insert(dealCompensationAllocations).values(input.result.allocations.map((row) => ({
      snapshotId: snapshot.id,
      agentId: row.agentId,
      sharePct: row.sharePct,
      plan: row.plan,
      teamId: row.teamId || null,
      teamConfigId: row.teamConfigId || null,
      teamLeaderAgentId: row.teamLeaderAgentId || null,
      sponsorAgentId: row.sponsorAgentId || null,
      grossShare: row.grossShare,
      companyDollar: row.companyDollar,
      companyCapCredit: row.companyCapCredit,
      teamLeaderAllocation: row.teamLeaderAllocation,
      teamCapCredit: row.teamCapCredit,
      transactionFee: row.transactionFee,
      rebateAmount: row.rebateAmount,
      sponsorAmount: row.sponsorAmount,
      agentNet: row.agentNet,
      createdAt: now,
    })));
  }
  return snapshot;
}
