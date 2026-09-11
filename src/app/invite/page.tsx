import type { Metadata } from "next";
import { and, eq, inArray, or } from "drizzle-orm";
import { db } from "@/db";
import { agents, teams } from "@/db/schema";
import { requireActiveAgent } from "@/lib/auth-guards";
import { findPersonalReferral } from "@/lib/personal-referral";
import { InviteClient } from "./invite-client";

export const metadata: Metadata = { title: "Invite to join · Homix" };

export default async function InvitePage() {
  const session = await requireActiveAgent();
  const agentId = session.user.agentId;
  const isAdmin = Boolean(session.user.isAdmin);
  const [agent] = agentId ? await db.select({ name: agents.name, status: agents.accountStatus })
    .from(agents).where(eq(agents.id, agentId)).limit(1) : [];
  const canRefer = agent?.status === "active";
  const [referral, teamOptions] = await Promise.all([
    agentId && canRefer ? findPersonalReferral(agentId) : null,
    agentId ? db.select({
      id: teams.id, name: teams.name, companyId: teams.companyId, leaderAgentId: teams.leaderAgentId,
    }).from(teams).where(and(
      inArray(teams.status, ["active", "forming"]),
      isAdmin ? undefined : eq(teams.leaderAgentId, agentId),
    )).orderBy(teams.name) : [],
  ]);
  // Advanced invitations need names and membership only, never agent PII or
  // compensation data. Leaders see candidates from their own teams.
  const sponsorOptions = isAdmin || teamOptions.length ? await db.select({
    id: agents.id, name: agents.name, teamId: agents.teamId,
  }).from(agents).where(and(
    eq(agents.accountStatus, "active"),
    isAdmin ? undefined : or(
      eq(agents.id, agentId!),
      inArray(agents.teamId, teamOptions.map((team) => team.id)),
    ),
  )).orderBy(agents.name) : [];

  return <InviteClient
    name={agent?.name || session.user.name || ""}
    canRefer={canRefer}
    initialPath={referral ? `/join/${referral.token}` : null}
    options={{ isAdmin, agentId: agentId || 0, teams: teamOptions, sponsors: sponsorOptions }}
  />;
}
