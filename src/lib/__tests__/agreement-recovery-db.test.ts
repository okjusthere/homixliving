import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { and, eq, inArray } from "drizzle-orm";
import { db, closeDatabaseConnections } from "@/db";
import { agents, licensedCompanies, onboardingEvents, settings, teams, teamCompensationConfigs, teamJoinRequests, teamLeaderApplications } from "@/db/schema";
import { agentAgreementFieldManifest, teamLeaderAgreementFieldManifest } from "@/lib/onboarding-field-manifests";
import { syncOnboardingAgreement } from "@/lib/onboarding-agreement";
import { syncTeamLeaderAgreement } from "@/lib/team-leader-agreement";
import { claimOnboardingAgreementBatch } from "@/lib/onboarding-agreement-reconciliation";
import { onboardingAgreementAllowsPayment } from "@/lib/onboarding";
import type { ESignEnvelope, ESignTemplate, ESignTemplateField } from "@/lib/esign";

const tag = randomUUID();
const agentIds: number[] = [], teamIds: number[] = [], applicationIds: number[] = [];
const envelopeStore = new Map<string, ESignEnvelope>();
const transactionStore: Array<{ id: string; externalReference: string }> = [];
const sent = new Set<string>();
const observed = new Set<string>();
let creations = 0, failCreateResponse = false, failSendResponse = false;
let failingEnvelope = "";
let safeDatabase = false;
const realFetch = globalThis.fetch;
const cursorKey = "onboarding_agreement_reconciliation_cursor";
const now = () => new Date().toISOString();
type Session = { user: { agentId: number; email: string; accountStatus: string; isAdmin: boolean } } | null;
function session(agent: typeof agents.$inferSelect | null) {
  (globalThis as typeof globalThis & { __agreementTestSession: Session }).__agreementTestSession = agent
    ? { user: { agentId: agent.id, email: agent.email, accountStatus: agent.accountStatus, isAdmin: false } } : null;
}

function fixture(leader: boolean): ESignTemplate {
  const manifest = leader ? teamLeaderAgreementFieldManifest() : agentAgreementFieldManifest("homix_living", null);
  const mergeKeys = leader
    ? "agent_id agent_name agent_email agent_phone license_number licensed_company compensation_plan team_name expected_member_count team_positioning team_split_pct team_sourced_split_pct team_cap_usd team_terms_effective_from team_config_version"
    : "agent_id agent_name agent_email agent_phone license_number licensed_company practice compensation_plan split_pct sponsor_name affiliation_term_months team_name team_split_pct team_sourced_split_pct team_cap_usd team_terms_effective_from";
  const fields: ESignTemplateField[] = manifest.map((f) => ({
    ...f, id: f.fieldKey, label: f.fieldKey, roleId: f.roleKind === "none" ? null : f.roleKind,
    readOnly: f.readOnly ?? false, required: f.required ?? true,
  }));
  for (const key of mergeKeys.split(" ")) if (!fields.some((f) => f.mergeKey === key)) fields.push({
    id: `merge-${key}`, label: key, page: 1, type: "merge", roleId: null,
    readOnly: true, required: false, mergeKey: key,
  });
  const id = leader ? "leader-template" : "agent-template";
  return { id, activeVersionId: `${id}-v1`, versions: [{
    id: `${id}-v1`, schemaHash: `${id}-hash`, status: "PUBLISHED", businessDomain: "HR", jurisdiction: "NY", approvalRequired: false,
    documents: [{ id: "test-doc", pageCount: leader ? 7 : 18 }],
    roles: [{ id: "signer", name: "Applicant", kind: "signer" }, { id: "countersigner", name: "Broker", kind: "countersigner" }], fields,
  }] };
}

