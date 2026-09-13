import assert from "node:assert/strict";
import { eq } from "drizzle-orm";
import { db, closeDatabaseConnections } from "@/db";
import { agents, onboardingEvents } from "@/db/schema";
import { prepareOnboardingSigning } from "@/lib/signing-onboarding";
import { closeOnboardingSigning } from "@/lib/onboarding-close-signing";
import { onboardingTasks } from "@/lib/onboarding-tasks";
import { requestOnboardingSigning } from "@/lib/onboarding-signing-access";
import { POST as accessRoute } from "@/app/api/onboarding/agreement/access/route";
import { GET as documentsRoute } from "@/app/api/onboarding/agreement/documents/route";
import {
  GET as detailRouteBase,
  POST as adminSigningRouteBase,
} from "@/app/api/admin/agents/[id]/onboarding/route";
import { POST as approvalRoute } from "@/app/api/agents/[id]/approve/route";
import { PUT as editRoute } from "@/app/api/agents/route";
import { NextRequest } from "next/server";
import {
  SigningBridgeFixture,
  signingAgent,
  currentAgent,
  requireSigningTestDatabase,
  session,
  signingTestRequest,
  now,
} from "./signing-fixtures";
async function responseOf(value: Promise<Response | undefined>) {
  const response = await value;
  assert.ok(response);
  return response;
}
const detailRoute = (...args: Parameters<typeof detailRouteBase>) =>
  responseOf(detailRouteBase(...args));
const adminSigningRoute = (...args: Parameters<typeof adminSigningRouteBase>) =>
  responseOf(adminSigningRouteBase(...args));
