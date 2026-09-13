import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { and, eq, inArray } from "drizzle-orm";
import { db, closeDatabaseConnections } from "@/db";
import { agents, commerceOrders, sponsorPlanRewards } from "@/db/schema";
import {
  onboardingAccessGrants,
  onboardingContracts,
  onboardingReceipts,
} from "@/db/onboarding-schema";
import {
  recordOnboardingReceipt,
  runOnboardingCommand,
  OnboardingCommandError,
} from "@/lib/onboarding-admin";
import { effectiveAccess } from "@/lib/onboarding-requirements";
import { onboardingTasks } from "@/lib/onboarding-tasks";
import { getCommerceProduct } from "@/lib/commerce/catalog";
import { onboardingLicenseTransferFeeCents } from "@/lib/plan-payments";
import { nyDate } from "@/lib/celebrations/calendar";

async function main() {
  const url = new URL(process.env.DATABASE_URL || "");
  assert.ok(
    ["127.0.0.1", "localhost"].includes(url.hostname) &&
      url.pathname === "/homix_onboarding_integration",
    "Dedicated local test database only",
  );
  const [admin, sponsor, pending, other] = await db
    .insert(agents)
    .values([
      {
        name: "Synthetic Admin",
        email: `admin-${randomUUID()}@example.invalid`,
        accountStatus: "active" as const,
        isAdmin: true,
      },
      {
        name: "Synthetic Sponsor",
        email: `sponsor-${randomUUID()}@example.invalid`,
        accountStatus: "active" as const,
      },
      {
        name: "Synthetic New Hire",
        email: `agent-${randomUUID()}@example.invalid`,
        accountStatus: "pending" as const,
        licensedCompany: "Homix Living Inc.",
        licenseNumber: "SYNTHETIC",
        plan: "solo" as const,
      },
      {
        name: "Synthetic Other",
        email: `other-${randomUUID()}@example.invalid`,
        accountStatus: "pending" as const,
      },
    ])
    .returning();
  await db
    .update(agents)
    .set({ referredByAgentId: sponsor.id })
    .where(eq(agents.id, pending.id));
  const agent = async () =>
    (await db.select().from(agents).where(eq(agents.id, pending.id)))[0];
  const product = getCommerceProduct("one_year_membership")!;
  const amountCents =
    product.amountCents +
    onboardingLicenseTransferFeeCents(await agent(), product.key);
  const payload = {
    agentId: pending.id,
    amountCents,
    method: "check",
    reference: `SYNTHETIC-${randomUUID()}`,
    receivedAt: nyDate(),
    idempotencyKey: randomUUID(),
  };
  await assert.rejects(
    recordOnboardingReceipt(other.id, payload),
    (e) => e instanceof OnboardingCommandError && e.status === 403,
  );
  const [a, b] = await Promise.all([
    recordOnboardingReceipt(admin.id, payload),
    recordOnboardingReceipt(admin.id, payload),
  ]);
  assert.equal(
    a.receipt.id,
    b.receipt.id,
    "concurrent retries create one receipt",
  );
  await assert.rejects(
    recordOnboardingReceipt(admin.id, { ...payload, agentId: other.id }),
    OnboardingCommandError,
  );
  await assert.rejects(
    recordOnboardingReceipt(admin.id, {
      ...payload,
      idempotencyKey: randomUUID(),
    }),
    OnboardingCommandError,
  );
  assert.equal((await agent()).paymentStatus, "pending");
  assert.equal((await agent()).affiliationPaidAt, null);
  assert.equal(
    (
      await db
        .select()
        .from(commerceOrders)
        .where(eq(commerceOrders.agentId, pending.id))
    ).length,
    0,
  );
  assert.equal(
    (
      await db
        .select()
        .from(sponsorPlanRewards)
        .where(eq(sponsorPlanRewards.referredAgentId, pending.id))
    ).length,
    0,
    "receipt alone cannot start rewards",
  );
  const match = {
    action: "match_receipt",
    receiptId: a.receipt.id,
    reason: "Synthetic evidence verified",
  };
  await assert.rejects(
    runOnboardingCommand(pending.id, admin.id, match),
    OnboardingCommandError,
  );

  await db
    .update(agents)
    .set({ onboardingCompletedAt: new Date().toISOString() })
    .where(eq(agents.id, pending.id));
  const contractId = randomUUID();
  await db
    .insert(onboardingContracts)
    .values({
      id: contractId,
      agentId: pending.id,
      source: "historic",
      company: pending.licensedCompany!,
      title: "Synthetic affiliation agreement",
      version: "QA-v1",
      purpose: "agent_affiliation",
      objectKey: `synthetic/${randomUUID()}.pdf`,
      fileName: "synthetic.pdf",
      sha256: "0".repeat(64),
      byteSize: 1024,
      agentSignedAt: new Date().toISOString(),
      uploadedBy: admin.id,
    });
  await runOnboardingCommand(pending.id, admin.id, {
    action: "review_contract",
    contractId,
    decision: "accept",
    reason: "Synthetic identity and signature verified",
  });
  assert.equal(
    (await agent()).agreementStatus,
    "not_started",
    "manual verification does not invent electronic completion",
  );
  const grant = {
    action: "grant_access",
    capabilities: ["training"],
    expiresAt: new Date(Date.now() + 86400000).toISOString(),
    reason: "Synthetic temporary access",
    outstandingRequirements: "Company must countersign",
    responsibleAgentId: admin.id,
  };
  await runOnboardingCommand(pending.id, admin.id, grant);
  let grants = await db
    .select()
    .from(onboardingAccessGrants)
    .where(eq(onboardingAccessGrants.agentId, pending.id));
  assert.equal(effectiveAccess(await agent(), grants).limited, true);
  assert.equal(effectiveAccess(await agent(), grants).full, false);
  await runOnboardingCommand(pending.id, admin.id, {
    action: "revoke_access",
    grantId: grants[0].id,
    reason: "Synthetic revocation check",
  });
  grants = await db
    .select()
    .from(onboardingAccessGrants)
    .where(eq(onboardingAccessGrants.agentId, pending.id));
  assert.equal(
    effectiveAccess(await agent(), grants).limited,
    false,
    "old sessions lose access on the next database check",
  );
  await runOnboardingCommand(pending.id, admin.id, grant);
  const [firstMatch, retryMatch] = await Promise.all([
    runOnboardingCommand(pending.id, admin.id, match),
    runOnboardingCommand(pending.id, admin.id, match),
  ]);
  assert.equal(Number(firstMatch.replayed) + Number(retryMatch.replayed), 1);
  assert.equal(
    (await agent()).accountStatus,
    "pending",
    "offline settlement still requires explicit approval",
  );
  assert.equal((await agent()).paymentStatus, "paid");
  assert.equal(
    (
      await db
        .select()
        .from(sponsorPlanRewards)
        .where(eq(sponsorPlanRewards.referredAgentId, pending.id))
    ).length,
    1,
  );
  const extra = await recordOnboardingReceipt(admin.id, {
    ...payload,
    reference: `EXTRA-${randomUUID()}`,
    idempotencyKey: randomUUID(),
  });
  await assert.rejects(
    runOnboardingCommand(pending.id, admin.id, {
      ...match,
      receiptId: extra.receipt.id,
    }),
    OnboardingCommandError,
  );
  await runOnboardingCommand(pending.id, admin.id, {
    action: "existing_staff",
    contractId,
    identityAndTermsVerified: true,
    billingBasis: "current_payment",
    billingEvidence: "Synthetic matching receipt confirmed",
    reason: "Synthetic existing staff recognition",
  });
  assert.equal((await agent()).accountStatus, "active");
  grants = await db
    .select()
    .from(onboardingAccessGrants)
    .where(eq(onboardingAccessGrants.agentId, pending.id));
  assert.ok(grants.every((g) => g.status !== "open"));
  const contracts = await db
    .select()
    .from(onboardingContracts)
    .where(eq(onboardingContracts.agentId, pending.id));
  const receipts = await db
    .select()
    .from(onboardingReceipts)
    .where(eq(onboardingReceipts.agentId, pending.id));
  const tasks = onboardingTasks(await agent(), "offline", {
    contracts,
    receipts,
    grants,
  });
  assert.ok(
    tasks.tasks.includes("countersign") && tasks.tasks.includes("receipt"),
    "activation retains company signature and unmatched receipt tasks",
  );
  await runOnboardingCommand(pending.id, admin.id, {
    action: "review_contract",
    contractId,
    decision: "revoke",
    reason: "Synthetic verification revoked",
  });
  assert.equal((await agent()).onboardingManualContract, null);
  await runOnboardingCommand(pending.id, admin.id, {
    action: "disposition",
    disposition: "deferred",
    reason: "Synthetic follow-up later",
  });
  assert.equal((await agent()).onboardingDisposition?.status, "deferred");
  await runOnboardingCommand(pending.id, admin.id, {
    action: "disposition",
    disposition: "open",
    reason: "Synthetic follow-up resumed",
  });
  assert.equal((await agent()).onboardingDisposition, null);
  assert.equal(
    (
      await db
        .select()
        .from(onboardingReceipts)
        .where(
          and(
            eq(onboardingReceipts.agentId, pending.id),
            inArray(onboardingReceipts.status, ["unmatched", "matched"]),
          ),
        )
    ).length,
    2,
  );
  console.log(
    "PASS: real PostgreSQL receipt concurrency, no premature finance side effects, manual verification, isolated limited access, existing-staff activation and continuing tasks",
  );
}
main()
  .finally(closeDatabaseConnections)
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
