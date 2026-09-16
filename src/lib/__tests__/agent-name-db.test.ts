// Real local PostgreSQL; all website/signing requests stay inside test fixtures.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { NextRequest } from "next/server";
import { db, closeDatabaseConnections } from "@/db";
import { onboardingInvitations } from "@/db/schema";
import { PUT as saveAgentBase } from "@/app/api/agents/route";
import { GET as readOnboarding, PUT as saveOnboarding } from "@/app/api/onboarding/profile/route";
import { loadBrand } from "@/lib/content/brand";
import { prepareOnboardingSigning } from "@/lib/signing-onboarding";
import { SigningBridgeFixture, currentAgent, requireSigningTestDatabase, session, signingAgent } from "./signing-fixtures";

async function saveAgent(request: NextRequest) {
  const response = await saveAgentBase(request);
  assert.ok(response);
  return response;
}

async function main() {
  requireSigningTestDatabase();
  const bridge = new SigningBridgeFixture();
  bridge.install();
  const fixtureFetch = globalThis.fetch;
  process.env.HOMIXWEB_REVALIDATE_URL = "https://website.example.invalid/api/revalidate-agents";
  process.env.AGENTS_REVALIDATE_SECRET = "synthetic-only";
  let websiteUnavailable = false;
  const websiteNames = new Map<number, string>();
  globalThis.fetch = async (input, init) => {
    const url = new URL(String(input));
    if (url.origin !== "https://website.example.invalid") return fixtureFetch(input, init);
    if (websiteUnavailable) return Response.json({ error: "Synthetic outage" }, { status: 503 });
    if (url.pathname === "/api/agent-profile/identity") {
      const body = JSON.parse(String(init?.body));
      websiteNames.set(body.portalAgentId, body.name);
      return Response.json({ ok: true, verificationStatus: "verified" });
    }
    assert.equal(url.pathname, "/api/agent-profile");
    return Response.json({ profile: { name: websiteNames.get(Number(url.searchParams.get("portalAgentId"))) }, linked: true });
  };
  const request = (body: unknown, path = "/api/agents") => new NextRequest(`http://localhost${path}`, {
    method: "PUT", headers: { origin: "http://localhost", "content-type": "application/json" }, body: JSON.stringify(body),
  });
  const grace = await signingAgent({ name: "Grace Xia", legalName: "Jiaer Xia", accountStatus: "active", agreementStatus: "completed", licensedCompany: "Homix Living Inc." });
  session(grace);
  assert.equal((await saveAgent(request({ id: grace.id, name: "Grace Xia" }))).status, 200);
  assert.equal(websiteNames.get(grace.id), "Jiaer Xia (Grace)");
  assert.equal((await loadBrand(grace.id)).name, "Grace Xia");
  assert.equal((await saveAgent(request({ id: grace.id, name: "Grace X. Xia" }))).status, 200);
  assert.equal(websiteNames.get(grace.id), "Jiaer Xia (Grace X.)");
  assert.equal((await currentAgent(grace.id)).legalName, "Jiaer Xia");
  assert.equal((await saveAgent(request({ id: grace.id, legalName: "Changed Legal" }))).status, 409);
  assert.equal((await saveAgent(request({ id: grace.id, name: "x".repeat(201) }))).status, 400);
  websiteUnavailable = true;
  const saved = await saveAgent(request({ id: grace.id, name: "Grace Xia" }));
  assert.equal(saved.status, 200, "website outage does not lose canonical name");
  assert.equal((await saved.json()).mlsVerification.status, "failed");
  websiteUnavailable = false;
  const legacy = await signingAgent({ name: "Legacy Preferred", legalName: null, accountStatus: "active", agreementStatus: "completed" });
  assert.equal((await saveAgent(request({ id: legacy.id, name: "Other" }))).status, 403);
  session(legacy);
  assert.equal((await saveAgent(request({ id: legacy.id, name: "Other" }))).status, 409);
  assert.equal((await saveAgent(request({ id: legacy.id, legalName: "Guessed Legal" }))).status, 409);
  const first = await signingAgent({ legalName: null, accountStatus: "active" });
  session(first);
  assert.equal((await saveAgent(request({ id: first.id, name: "Grace Xia", legalName: "Jiaer Xia" }))).status, 200);
  assert.equal((await currentAgent(first.id)).legalName, "Jiaer Xia");

  const [invite] = await db.insert(onboardingInvitations).values({ tokenHash: randomUUID(), expiresAt: new Date(Date.now() + 86400000).toISOString() }).returning();
  const pending = await signingAgent({ name: "Google Profile", legalName: null, onboardingInviteId: invite.id, licensedCompany: "Homix Living Inc." });
  session(pending);
  const body = { legalName: "Jiaer Xia", preferredName: "Grace Xia", licensedCompanyId: "homix_living", plan: "solo", companyRequirementsAcknowledged: true,
    licenseRelease: { status: "not_applicable", previousCompany: "", note: "Synthetic existing affiliation" } };
  assert.equal((await saveOnboarding(request({ ...body, licenseRelease: undefined }, "/api/onboarding/profile"))).status, 400);
  assert.equal((await saveOnboarding(request({ ...body, legalName: "" }, "/api/onboarding/profile"))).status, 400);
  assert.equal((await saveOnboarding(request(body, "/api/onboarding/profile"))).status, 200);
  const profile = (await (await readOnboarding()).json()).profile;
  assert.equal(profile.legalName, "Jiaer Xia");
  assert.equal(profile.preferredName, "Grace Xia");
  assert.equal(profile.licenseRelease.status, "not_applicable");
  const prepared = await prepareOnboardingSigning(await currentAgent(pending.id));
  assert.equal((prepared.signingPreparation?.payload.values as Record<string, string>).agent_name, "Jiaer Xia");
  assert.equal(bridge.document(prepared).recipients[0].name, "Jiaer Xia");
  assert.equal((await saveOnboarding(request({ ...body, legalName: "Changed Legal" }, "/api/onboarding/profile"))).status, 409);
  const administrator = await signingAgent({ accountStatus: "active", isAdmin: true });
  session(administrator);
  assert.equal((await saveAgent(request({ id: pending.id, name: "Grace X. Xia" }))).status, 200, "admin can change a known preferred name without rewriting the signed legal identity");
  assert.equal((await currentAgent(pending.id)).legalName, "Jiaer Xia");
  assert.equal((await saveAgent(request({ id: pending.id, legalName: "Changed Legal" }))).status, 409);
  assert.deepEqual((await currentAgent(pending.id)).signingPreparation, prepared.signingPreparation);
  assert.equal(bridge.sends, 1, "only the synthetic bridge simulates the onboarding invitation");
  console.log("PASS: actual DB name saves, website nickname formatting, full poster name, outage reporting, ownership/legacy/legal guards, dual-name pending form and immutable legal signing preparation");
}

main().catch((error) => { console.error(error); process.exitCode = 1; }).finally(closeDatabaseConnections);