const bridge = new SigningBridgeFixture();
async function main() {
  requireSigningTestDatabase();
  bridge.install();
  const path = "/api/onboarding/agreement/access";
  session(null);
  assert.equal((await accessRoute(signingTestRequest(path))).status, 401);
  const agent = await prepareOnboardingSigning(await signingAgent());
  session(agent);
  assert.equal(
    (
      await accessRoute(
        signingTestRequest(
          path,
          { action: "continue" },
          "https://attacker.example.invalid",
        ),
      )
    ).status,
    403,
  );
  assert.equal(
    (
      await accessRoute(
        signingTestRequest(path, { action: "continue", agentId: agent.id + 1 }),
      )
    ).status,
    400,
  );
  const links = await Promise.all([
    accessRoute(signingTestRequest(path, { action: "continue" })),
    accessRoute(signingTestRequest(path, { action: "continue" })),
  ]);
  assert.ok(links.every((r) => r.status === 200));
  assert.equal(
    (await links[0].json()).url,
    (await links[1].json()).url,
    "Resume is stable and does not create another signing session",
  );
  const reminders = await Promise.all([
    accessRoute(signingTestRequest(path, { action: "resend" })),
    accessRoute(signingTestRequest(path, { action: "resend" })),
  ]);
  assert.deepEqual(reminders.map((r) => r.status).sort(), [200, 429]);
  await assert.rejects(
    requestOnboardingSigning({
      agentId: agent.id,
      actorId: agent.id + 1,
      action: "continue",
    }),
    /FORBIDDEN/,
  );
  const events = await db
    .select()
    .from(onboardingEvents)
    .where(eq(onboardingEvents.agentId, agent.id));
  assert.ok(
    !JSON.stringify(events).includes("/sign/"),
    "Bearer links do not enter the audit trail",
  );
  const other = await prepareOnboardingSigning(await signingAgent());
  const doc = bridge.document(agent),
    documentId = `${bridge.requests.get(agent.signingRequestId!)!.parts[0].id}:${doc.files[0].id}`;
  const documents = (id: number, key = documentId, kind = "original") =>
    documentsRoute(
      new Request(
        `http://localhost/api/onboarding/agreement/documents?${new URLSearchParams({ agentId: String(id), document: key, kind })}`,
      ),
    );
  assert.equal((await documents(agent.id)).status, 200);
  assert.equal((await documents(other.id)).status, 403);
  assert.equal((await documents(agent.id, "unknown")).status, 404);
  assert.equal((await documents(agent.id, documentId, "signed")).status, 409);
  doc.recipients[0].email = "someoneelse@example.invalid";
  assert.notEqual(
    (await accessRoute(signingTestRequest(path, { action: "continue" })))
      .status,
    200,
  );
  doc.recipients[0].email = agent.email;
  doc.recipients[0].expiresAt = "2020-01-01T00:00:00.000Z";
  assert.equal(
    (await accessRoute(signingTestRequest(path, { action: "continue" })))
      .status,
    409,
  );
  doc.recipients[0].expiresAt = new Date(Date.now() + 86400000).toISOString();
  const administrator = await signingAgent({
    isAdmin: true,
    accountStatus: "active",
  });
  const params = { params: Promise.resolve({ id: String(agent.id) }) },
    adminUrl = `/api/admin/agents/${agent.id}/onboarding`;
  assert.equal(
    (await detailRoute(new Request(`http://localhost${adminUrl}`), params))
      .status,
    403,
  );
  session(administrator);
  assert.equal((await documents(agent.id)).status, 200);
  await assert.rejects(
    requestOnboardingSigning({
      agentId: agent.id,
      actorId: administrator.id,
      action: "continue",
    }),
    /FORBIDDEN/,
  );
  assert.equal(
    (
      await adminSigningRoute(
        signingTestRequest(adminUrl, {
          action: "continue",
          recipient: "agent",
        }),
        params,
      )
    ).status,
    400,
  );
  const view = await (
    await detailRoute(new Request(`http://localhost${adminUrl}`), params)
  ).json();
  assert.equal(view.workflow.canApprove, false);
  assert.equal(view.warning, false);
  assert.ok(!JSON.stringify(view).includes("/sign/"));
  assert.equal(
    (
      await approvalRoute(
        new NextRequest(signingTestRequest(`/api/agents/${agent.id}/approve`)),
        params,
      )
    )?.status,
    409,
  );
  assert.equal(
    (
      await editRoute(
        new NextRequest(
          signingTestRequest("/api/agents", {
            id: agent.id,
            accountStatus: "active",
          }),
        ),
      )
    )?.status,
    409,
  );
  await db
    .update(agents)
    .set({ accountStatus: "active" })
    .where(eq(agents.id, agent.id));
  doc.recipients[0].signingStatus = "SIGNED";
  doc.recipients[0].signedAt = now();
  const active = await (
    await detailRoute(new Request(`http://localhost${adminUrl}`), params)
  ).json();
  assert.equal(active.workflow.countersignPending, true);
  const paper = await prepareOnboardingSigning(await signingAgent());
  await db.update(agents).set({ onboardingManualContract: { id: "synthetic-paper", source: "paper", company: paper.licensedCompany!, plan: paper.plan, teamTermsConfigId: null, legalName: paper.legalName || paper.name, licenseNumber: paper.licenseNumber!, agentSignedAt: now(), companySignedAt: now(), verifiedAt: now() } }).where(eq(agents.id, paper.id));
  bridge.failingRequest = paper.signingRequestId!;
  await assert.rejects(closeOnboardingSigning(paper.id, administrator.id, "Synthetic verified paper replaces unused electronic invitation"));
  const failedClosure = await currentAgent(paper.id);
  assert.equal(failedClosure.onboardingSigningClosure?.status, "failed");
  assert.ok(onboardingTasks(failedClosure, "offline", { contracts: [], receipts: [], grants: [] }).tasks.includes("close_online"));
  bridge.failingRequest = "";
  await closeOnboardingSigning(paper.id, administrator.id, "Synthetic verified paper replaces unused electronic invitation");
  const closed = await currentAgent(paper.id);
  assert.equal(closed.onboardingSigningClosure?.status, "completed");
  assert.equal(closed.agreementStatus, "voided", "Closing the invitation does not forge native completion");
  assert.equal(closed.onboardingStage, "payment", "Verified paper still satisfies the independent contract requirement");
  assert.equal(closed.accountStatus, "pending");
  assert.equal(closed.paymentStatus, paper.paymentStatus);
  assert.ok(!onboardingTasks(closed, "offline", { contracts: [], receipts: [], grants: [] }).tasks.includes("close_online"));
  await db
    .update(agents)
    .set({ isAdmin: false })
    .where(eq(agents.id, administrator.id));
  assert.equal(
    (await detailRoute(new Request(`http://localhost${adminUrl}`), params))
      .status,
    403,
    "Stale JWT cannot retain administrator privileges",
  );
  session(await currentAgent(other.id));
  await db
    .update(agents)
    .set({ accountStatus: "inactive" })
    .where(eq(agents.id, other.id));
  assert.equal(
    (await accessRoute(signingTestRequest(path, { action: "continue" })))
      .status,
    403,
  );
  console.log(
    "PASS: native resume reuse, reminder cooldown, verified owner identity, strict origin/input, private PDFs and audit, no administrator impersonation, onboarding approval gates, active countersign tasks, and immediate revocation",
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
