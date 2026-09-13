import assert from "node:assert/strict";
import { and, eq } from "drizzle-orm";
import { db, closeDatabaseConnections, pgPool } from "@/db";
import {
  agents,
  onboardingEvents,
  settings,
  teams,
  teamCompensationConfigs,
  teamLeaderApplications,
  licensedCompanies,
} from "@/db/schema";
import {
  prepareOnboardingSigning,
  recoverOnboardingSigning,
} from "@/lib/signing-onboarding";
import { syncOnboardingAgreement } from "@/lib/onboarding-agreement";
import {
  prepareTeamLeaderSigning,
  recoverTeamLeaderSigning,
} from "@/lib/signing-team-leader";
import { syncTeamLeaderAgreement } from "@/lib/team-leader-agreement";
import { claimOnboardingAgreementBatch } from "@/lib/onboarding-agreement-reconciliation";
import { onboardingAgreementAllowsPayment } from "@/lib/onboarding";
import { receiveSigningEvent } from "@/lib/signing-events";
import { randomUUID } from "node:crypto";
import {
  SigningBridgeFixture,
  signingAgent,
  currentAgent,
  requireSigningTestDatabase,
  now,
} from "./signing-fixtures";
const bridge = new SigningBridgeFixture();
async function main() {
  requireSigningTestDatabase();
  bridge.install();
  const first = await signingAgent();
  bridge.failCreateOnce = true;
  await assert.rejects(prepareOnboardingSigning(first));
  const frozen = await currentAgent(first.id);
  assert.ok(frozen.signingPreparation);
  assert.equal(frozen.signingRequestId, null);
  const retries = await Promise.all([
    prepareOnboardingSigning(frozen),
    prepareOnboardingSigning(frozen),
  ]);
  const saved = await currentAgent(first.id);
  assert.equal(bridge.creations, 1);
  assert.equal(bridge.sends, 1);
  assert.ok(
    retries.every((a) => a.signingRequestId === saved.signingRequestId),
  );
  assert.equal(saved.signingPreparation!.id, frozen.signingPreparation!.id);
  const second = await signingAgent();
  bridge.failSendOnce = true;
  await assert.rejects(prepareOnboardingSigning(second));
  assert.ok((await currentAgent(second.id)).signingRequestId);
  const sends = bridge.sends;
  await prepareOnboardingSigning(await currentAgent(second.id));
  assert.equal(bridge.sends, sends);
  const doc = bridge.document(saved),
    owner = doc.recipients.find((r) => r.actor === "owner")!,
    company = doc.recipients.find((r) => r.actor === "company")!;
  company.signingStatus = "SIGNED";
  company.signedAt = now();
  owner.expiresAt = "2020-01-01T00:00:00.000Z";
  assert.equal(
    (await syncOnboardingAgreement(await currentAgent(first.id)))
      .agreementStatus,
    "expired",
  );
  const renewed = await recoverOnboardingSigning(await currentAgent(first.id));
  assert.equal(renewed.signingRequestId, saved.signingRequestId);
  assert.equal(renewed.agreementStatus, "sent");
  assert.ok(company.signedAt);
  owner.signingStatus = "SIGNED";
  owner.signedAt = now();
  company.signingStatus = "NOT_SIGNED";
  company.signedAt = null;
  company.expiresAt = "2020-01-01T00:00:00.000Z";
  let signed = await syncOnboardingAgreement(await currentAgent(first.id));
  assert.equal(signed.agreementStatus, "sent");
  assert.equal(onboardingAgreementAllowsPayment(signed), true);
  assert.equal(signed.agreementCountersignedAt, null);
  bridge.failingRequest = saved.signingRequestId!;
  await assert.rejects(syncOnboardingAgreement(signed));
  assert.equal(
    (await currentAgent(first.id)).agreementAgentSignedAt,
    signed.agreementAgentSignedAt,
  );
  bridge.failingRequest = "";
  doc.status = "CANCELLED";
  await db
    .update(agents)
    .set({ paymentStatus: "paid" })
    .where(eq(agents.id, first.id));
  const replaced = await recoverOnboardingSigning(await currentAgent(first.id));
  assert.notEqual(replaced.signingRequestId, saved.signingRequestId);
  assert.equal(replaced.paymentStatus, "paid");
  assert.equal(replaced.agreementAgentSignedAt, null);
  assert.equal(
    (
      await db
        .select()
        .from(onboardingEvents)
        .where(
          and(
            eq(onboardingEvents.agentId, first.id),
            eq(onboardingEvents.eventType, "documenso_agreement_superseded"),
          ),
        )
    ).length,
    1,
  );
  const oldEvent = {
    id: randomUUID(),
    event: "signing.changed",
    requestId: saved.signingRequestId!,
    ownerAgentId: saved.id,
    scenario: "onboarding",
    occurredAt: now(),
  };
  assert.equal((await receiveSigningEvent(oldEvent)).accepted, true);
  assert.equal((await receiveSigningEvent(oldEvent)).replayed, true);
  await assert.rejects(
    receiveSigningEvent({ ...oldEvent, requestId: randomUUID() }),
    /EVENT_CONFLICT/,
  );
  const currentDoc = bridge.document(replaced);
  currentDoc.recipients[0].signingStatus = "SIGNED";
  currentDoc.recipients[0].signedAt = now();
  await receiveSigningEvent({
    ...oldEvent,
    id: randomUUID(),
    requestId: replaced.signingRequestId!,
  });
  signed = await currentAgent(first.id);
  assert.ok(signed.agreementAgentSignedAt);
  assert.equal(signed.agreementCountersignedAt, null);
  await db
    .update(agents)
    .set({ legalName: "Changed after preparation" })
    .where(eq(agents.id, first.id));
  await assert.rejects(
    prepareOnboardingSigning(await currentAgent(first.id)),
    /ONBOARDING_FACTS_CHANGED/,
  );
  const retired = await signingAgent({
    esignEnvelopeId: "retired-native-task",
    agreementStatus: "completed",
    agreementAgentSignedAt: now(),
  });
  assert.equal(onboardingAgreementAllowsPayment(retired), false);
  assert.ok((await prepareOnboardingSigning(retired)).signingRequestId);
  const member = await signingAgent({ plan: "team_member" });
  await assert.rejects(
    prepareOnboardingSigning(member),
    /TEAM_APPROVAL_REQUIRED/,
  );
  console.log(
    "PASS: frozen concurrent preparation, lost create/send recovery, native renewal preserves signatures, explicit replacement retains payments, authenticated callbacks and old-event fencing",
  );

  await db
    .insert(licensedCompanies)
    .values({
      id: "homix_living",
      legalName: "Homix Living Inc.",
      address: "Synthetic only",
      brokerName: "Synthetic",
      brokerTitle: "Broker",
      brokerEmail: "qa-company@example.invalid",
    })
    .onConflictDoNothing();
  const leader = await signingAgent({
    accountStatus: "active",
    plan: "solo_pro",
    agreementStatus: "completed",
  });
  const [team] = await db
    .insert(teams)
    .values({
      name: `Synthetic ${randomUUID()}`,
      status: "forming",
      companyId: "homix_living",
      leaderAgentId: leader.id,
    })
    .returning();
  const [terms] = await db
    .insert(teamCompensationConfigs)
    .values({
      teamId: team.id,
      version: 1,
      defaultTeamSplitPct: 10,
      teamLeadSplitPct: 20,
      effectiveFrom: "2026-09-12",
    })
    .returning();
  const [application] = await db
    .insert(teamLeaderApplications)
    .values({
      applicantAgentId: leader.id,
      licensedCompany: "homix_living",
      companyId: "homix_living",
      proposedTeamName: team.name,
      expectedMemberCount: 3,
      positioning: "Synthetic only",
      proposedTeamSplitPct: 10,
      status: "approved",
      teamId: team.id,
      teamCompensationConfigId: terms.id,
    })
    .returning();
  const leaderSigned = await prepareTeamLeaderSigning(application);
  assert.ok(leaderSigned.signingRequestId);
  const leaderDoc = bridge.requests.get(leaderSigned.signingRequestId!)!
    .parts[0].document!;
  leaderDoc.recipients[0].expiresAt = "2020-01-01T00:00:00.000Z";
  const leaderRenewed = await recoverTeamLeaderSigning(leaderSigned);
  assert.equal(leaderRenewed.signingRequestId, leaderSigned.signingRequestId);
  leaderDoc.recipients.forEach((r) => {
    r.signingStatus = "SIGNED";
    r.signedAt = now();
  });
  leaderDoc.status = "COMPLETED";
  leaderDoc.completedAt = now();
  assert.equal(
    (await syncTeamLeaderAgreement(leaderRenewed)).agreementStatus,
    "completed",
  );
  console.log(
    "PASS: Team Leader package ownership, forming-team eligibility, same-document renewal and actual completion projection",
  );

  // Isolate the cursor rotation using this run's synthetic queue.
  await pgPool.query(
    "UPDATE portal.agents SET agreement_status='completed' WHERE signing_request_id IS NOT NULL",
  );
  await db
    .delete(settings)
    .where(eq(settings.key, "onboarding_agreement_reconciliation_cursor"));
  const queue = [];
  for (let i = 0; i < 53; i++)
    queue.push(
      await signingAgent({
        signingRequestId: randomUUID(),
        agreementStatus: "sent",
      }),
    );
  const page1 = await claimOnboardingAgreementBatch();
  assert.equal(page1.rows.length, 25);
  const newcomer = await signingAgent({
    signingRequestId: randomUUID(),
    agreementStatus: "sent",
  });
  const page2 = await claimOnboardingAgreementBatch(),
    page3 = await claimOnboardingAgreementBatch();
  assert.equal([...page1.rows, ...page2.rows, ...page3.rows].length, 53);
  assert.equal(page3.cycleComplete, true);
  assert.ok(
    ![...page1.rows, ...page2.rows, ...page3.rows].some(
      (a) => a.id === newcomer.id,
    ),
  );
  const [left, right] = await Promise.all([
    claimOnboardingAgreementBatch(),
    claimOnboardingAgreementBatch(),
  ]);
  assert.ok(!left.rows.some((a) => right.rows.some((b) => b.id === a.id)));
  console.log(
    "PASS: bounded reconciliation pages, stable cycle boundary and non-overlapping concurrent claims",
  );
}
main()
  .finally(async () => {
    bridge.close();
    await closeDatabaseConnections();
  })
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