const templates = [fixture(false), fixture(true)];
function configure() {
  process.env.ESIGN_API_URL = "http://esign-recovery.example.invalid";
  process.env.ESIGN_APPLICATION_KEY = "isolated-recovery-key";
  process.env.RESEND_API_KEY = "";
  process.env.CRON_SECRET = "isolated-recovery-cron";
  for (const suffix of ["SOLO", "SOLO_PRO", "TEAM_MEMBER"]) {
    const prefix = `ESIGN_ONBOARDING_HOMIX_LIVING_${suffix}`;
    process.env[`${prefix}_TEMPLATE_ID`] = templates[0].id;
    process.env[`${prefix}_TEMPLATE_VERSION_ID`] = templates[0].activeVersionId;
    process.env[`${prefix}_TEMPLATE_SCHEMA_HASH`] = templates[0].versions[0].schemaHash;
  }
  for (const prefix of ["ESIGN_ONBOARDING_HOMIX_LIVING", "ESIGN_TEAM_LEADER_HOMIX_LIVING"]) {
    process.env[`${prefix}_COUNTERSIGNER_NAME`] = "Test Broker";
    process.env[`${prefix}_COUNTERSIGNER_EMAIL`] = "broker@example.invalid";
  }
  process.env.ESIGN_TEAM_LEADER_HOMIX_LIVING_TEMPLATE_ID = templates[1].id;
  process.env.ESIGN_TEAM_LEADER_HOMIX_LIVING_TEMPLATE_VERSION_ID = templates[1].activeVersionId;
  process.env.ESIGN_TEAM_LEADER_HOMIX_LIVING_TEMPLATE_SCHEMA_HASH = templates[1].versions[0].schemaHash;
}

function mockESign() {
  globalThis.fetch = async (input, init) => {
    const url = new URL(String(input));
    assert.equal(url.origin, process.env.ESIGN_API_URL, "No real outbound requests in this test");
    const method = init?.method || "GET";
    const path = url.pathname;
    const body = init?.body ? JSON.parse(String(init.body)) : {};
    const ok = (data: unknown) => Response.json({ data });
    const error = (status: number, message: string) => Response.json({ error: { message } }, { status });
    if (path.startsWith("/v1/templates/")) return ok(templates.find((t) => t.id === path.split("/").at(-1)));
    if (path === "/v1/transactions") {
      if (method === "GET") return ok(transactionStore);
      if (transactionStore.some((t) => t.externalReference === body.externalReference)) return error(409, "Duplicate reference");
      const tx = { id: randomUUID(), externalReference: body.externalReference }; transactionStore.push(tx); return ok(tx);
    }
    if (path === "/v1/envelopes") {
      if (method === "GET") return ok([...envelopeStore.values()]);
      if ([...envelopeStore.values()].some((e) => e.externalReference === body.externalReference)) return error(409, "Duplicate reference");
      creations++;
      const envelope: ESignEnvelope = {
        id: randomUUID(), transactionId: body.transactionId, templateVersionId: body.expectedTemplateVersionId,
        externalReference: body.externalReference, expiresAt: body.expiresAt, status: "DRAFT",
        recipients: body.recipients.map((r: { roleId: string; name: string; email: string }) => ({ ...r, id: randomUUID(), kind: r.roleId, status: "PENDING" })),
      };
      envelopeStore.set(envelope.id, envelope);
      if (failCreateResponse) { failCreateResponse = false; throw new Error("Simulated lost create response"); }
      return ok(envelope);
    }
    const id = path.split("/")[3];
    const envelope = envelopeStore.get(id);
    if (!envelope) return error(404, "Unknown test envelope");
    if (method === "GET" && path.endsWith("/evidence")) return ok({ id: `evidence-${id}`, verificationStatus: "VERIFIED" });
    if (method === "GET") {
      observed.add(id);
      if (id === failingEnvelope) return error(503, "One envelope is temporarily unavailable");
      return ok(envelope);
    }
    if (path.endsWith("/void")) {
      assert.notEqual(envelope.status, "COMPLETED", "A completed contract cannot be voided");
      envelope.status = "VOIDED"; return ok(envelope);
    }
    if (path.endsWith("/send")) {
      assert.ok(["DRAFT", "PREPARED", "READY_TO_SEND", "SENT"].includes(envelope.status), "A terminated envelope cannot be sent");
      envelope.status = "SENT"; sent.add(id);
      if (failSendResponse) { failSendResponse = false; throw new Error("Simulated lost send response"); }
      return ok({ envelope, replayed: false });
    }
    throw new Error(`Unexpected eSign operation: ${method} ${path}`);
  };
}

