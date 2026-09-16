import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { eq, and } from "drizzle-orm";
import { db, closeDatabaseConnections } from "@/db";
import { agents, commerceOrders, onboardingEvents } from "@/db/schema";
import { completeOnboarding, runOnboardingCommand } from "@/lib/onboarding-admin";
import { saveLicenseDeclaration } from "@/lib/onboarding-license-records";
import { dosConfirmed } from "@/lib/onboarding-license";
import { settleOnboardingStripePayment } from "@/lib/onboarding-stripe-guard";
import { withStripeAppMetadata } from "@/lib/commerce/stripe-app";
import { POST as adminRoute } from "@/app/api/admin/agents/[id]/onboarding/commands/route";
import { PUT as declarationRoute } from "@/app/api/onboarding/license-release/route";
import { verifiedDosFixture } from "./dos-fixture";
import { onboardingSigningContextHash } from "@/lib/signing-onboarding";
import type Stripe from "stripe";

async function main() {
  const url = new URL(process.env.DATABASE_URL || "");
  assert.ok(["127.0.0.1", "localhost"].includes(url.hostname) && url.pathname === "/homix_onboarding_integration", "Isolated local test database only");
  process.env.ONBOARDING_V2_ENFORCED = "1";
  const [admin, ordinary] = await db.insert(agents).values([
    { name: "Synthetic DOS Admin", email: `qa-${randomUUID()}@example.invalid`, isAdmin: true, accountStatus: "active" as const },
    { name: "Synthetic Ordinary", email: `qa-${randomUUID()}@example.invalid`, accountStatus: "active" as const },
  ]).returning();
  const subject = async () => (await db.insert(agents).values({ ...verifiedDosFixture, dosConfirmation: null,
    name: "Synthetic Preferred", email: `qa-${randomUUID()}@example.invalid`, accountStatus: "pending",
    plan: "solo", affiliationTermMonths: 12, onboardingCompletedAt: new Date().toISOString(),
    signingRequestId: randomUUID(), agreementStatus: "sent", agreementAgentSignedAt: new Date().toISOString(),
  }).returning())[0];
  const current = async (id: number) => (await db.select().from(agents).where(eq(agents.id, id)))[0];
  const confirm = { action: "confirm_dos", confirmed: true, legalName: "Synthetic Legal", licenseNumber: "SYNTHETIC", companyId: "homix_realty" };
  const waiver = () => ({ action: "complete_onboarding", mode: "waiver", confirmed: true, idempotencyKey: randomUUID(), reason: "Synthetic full waiver" });
  const person = await subject();
  await assert.rejects(runOnboardingCommand(person.id, ordinary.id, confirm), /Administrator/);
  await assert.rejects(runOnboardingCommand(person.id, admin.id, { ...confirm, confirmedBy: ordinary.id }));
  await assert.rejects(runOnboardingCommand(person.id, admin.id, { ...confirm, companyId: "homix_living" }), /changed/);
  await assert.rejects(completeOnboarding(person.id, admin.id, waiver()), /Confirm in DOS/);
  await assert.rejects(runOnboardingCommand(person.id, admin.id, {
    action: "existing_staff", contractId: randomUUID(), identityAndTermsVerified: true,
    billingBasis: "not_applicable", billingEvidence: "Synthetic verified history", reason: "Synthetic existing staff",
  }), /Confirm in DOS/);
  const declaration = { licenseNumber: "SYNTHETIC", release: { status: "unknown", previousCompany: "Synthetic Previous Brokerage", note: "" } };
  await saveLicenseDeclaration(person.id, declaration);
  let saved = await current(person.id);
  assert.equal(saved.signingRequestId, person.signingRequestId);
  assert.equal(saved.agreementAgentSignedAt, person.agreementAgentSignedAt);
  assert.equal(saved.dosConfirmation, null, "Applicant declaration is never DOS proof");
  assert.equal(onboardingSigningContextHash(saved), onboardingSigningContextHash(person), "Release declaration must not invalidate or replace the existing signing package");
  await assert.rejects(saveLicenseDeclaration(person.id, { ...declaration, dosConfirmation: verifiedDosFixture.dosConfirmation }));
  await assert.rejects(saveLicenseDeclaration(person.id, { ...declaration, licenseNumber: "changed" }));
  await runOnboardingCommand(person.id, admin.id, confirm);
  saved = await current(person.id);
  assert.ok(dosConfirmed(saved));
  assert.equal(onboardingSigningContextHash(saved), onboardingSigningContextHash(person), "DOS confirmation must not change eSign facts");
  assert.equal(saved.dosConfirmation!.confirmedBy, admin.id);
  const proof = saved.dosConfirmation;
  assert.equal((await runOnboardingCommand(person.id, admin.id, confirm)).replayed, true);
  assert.deepEqual((await current(person.id)).dosConfirmation, proof);
  await runOnboardingCommand(person.id, admin.id, { ...confirm, confirmed: false });
  await assert.rejects(completeOnboarding(person.id, admin.id, waiver()), /Confirm in DOS/);
  await runOnboardingCommand(person.id, admin.id, confirm);
  await db.update(agents).set({ licensedCompanyId: "homix_living" }).where(eq(agents.id, person.id));
  assert.equal(dosConfirmed(await current(person.id)), false);
  await assert.rejects(completeOnboarding(person.id, admin.id, waiver()), /Confirm in DOS/);
  await runOnboardingCommand(person.id, admin.id, { ...confirm, companyId: "homix_living" });
  await completeOnboarding(person.id, admin.id, waiver());
  assert.equal((await current(person.id)).accountStatus, "active");
  assert.equal((await current(person.id)).agreementStatus, "sent", "No invented company signature");
  await assert.rejects(saveLicenseDeclaration(person.id, declaration), /Only pending/);

  // Signed Stripe settlement is retained before DOS confirmation; after checking,
  // approve the same settled order rather than collecting another payment.
  const prepaid = await subject();
  const [order] = await db.insert(commerceOrders).values({ agentId: prepaid.id, productKey: "one_year_membership",
    productName: "Synthetic membership", billingMode: "payment", amountCents: 30800, licenseTransferFeeCents: 2000,
    currency: "usd", paymentChannel: "stripe", status: "pending", customerEmail: prepaid.email }).returning();
  const sessionId = `cs_test_${randomUUID()}`;
  await settleOnboardingStripePayment(order, { sourceKey: `checkout:${sessionId}`, eventId: `evt_test_${randomUUID()}`,
    amountCents: 30800, currency: "usd", earnedAt: new Date().toISOString(), kind: "checkout",
    patch: { status: "paid", stripeCheckoutSessionId: sessionId },
    session: { id: sessionId, object: "checkout.session", status: "complete", payment_status: "paid", mode: "payment",
      amount_total: 30800, currency: "usd", metadata: withStripeAppMetadata({ orderId: String(order.id), agentId: String(prepaid.id) }) } as Stripe.Checkout.Session,
  });
  assert.equal((await current(prepaid.id)).paymentStatus, "paid");
  assert.equal((await current(prepaid.id)).accountStatus, "pending");
  await runOnboardingCommand(prepaid.id, admin.id, confirm);
  await completeOnboarding(prepaid.id, admin.id, { action: "complete_onboarding", mode: "verified", confirmed: true, idempotencyKey: randomUUID() });
  assert.equal((await current(prepaid.id)).accountStatus, "active");
  assert.equal((await db.select().from(commerceOrders).where(eq(commerceOrders.agentId, prepaid.id))).length, 1);

  // Actual route guards: unauthenticated, forged admin JWT, cross-origin, mass assignment.
  const globals = globalThis as typeof globalThis & { __agreementTestSession: unknown };
  const request = (path: string, body: unknown, origin = "http://localhost") => new Request(`http://localhost${path}`, {
    method: "POST", headers: { "Content-Type": "application/json", origin }, body: JSON.stringify(body),
  });
  const pending = await subject();
  const params = { params: Promise.resolve({ id: String(pending.id) }) };
  globals.__agreementTestSession = null;
  assert.equal((await declarationRoute(request("/api/onboarding/license-release", declaration))).status, 401);
  globals.__agreementTestSession = { user: { agentId: pending.id, email: pending.email, isAdmin: true, accountStatus: "active" } };
  assert.equal((await adminRoute(request("/api/admin/agents/onboarding", confirm), params))?.status, 403);
  assert.equal((await declarationRoute(request("/api/onboarding/license-release", declaration, "https://foreign.invalid"))).status, 403);
  assert.equal((await declarationRoute(request("/api/onboarding/license-release", { ...declaration, agentId: person.id }))).status, 400);
  assert.equal((await declarationRoute(request("/api/onboarding/license-release", declaration))).status, 200);
  globals.__agreementTestSession = { user: { agentId: admin.id, email: admin.email } };
  assert.equal((await adminRoute(request("/api/admin/agents/onboarding", confirm, "https://foreign.invalid"), params))?.status, 403);
  assert.equal((await adminRoute(request("/api/admin/agents/onboarding", confirm), params))?.status, 200);
  const audit = await db.select().from(onboardingEvents).where(and(eq(onboardingEvents.agentId, pending.id), eq(onboardingEvents.eventType, "confirm_dos")));
  assert.equal(audit[0].actorAgentId, admin.id);
  assert.equal((await current(ordinary.id)).accountStatus, "active", "Existing active accounts stay active without DOS metadata");
  globals.__agreementTestSession = null;
  console.log("PASS: DOS RBAC/origin/identity/idempotency/revocation; signed release update; all activation gates; prepaid Stripe approval without duplicate fees; audit and grandfathering");
}
main().finally(closeDatabaseConnections).catch(error => { console.error(error); process.exitCode = 1; });
