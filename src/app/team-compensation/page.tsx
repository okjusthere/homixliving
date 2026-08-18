import type { Metadata } from "next";
import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { teamCompensationConfigs, teams } from "@/db/schema";
import { requireActiveAgent } from "@/lib/auth-guards";
import { getLocale } from "@/lib/i18n";
import { PageHeader } from "@/components/homix/page-kit";
import { TeamCompensationClient } from "./team-compensation-client";

export const metadata: Metadata = { title: "Team compensation · Homix" };

const M = {
  en: {
    eyebrow: "Team leadership",
    title: "Team compensation",
    description: "Publish terms for new agents and the next member anniversary without changing Homix company rules or current-cycle deals.",
  },
  zh: {
    eyebrow: "团队管理",
    title: "团队分佣",
    description: "为新成员及现有成员下一周年发布团队方案，不影响 Homix 公司规则和当前周期成交。",
  },
} as const;

export default async function TeamCompensationPage() {
  const session = await requireActiveAgent();
  const t = M[await getLocale()];
  const teamRows = session.user.isAdmin
    ? await db.select().from(teams).orderBy(teams.name)
    : await db.select().from(teams).where(eq(teams.leaderAgentId, session.user.agentId ?? -1)).orderBy(teams.name);
  const configRows = await db
    .select()
    .from(teamCompensationConfigs)
    .orderBy(desc(teamCompensationConfigs.effectiveFrom), desc(teamCompensationConfigs.version));
  const currentByTeam = new Map<number, (typeof configRows)[number]>();
  const scheduledByTeam = new Map<number, (typeof configRows)[number]>();
  const today = new Date().toISOString().slice(0, 10);
  for (const config of configRows) {
    if (config.effectiveFrom <= today && !currentByTeam.has(config.teamId)) {
      currentByTeam.set(config.teamId, config);
    } else if (config.effectiveFrom > today) {
      // Rows are newest-first; later assignments leave the nearest future
      // effective date in the map.
      scheduledByTeam.set(config.teamId, config);
    }
  }
  return (
    <div className="space-y-7">
      <PageHeader eyebrow={t.eyebrow} title={t.title} description={t.description} />
      <TeamCompensationClient
        teams={teamRows.map((team) => ({
          team,
          config: currentByTeam.get(team.id) || null,
          scheduled: scheduledByTeam.get(team.id) || null,
        }))}
        isAdmin={session.user.isAdmin}
      />
    </div>
  );
}