async function addAgent(overrides: Partial<typeof agents.$inferInsert> = {}) {
  const [agent] = await db.insert(agents).values({
    name: "Recovery Test", email: `${randomUUID()}@example.invalid`, accountStatus: "pending",
    licensedCompany: "homix_living", licensedCompanyId: "homix_living", plan: "solo", onboardingCompletedAt: now(),
    ...overrides,
  }).returning(); agentIds.push(agent.id); return agent;
}
async function current(id: number) { return (await db.select().from(agents).where(eq(agents.id, id)))[0]; }
async function oldEnvelope(status: ESignEnvelope["status"], overrides: Partial<typeof agents.$inferInsert> = {}, expired = false) {
  const id = randomUUID();
  const envelope: ESignEnvelope = { id, status, templateVersionId: "agent-template-v1", expiresAt: new Date(Date.now() + (expired ? -1 : 1) * 86400000).toISOString(), recipients: [] };
  envelopeStore.set(id, envelope);
  const agreementStatus = status === "DECLINED" ? "declined" : status === "VOIDED" ? "voided" : status === "EXPIRED" ? "expired" : status === "FAILED_FINALIZATION" ? "failed" : status === "COMPLETED" ? "completed" : "sent";
  return addAgent({ esignEnvelopeId: id, esignTemplateVersionId: envelope.templateVersionId, agreementStatus, onboardingStage: "agreement", ...overrides });
}

