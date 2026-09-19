import assert from "node:assert/strict";
import { seedDosTestCompanies } from "./dos-db-fixture";
import { randomUUID } from "node:crypto";
import { eq, and } from "drizzle-orm";
import { db, closeDatabaseConnections } from "@/db";
import { agents, commerceOrders, onboardingEvents } from "@/db/schema";
import { completeOnboarding, runOnboardingCommand } from "@/lib/onboarding-admin";
import { saveLicenseDeclaration } from "@/lib/onboarding-license-records";
import { dosConfirmed } from "@/lib/onboarding-license";
import { onboardingTasks } from "@/lib/onboarding-tasks";
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
  await seedDosTestCompanies();
  const [admin, ordinary] = await db.insert(agents).values([
    { name: "Synthetic DOS Admin", email: `qa-${randomUUID()}@example.invalid`, isAdmin: true, accountStatus: "active" as const },
    { name: "Synthetic Ordinary", email: `qa-${randomUUID()}@example.invalid`, accountStatus: "active" as const },
  ]).returning();
  process.env.ADMIN_EMAILS = admin.email;
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
  const waived = await subject();
  await completeOnboarding(waived.id, admin.id, waiver());
  assert.equal((await current(waived.id)).accountStatus, "active", "Authorized fee waiver does not require DOS proof");
  assert.equal((await current(waived.id)).dosConfirmation, null);
  await assert.rejects(runOnboardingCommand(person.id, admin.id, {
    action: "existing_staff", contractId: randomUUID(), identityAndTermsVerified: true,
    billingBasis: "not_applicable", billingEvidence: "Synthetic verified history", reason: "Synthetic existing staff",
  }), /Verify the current historical contract/);
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
  assert.equal((await current(person.id)).dosConfirmation, null);
  await runOnboardingCommand(person.id, admin.id, confirm);
  await db.update(agents).set({ licensedCompanyId: "homix_living" }).where(eq(agents.id, person.id));
  assert.equal(dosConfirmed(await current(person.id)), false);
  await runOnboardingCommand(person.id, admin.id, { ...confirm, companyId: "homix_living" });
  await completeOnboarding(person.id, admin.id, waiver());
  assert.equal((await current(person.id)).accountStatus, "active");
  assert.equal((await current(person.id)).agreementStatus, "sent", "No invented company signature");
  await assert.rejects(saveLicenseDeclaration(person.id, declaration), /Only pending/);

  // A signed, paid agent activates before DOS confirmation, including an explicit
  // not-released declaration. DOS remains actionable without another payment.
  const prepaid = await subject();
  await saveLicenseDeclaration(prepaid.id, { ...declaration, release: { ...declaration.release, status: "not_released" } });
  const [order] = await db.insert(commerceOrders).values({ agentId: prepaid.id, productKey: "one_year_membership",
    productName: "Synthetic membership", billingMode: "payment", amountCents: 30800, licenseTransferFeeCents: 2000,
    currency: "usd", paymentChannel: "stripe", status: "pending", customerEmail: prepaid.email }).returning();
  const sessionId = `cs_test_${randomUUID()}`;
  const settlementInput = { sourceKey: `checkout:${sessionId}`, eventId: `evt_test_${randomUUID()}`,
    amountCents: 30800, currency: "usd", earnedAt: new Date().toISOString(), kind: "checkout" as const,
    patch: { status: "paid", stripeCheckoutSessionId: sessionId },
    session: { id: sessionId, object: "checkout.session", status: "complete", payment_status: "paid", mode: "payment",
      amount_total: 30800, currency: "usd", metadata: withStripeAppMetadata({ orderId: String(order.id), agentId: String(prepaid.id) }) } as Stripe.Checkout.Session,
  };
  const settled = await settleOnboardingStripePayment(order, settlementInput);
  assert.equal(settled.automaticallyActivated, true);
  assert.equal((await current(prepaid.id)).paymentStatus, "paid");
  assert.equal((await current(prepaid.id)).accountStatus, "active");
  assert.equal((await current(prepaid.id)).dosConfirmation, null, "Activation does not manufacture verification");
  const records = { contracts: [], receipts: [], grants: [] };
  assert.ok(onboardingTasks(await current(prepaid.id), "stripe", records).tasks.includes("dos"));
  assert.ok(onboardingTasks(await current(prepaid.id), "stripe", records).tasks.includes("countersign"));
  const beforeDos = await current(prepaid.id);
  await runOnboardingCommand(prepaid.id, admin.id, confirm);
  assert.ok(dosConfirmed(await current(prepaid.id)), "Administrator can finish DOS after automatic activation");
  assert.equal(onboardingTasks(await current(prepaid.id), "stripe", records).tasks.includes("dos"), false);
  const afterDos = await current(prepaid.id);
  assert.deepEqual({ ...afterDos, updatedAt: null, dosConfirmation: null }, { ...beforeDos, updatedAt: null, dosConfirmation: null }, "DOS updates only its proof and modification timestamp");
  await runOnboardingCommand(prepaid.id, admin.id, { ...confirm, confirmed: false });
  assert.ok(onboardingTasks(await current(prepaid.id), "stripe", records).tasks.includes("dos"));
  assert.equal((await current(prepaid.id)).accountStatus, "active");
  assert.equal((await settleOnboardingStripePayment(order, settlementInput)).replayed, true);
  assert.equal((await db.select().from(commerceOrders).where(eq(commerceOrders.agentId, prepaid.id))).length, 1);
  const activations = await db.select().from(onboardingEvents).where(and(eq(onboardingEvents.agentId, prepaid.id), eq(onboardingEvents.eventType, "online_payment_auto_activated")));
  assert.equal(activations.length, 1, "Replayed payment must not duplicate activation");

  // The same policy applies to the $3,650 Solo Pro fee plus $20 transfer fee.
  const pro = await subject();
  await db.update(agents).set({ plan: "solo_pro" }).where(eq(agents.id, pro.id));
  await saveLicenseDeclaration(pro.id, { ...declaration, release: { ...declaration.release, status: "not_released" } });
  const [proOrder] = await db.insert(commerceOrders).values({ agentId: pro.id, productKey: "elite_desk_fee",
    productName: "Synthetic Solo Pro", billingMode: "subscription", amountCents: 367000,
    licenseTransferFeeCents: 2000, currency: "usd", paymentChannel: "stripe", status: "pending", customerEmail: pro.email }).returning();
  const proSession = `cs_test_${randomUUID()}`;
  const proResult = await settleOnboardingStripePayment(proOrder, { ...settlementInput,
    sourceKey: `checkout:${proSession}`, eventId: `evt_test_${randomUUID()}`, amountCents: 367000,
    patch: { status: "active", stripeCheckoutSessionId: proSession },
    session: { ...settlementInput.session, id: proSession, mode: "subscription", amount_total: 367000,
      metadata: withStripeAppMetadata({ orderId: String(proOrder.id), agentId: String(pro.id) }) },
  });
  assert.equal(proResult.automaticallyActivated, true);
  assert.equal((await current(pro.id)).accountStatus, "active");
  assert.equal((await current(pro.id)).plan, "solo_pro");
  assert.equal((await current(pro.id)).dosConfirmation, null);
  assert.ok(onboardingTasks(await current(pro.id), "stripe", records).tasks.includes("dos"));

  // Actual route guards: unauthenticated, forged admin JWT, cross-origin, mass assignment.
  const globals = globalThis as typeof globalThis & { __agreementTestSession: unknown };
  const request = (path: string, body: unknown, origin = "http://localhost") => new Request(`http://localhost${path}`, {
    method: "POST", headers: { "Content-Type": "application/json", origin }, body: JSON.stringify(body),
  });
  const pending = await subject();
  const params = { params: Promise.resolve({ id: String(pending.id) }) };
  globals.__agreementTestSession = null;
  assert.equal((await declarationRoute(request("/api/onboarding/license-release", declaration))).status, 401);
  globals.__agreementTestSession = { user: { agentId: pending.id, email: pending.email, loginEmail: pending.email, isAdmin: true, accountStatus: "active" } };
  assert.equal((await adminRoute(request("/api/admin/agents/onboarding", confirm), params))?.status, 403);
  assert.equal((await declarationRoute(request("/api/onboarding/license-release", declaration, "https://foreign.invalid"))).status, 403);
  assert.equal((await declarationRoute(request("/api/onboarding/license-release", { ...declaration, agentId: person.id }))).status, 400);
  assert.equal((await declarationRoute(request("/api/onboarding/license-release", declaration))).status, 200);
  globals.__agreementTestSession = { user: { agentId: prepaid.id, email: prepaid.email, loginEmail: prepaid.email, isAdmin: true, accountStatus: "active" } };
  assert.equal((await adminRoute(request("/api/admin/agents/onboarding", confirm), { params: Promise.resolve({ id: String(prepaid.id) }) }))?.status, 403, "An activated agent cannot confirm their own DOS status, even with a forged admin claim");
  globals.__agreementTestSession = { user: { agentId: admin.id, email: admin.email, loginEmail: admin.email } };
  assert.equal((await adminRoute(request("/api/admin/agents/onboarding", confirm, "https://foreign.invalid"), params))?.status, 403);
  assert.equal((await adminRoute(request("/api/admin/agents/onboarding", confirm), params))?.status, 200);
  const activeParams = { params: Promise.resolve({ id: String(prepaid.id) }) };
  assert.equal((await adminRoute(request("/api/admin/agents/onboarding", confirm), activeParams))?.status, 200, "The real route accepts post-activation DOS follow-up");
  await db.update(agents).set({ accountStatus: "inactive" }).where(eq(agents.id, waived.id));
  await assert.rejects(runOnboardingCommand(waived.id, admin.id, confirm), /pending or active/);
  const audit = await db.select().from(onboardingEvents).where(and(eq(onboardingEvents.agentId, pending.id), eq(onboardingEvents.eventType, "confirm_dos")));
  assert.equal(audit[0].actorAgentId, admin.id);
  assert.equal((await current(ordinary.id)).accountStatus, "active", "Existing active accounts stay active without DOS metadata");
  globals.__agreementTestSession = null;
  console.log("PASS: DOS RBAC/origin/identity/idempotency/revocation; signed release update; signed Stripe and waiver activation without DOS; active-account follow-up without payment/signature/access changes; replay-safe payment and audit");
}
main().finally(closeDatabaseConnections).catch(error => { console.error(error); process.exitCode = 1; });
