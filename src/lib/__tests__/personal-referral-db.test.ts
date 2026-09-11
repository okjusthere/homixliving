import assert from "node:assert/strict";
import { and, eq, inArray } from "drizzle-orm";
import { agents, onboardingInvitations } from "@/db/schema";
import { db, closeDatabaseConnections } from "@/db";
import { findPersonalReferral, getOrCreatePersonalReferral } from "../personal-referral";
import { createInviteToken, findUsableInvitation, hashInviteToken } from "../onboarding-invites";

async function main() {
  const url = new URL(process.env.DATABASE_URL || "postgres://postgres@localhost:5499/homixliving");
  assert.ok(["localhost", "127.0.0.1"].includes(url.hostname), "This integration test only runs against local Postgres.");
  process.env.AUTH_SECRET = "isolated-referral-integration-test-secret";
  const createdAgents = await db.insert(agents).values([
    { name: "Referral integration sponsor", email: `referral-${Date.now()}@example.invalid`, accountStatus: "active" },
    { name: "Referral integration pending", email: `pending-${Date.now()}@example.invalid`, accountStatus: "pending" },
  ]).returning({ id: agents.id });
  const [sponsor, pending] = createdAgents;
  try {
    assert.equal(await getOrCreatePersonalReferral(pending.id), null);
    assert.equal(await findPersonalReferral(sponsor.id), null);
    const simultaneous = await Promise.all(Array.from({ length: 4 }, () => getOrCreatePersonalReferral(sponsor.id)));
    assert.ok(simultaneous[0]);
    assert.equal(new Set(simultaneous.map((link) => link?.token)).size, 1, "concurrent requests reuse one link");
    const original = simultaneous[0];
    assert.deepEqual(await findPersonalReferral(sponsor.id), original, "link can be retrieved on a later visit");
    assert.equal(await findPersonalReferral(pending.id), null, "another agent cannot retrieve the sponsor's link");
    const invite = await findUsableInvitation(original.token);
    assert.ok(invite);
    assert.equal(invite.sponsorAgentId, sponsor.id);
    assert.equal(invite.lockSponsor, true);
    assert.equal(invite.lockPlan || invite.lockTeam || invite.lockCompany || invite.lockTerm, false);
    assert.equal(invite.email, null);
    assert.equal(invite.teamId, null);
    assert.equal(invite.companyId, null);
    await db.update(onboardingInvitations).set({ useCount: 101 }).where(eq(onboardingInvitations.id, original.id));
    assert.ok(await findUsableInvitation(original.token), "standing links remain usable after 100 applications");
    assert.equal(await findUsableInvitation(original.token.slice(0, -1) + "!"), null);
    await db.update(onboardingInvitations).set({ revokedAt: new Date().toISOString() }).where(eq(onboardingInvitations.id, original.id));
    assert.equal(await findUsableInvitation(original.token), null);
    const replacement = await getOrCreatePersonalReferral(sponsor.id);
    assert.ok(replacement);
    assert.notEqual(replacement.token, original.token, "revoked links cannot be revived by regenerating");

    const legacyToken = createInviteToken();
    await db.insert(onboardingInvitations).values({ tokenHash: hashInviteToken(legacyToken),
      kind: "personal_referral", sponsorAgentId: sponsor.id, createdByAgentId: sponsor.id,
      expiresAt: new Date(Date.now() + 86400000).toISOString(), maxUses: 1 });
    assert.ok(await findUsableInvitation(legacyToken), "legacy invitations stay usable");
    const live = await db.select().from(onboardingInvitations).where(and(eq(onboardingInvitations.createdByAgentId, sponsor.id), eq(onboardingInvitations.id, replacement.id)));
    assert.equal(live.length, 1);
    console.log("personal referral database integration tests passed");
  } finally {
    await db.delete(onboardingInvitations).where(eq(onboardingInvitations.createdByAgentId, sponsor.id));
    await db.delete(agents).where(inArray(agents.id, createdAgents.map((agent) => agent.id)));
  }
}

main().finally(closeDatabaseConnections);