async function main() {
  const url = new URL(process.env.DATABASE_URL || "");
  assert.ok(["localhost", "127.0.0.1"].includes(url.hostname), "Local DB only");
  assert.ok(url.pathname.includes("agreement_recovery"), "Use a dedicated agreement_recovery test database");
  assert.equal((await db.select({ id: agents.id }).from(agents).limit(1)).length, 0, "Dedicated DB must have no agents");
  safeDatabase = true;
  configure(); mockESign();
  const onboarding = await import("@/app/api/onboarding/agreement/route");
  const leader = await import("@/app/api/team-leader-applications/[id]/agreement/route");
  const cron = await import("@/app/api/cron/onboarding-agreements/route");
  await db.insert(licensedCompanies).values({ id: "homix_living", legalName: "Homix Living Inc.", address: "Test", brokerName: "Test", brokerTitle: "Broker", brokerEmail: "broker@example.invalid" }).onConflictDoNothing();
  session(null);
  assert.equal((await onboarding.POST()).status, 401);
  assert.equal((await cron.GET(new Request("http://localhost/api/cron/onboarding-agreements"))).status, 401);
  for (const status of ["DECLINED", "VOIDED", "EXPIRED"] as const) {
    const agent = await oldEnvelope(status, { paymentStatus: "paid", agreementAgentSignedAt: now(), agreementCountersignedAt: now(), esignEvidencePackageId: "old-evidence" });
    session(agent); const before = creations;
    const responses = await Promise.all(Array.from({ length: 4 }, () => onboarding.POST()));
    assert.ok(responses.some((r) => r.status === 200), JSON.stringify(await Promise.all(responses.map(async (r) => ({status:r.status, body:await r.clone().json()})))));
    assert.ok(responses.every((r) => [200, 409].includes(r.status)), JSON.stringify(await Promise.all(responses.map((r) => r.json()))));
    assert.equal(creations, before + 1, `${status}: concurrent clicks create one replacement`);
    const fresh = await current(agent.id);
    assert.notEqual(fresh.esignEnvelopeId, agent.esignEnvelopeId);
    assert.equal(fresh.agreementStatus, "sent");
    assert.equal(fresh.paymentStatus, "paid");
    assert.equal(fresh.agreementAgentSignedAt, null);
    assert.equal(fresh.agreementCountersignedAt, null);
    assert.equal(fresh.esignEvidencePackageId, null);
    assert.equal(onboardingAgreementAllowsPayment(fresh), false);
    assert.equal(envelopeStore.get(agent.esignEnvelopeId!)?.status, status);
    const history = await db.select().from(onboardingEvents).where(and(eq(onboardingEvents.agentId, agent.id), eq(onboardingEvents.eventType, "agreement_attempt_started")));
    assert.equal(history.length, 1);
    assert.equal((history[0].detail?.previous as Record<string, unknown>).envelopeId, agent.esignEnvelopeId);
    // Both unchanged and advanced responses for the old envelope are ignored.
    assert.equal((await syncOnboardingAgreement(agent)).esignEnvelopeId, fresh.esignEnvelopeId);
    envelopeStore.get(agent.esignEnvelopeId!)!.status = "COMPLETED";
    const stale = await syncOnboardingAgreement(agent);
    assert.equal(stale.esignEnvelopeId, fresh.esignEnvelopeId);
    assert.equal(stale.agreementStatus, "sent");
    assert.equal(stale.esignEvidencePackageId, null);
  }
  console.log("PASS: declined/voided/expired recovery, concurrency, audit history, payment retention and stale sync protection");

  const expired = await oldEnvelope("SENT", {}, true); session(expired);
  assert.equal((await onboarding.POST()).status, 200);
  assert.equal(envelopeStore.get(expired.esignEnvelopeId!)?.status, "VOIDED", "Expired links are closed before replacement");
  const failed = await oldEnvelope("FAILED_FINALIZATION", { agreementAgentSignedAt: now() }); session(failed);
  const beforeFailed = creations;
  assert.equal((await onboarding.POST()).status, 409);
  assert.equal((await current(failed.id)).esignEnvelopeId, failed.esignEnvelopeId);
  assert.equal(creations, beforeFailed, "PDF failure must not discard signed evidence or trigger re-signing");

  const lost = await oldEnvelope("DECLINED"); session(lost); failCreateResponse = true;
  const beforeLost = creations;
  assert.equal((await onboarding.POST()).status, 502);
  const uncertain = await current(lost.id);
  assert.equal(uncertain.agreementStatus, "preparing");
  assert.equal(uncertain.esignEnvelopeId, null);
  assert.equal((await onboarding.POST()).status, 200);
  assert.equal(creations, beforeLost + 1, "Lost creation response reuses the existing remote envelope");
  const sendLost = await oldEnvelope("VOIDED"); session(sendLost); failSendResponse = true;
  assert.equal((await onboarding.POST()).status, 502);
  const beforeSendRetry = creations;
  assert.equal((await onboarding.POST()).status, 200);
  assert.equal(creations, beforeSendRetry);
  console.log("PASS: clock expiry, finalization preservation, lost creation response and lost send response");

  const owner = await addAgent({ accountStatus: "active", plan: "solo_pro", agreementStatus: "completed" });
  const [team] = await db.insert(teams).values({ name: `Recovery ${tag}`, companyId: "homix_living", leaderAgentId: owner.id, status: "forming" }).returning(); teamIds.push(team.id);
  const [terms] = await db.insert(teamCompensationConfigs).values({ teamId: team.id, version: 1, effectiveFrom: "2026-09-01", defaultTeamSplitPct: 10, teamLeadSplitPct: 20 }).returning();
  const member = await oldEnvelope("DECLINED", { plan: "team_member", teamId: team.id, teamTermsConfigId: terms.id, teamTermsAcceptedAt: now(), referredByAgentId: owner.id });
  session(member); assert.equal((await onboarding.POST()).status, 409, "Recovery still requires Team Leader approval");
  await db.insert(teamJoinRequests).values({ agentId: member.id, teamId: team.id, status: "accepted", acceptedConfigId: terms.id });
  assert.equal((await onboarding.POST()).status, 200);
  const memberAfter = await current(member.id);
  assert.equal(memberAfter.referredByAgentId, owner.id); assert.equal(memberAfter.teamTermsConfigId, terms.id); assert.equal(memberAfter.teamTermsAcceptedAt, null);
  const leaderEnvelopeId = randomUUID();
  envelopeStore.set(leaderEnvelopeId, { id: leaderEnvelopeId, templateVersionId: "leader-template-v1", status: "DECLINED" });
  const [application] = await db.insert(teamLeaderApplications).values({ applicantAgentId: owner.id, licensedCompany: "homix_living", companyId: "homix_living", proposedTeamName: team.name, expectedMemberCount: 3, positioning: "Test", proposedTeamSplitPct: 10, status: "approved", teamId: team.id, teamCompensationConfigId: terms.id, agreementStatus: "declined", esignEnvelopeId: leaderEnvelopeId, esignTemplateVersionId: "leader-template-v1" }).returning(); applicationIds.push(application.id);
  const context = { params: Promise.resolve({ id: String(application.id) }) };
  const outsider = await addAgent({ accountStatus: "active" }); session(outsider);
  assert.equal((await leader.POST(new Request("http://localhost"), context))!.status, 404);
  session(owner);
  assert.equal((await leader.POST(new Request("http://localhost"), context))!.status, 200);
  const [leaderAfter] = await db.select().from(teamLeaderApplications).where(eq(teamLeaderApplications.id, application.id));
  assert.notEqual(leaderAfter.esignEnvelopeId, application.esignEnvelopeId);
  assert.equal(leaderAfter.agreementStatus, "sent");
  envelopeStore.get(leaderEnvelopeId)!.status = "COMPLETED";
  assert.equal((await syncTeamLeaderAgreement(application, "homix_living")).esignEnvelopeId, leaderAfter.esignEnvelopeId);
  console.log("PASS: team approval and sponsor preservation, Team Leader replacement, ownership and old-envelope fencing");

  await db.update(agents).set({ agreementStatus: "completed" }).where(inArray(agents.id, agentIds));
  await db.delete(settings).where(eq(settings.key, cursorKey));
  const queue: Array<typeof agents.$inferSelect> = [];
  for (let i = 0; i < 103; i++) queue.push(await oldEnvelope(i === 102 ? "COMPLETED" : "SENT"));
  await db.update(agents).set({ agreementStatus: "sent" }).where(eq(agents.id, queue[102].id));
  failingEnvelope = queue[0].esignEnvelopeId!; observed.clear();
  const callCron = () => cron.GET(new Request("http://localhost/api/cron/onboarding-agreements", { headers: { authorization: `Bearer ${process.env.CRON_SECRET}` } }));
  const firstPage = await claimOnboardingAgreementBatch(); assert.equal(firstPage.rows.length, 25);
  const newcomer = await oldEnvelope("SENT");
  const cycle = [...firstPage.rows];
  let page = firstPage;
  while (!page.cycleComplete) { page = await claimOnboardingAgreementBatch(); cycle.push(...page.rows); }
  assert.equal(cycle.length, 103);
  assert.equal(cycle.some((a) => a.id === newcomer.id), false, "New arrivals do not extend the current cycle");
  await db.delete(settings).where(eq(settings.key, cursorKey)); observed.clear();
  const result = await callCron(); const report = await result.json();
  assert.equal(result.status, 500); assert.equal(report.scanned, 104); assert.equal(report.completed, 1); assert.equal(report.hasMore, false);
  assert.ok(queue.every((a) => observed.has(a.esignEnvelopeId!)), "All 103 original records reached in one run despite the first failure");
  assert.ok(observed.has(newcomer.esignEnvelopeId!));
  assert.equal((await current(queue[102].id)).agreementStatus, "completed");
  const [left, right] = await Promise.all([claimOnboardingAgreementBatch(), claimOnboardingAgreementBatch()]);
  assert.equal(left.rows.filter((a) => right.rows.some((b) => b.id === a.id)).length, 0, "Concurrent cron claims do not select the same page");
  assert.ok(left.rows.some((a) => a.id === queue[0].id), "Failed records retry after wrap-around");
  console.log("PASS: 103-envelope keyset rotation, single-envelope failure isolation, verified tail completion, fixed cycle boundary and concurrent claims");
}

main().finally(async () => {
  globalThis.fetch = realFetch; session(null);
  if (!safeDatabase) {
    await closeDatabaseConnections();
    return;
  }
  if (applicationIds.length) await db.delete(teamLeaderApplications).where(inArray(teamLeaderApplications.id, applicationIds));
  if (agentIds.length) {
    await db.delete(onboardingEvents).where(inArray(onboardingEvents.agentId, agentIds));
    await db.delete(teamJoinRequests).where(inArray(teamJoinRequests.agentId, agentIds));
    await db.update(agents).set({ teamId: null, teamTermsConfigId: null, referredByAgentId: null }).where(inArray(agents.id, agentIds));
  }
  if (teamIds.length) { await db.delete(teamCompensationConfigs).where(inArray(teamCompensationConfigs.teamId, teamIds)); await db.delete(teams).where(inArray(teams.id, teamIds)); }
  if (agentIds.length) await db.delete(agents).where(inArray(agents.id, agentIds));
  await db.delete(settings).where(eq(settings.key, cursorKey));
  await closeDatabaseConnections();
});
