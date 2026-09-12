import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { eq, inArray } from "drizzle-orm";
import { db, closeDatabaseConnections } from "@/db";
import {
  agents,
  onboardingEvents,
  commerceOrders,
  notifications,
} from "@/db/schema";
import { POST } from "@/app/api/onboarding/agreement/access/route";
import { requestOnboardingSigning } from "@/lib/onboarding-signing-access";
import { createESignSignerAccess, type ESignEnvelope } from "@/lib/esign";
import { GET as documentsRoute } from "@/app/api/onboarding/agreement/documents/route";
import {
  GET as detailRoute,
  POST as adminSigningRoute,
} from "@/app/api/admin/agents/[id]/onboarding/route";
import { POST as approveRoute } from "@/app/api/agents/[id]/approve/route";
import { PUT as editRoute } from "@/app/api/agents/route";
import { NextRequest } from "next/server";

async function responseOf(promise: Promise<Response | undefined>) {
  const response = await promise;
  assert.ok(response);
  return response;
}
const documents = (...args: Parameters<typeof documentsRoute>) =>
  responseOf(documentsRoute(...args));
const detail = (...args: Parameters<typeof detailRoute>) =>
  responseOf(detailRoute(...args));
const adminSigning = (...args: Parameters<typeof adminSigningRoute>) =>
  responseOf(adminSigningRoute(...args));
const approve = (...args: Parameters<typeof approveRoute>) =>
  responseOf(approveRoute(...args));
const edit = (...args: Parameters<typeof editRoute>) =>
  responseOf(editRoute(...args));

const ids: number[] = [];
const envelopes = new Map<string, ESignEnvelope>();
let calls: string[] = [],
  unsafeUrl = false;
const fetchOriginal = globalThis.fetch;
type Session = {
  user: {
    agentId: number;
    email: string;
    accountStatus: string;
    isAdmin: boolean;
  };
} | null;
const session = (agent: typeof agents.$inferSelect | null) => {
  (
    globalThis as typeof globalThis & { __agreementTestSession: Session }
  ).__agreementTestSession = agent
    ? {
        user: {
          agentId: agent.id,
          email: agent.email,
          accountStatus: agent.accountStatus,
          isAdmin: agent.isAdmin,
        },
      }
    : null;
};
const request = (
  body: unknown = { action: "continue" },
  origin = "http://localhost",
) =>
  new Request("http://localhost/api/onboarding/agreement/access", {
    method: "POST",
    headers: { "content-type": "application/json", origin },
    body: JSON.stringify(body),
  });
async function fixture() {
  const [agent] = await db
    .insert(agents)
    .values({
      name: "Synthetic Signing QA",
      email: `${randomUUID()}@example.invalid`,
      accountStatus: "pending",
      licensedCompany: "homix_living",
      plan: "solo",
      onboardingCompletedAt: new Date().toISOString(),
      esignEnvelopeId: randomUUID(),
      esignTemplateVersionId: "version-1",
      agreementStatus: "sent",
    })
    .returning();
  ids.push(agent.id);
  const envelope: ESignEnvelope = {
    id: agent.esignEnvelopeId!,
    templateVersionId: "version-1",
    status: "SENT",
    expiresAt: new Date(Date.now() + 86400000).toISOString(),
    documents: [{ id: "document-1", name: "Synthetic contract", order: 1 }],
    recipients: [
      {
        id: randomUUID(),
        roleId: "agent",
        name: agent.name,
        email: agent.email,
        kind: "signer",
        status: "ACTIVE",
      },
    ],
  };
  envelopes.set(envelope.id, envelope);
  return { agent, envelope };
}
async function main() {
  const url = new URL(process.env.DATABASE_URL || "");
  assert.ok(
    ["localhost", "127.0.0.1"].includes(url.hostname) &&
      url.pathname === "/homix_signing_access",
    "Dedicated local test database only",
  );
  process.env.ESIGN_API_URL = "https://esign.example.invalid";
  process.env.ESIGN_PUBLIC_URL = "https://esign.example.invalid";
  process.env.ESIGN_APPLICATION_KEY = "synthetic-only";
  process.env.ONBOARDING_V2_ENFORCED = "1";
  process.env.RESEND_API_KEY = "";
  process.env.HOMIXWEB_REVALIDATE_URL = "";
  process.env.AGENTS_REVALIDATE_SECRET = "";
  for (const [key, value] of Object.entries({
    TEMPLATE_ID: "template-1",
    TEMPLATE_VERSION_ID: "version-1",
    TEMPLATE_SCHEMA_HASH: "hash-1",
  }))
    process.env[`ESIGN_ONBOARDING_HOMIX_LIVING_SOLO_${key}`] = value;
  process.env.ESIGN_ONBOARDING_HOMIX_LIVING_COUNTERSIGNER_NAME = "QA Broker";
  process.env.ESIGN_ONBOARDING_HOMIX_LIVING_COUNTERSIGNER_EMAIL =
    "broker@example.invalid";
  globalThis.fetch = async (input, init) => {
    const remote = new URL(String(input));
    assert.equal(
      remote.origin,
      process.env.ESIGN_API_URL,
      "Never contact a real service",
    );
    const envelope = envelopes.get(remote.pathname.split("/")[3]);
    assert.ok(envelope);
    if (!init?.method || init.method === "GET") {
      if (remote.pathname.includes("/documents/"))
        return new Response("%PDF-1.7\nSynthetic QA");
      return Response.json({ data: envelope });
    }
    calls.push(remote.pathname);
    if (remote.pathname.endsWith("/access")) {
      assert.equal(
        JSON.parse(String(init.body)).authenticatedEmail,
        envelope.recipients![0].email,
      );
      return Response.json({
        data: {
          url: `${unsafeUrl ? "https://attacker.example.invalid" : remote.origin}/sign/${"a".repeat(40)}`,
        },
      });
    }
    assert.ok(remote.pathname.endsWith("/resend"));
    return Response.json({ data: { sent: true } });
  };
  session(null);
  assert.equal((await POST(request())).status, 401);
  const first = await fixture();
  session(first.agent);
  assert.equal(
    (await POST(request({}, "https://attacker.example.invalid"))).status,
    403,
  );
  assert.equal(
    (await POST(request({ action: "continue", agentId: first.agent.id + 1 })))
      .status,
    400,
  );
  const responses = await Promise.all([
    POST(request()),
    POST(request()),
    POST(request()),
  ]);
  assert.deepEqual(responses.map((r) => r.status).sort(), [200, 429, 429]);
  assert.equal(calls.length, 1);
  const success = responses.find((r) => r.status === 200)!;
  assert.equal(success.headers.get("cache-control"), "no-store");
  assert.match(
    (await success.json()).url,
    /^https:\/\/esign.example.invalid\/sign\//,
  );
  await assert.rejects(
    requestOnboardingSigning({
      agentId: first.agent.id,
      actorId: first.agent.id + 1,
      action: "continue",
    }),
    /FORBIDDEN/,
  );
  calls = [];
  const reminders = await Promise.all([
    POST(request({ action: "resend" })),
    POST(request({ action: "resend" })),
  ]);
  assert.deepEqual(reminders.map((r) => r.status).sort(), [200, 429]);
  assert.equal(calls.length, 1);
  assert.ok(calls[0].endsWith("/resend"));
  const audit = await db
    .select()
    .from(onboardingEvents)
    .where(eq(onboardingEvents.agentId, first.agent.id));
  assert.ok(audit.length >= 4);
  assert.ok(
    !JSON.stringify(audit).includes("/sign/"),
    "Bearer link must never enter the audit log",
  );
  for (const scenario of [
    "email",
    "version",
    "expired",
    "completed",
    "inactive",
  ] as const) {
    const { agent, envelope } = await fixture();
    session(agent);
    if (scenario === "email")
      envelope.recipients![0].email = "another@example.invalid";
    if (scenario === "version")
      envelope.templateVersionId = "different-version";
    if (scenario === "expired") envelope.expiresAt = "2020-01-01T00:00:00Z";
    if (scenario === "completed") envelope.recipients![0].status = "COMPLETED";
    if (scenario === "inactive")
      await db
        .update(agents)
        .set({ accountStatus: "inactive" })
        .where(eq(agents.id, agent.id));
    const before: number = calls.length;
    assert.equal(
      (await POST(request())).status,
      scenario === "inactive" ? 403 : 409,
      scenario,
    );
    assert.equal(calls.length, before, scenario);
  }
  unsafeUrl = true;
  await assert.rejects(
    createESignSignerAccess(
      first.envelope.id,
      first.envelope.recipients![0].id,
      first.agent.email,
    ),
    /Unexpected signing URL/,
  );
  console.log(
    "PASS: authenticated owner only, fresh account and contract identity, strict origin/input, concurrent cooldown, private audit, safe signing URL",
  );
  unsafeUrl = false;
  const applicant = await fixture();
  const administrator = await fixture();
  await db
    .update(agents)
    .set({ isAdmin: true, accountStatus: "active" })
    .where(eq(agents.id, administrator.agent.id));
  administrator.agent.isAdmin = true;
  administrator.agent.accountStatus = "active";
  const params = {
    params: Promise.resolve({ id: String(applicant.agent.id) }),
  };
  const adminUrl = `http://localhost/api/admin/agents/${applicant.agent.id}/onboarding`;
  const approvalRequest = () =>
    new NextRequest(
      `http://localhost/api/agents/${applicant.agent.id}/approve`,
      {
        method: "POST",
        headers: {
          origin: "http://localhost",
          "content-type": "application/json",
        },
        body: "{}",
      },
    );
  const documentRequest = (id: number, document = "document-1") =>
    new Request(
      `http://localhost/api/onboarding/agreement/documents?agentId=${id}&document=${document}`,
    );
  session(applicant.agent);
  assert.equal(
    (await documents(documentRequest(applicant.agent.id))).status,
    200,
  );
  assert.equal(
    (await documents(documentRequest(administrator.agent.id))).status,
    403,
  );
  assert.equal(
    (await documents(documentRequest(applicant.agent.id, "other-document")))
      .status,
    404,
  );
  assert.equal((await detail(new Request(adminUrl), params)).status, 403);
  session(administrator.agent);
  assert.equal(
    (await documents(documentRequest(applicant.agent.id))).status,
    200,
  );
  assert.equal(
    (await approve(approvalRequest(), params)).status,
    409,
    "Unsigned applicant cannot be approved",
  );
  const view = await (await detail(new Request(adminUrl), params)).json();
  process.env.ESIGN_ONBOARDING_HOMIX_LIVING_SOLO_TEMPLATE_VERSION_ID =
    "version-2-for-new-agents";
  const pinned = await (await detail(new Request(adminUrl), params)).json();
  assert.equal(
    pinned.warning,
    false,
    "Existing agreements retain their pinned version after a new template is published",
  );
  process.env.ESIGN_ONBOARDING_HOMIX_LIVING_SOLO_TEMPLATE_VERSION_ID =
    "version-1";
  assert.equal(view.warning, false);
  assert.equal(view.workflow.next, "signature");
  assert.ok(!JSON.stringify(view).includes("/sign/"));
  assert.equal(
    (
      await adminSigning(
        new Request(adminUrl, {
          method: "POST",
          headers: {
            origin: "http://localhost",
            "content-type": "application/json",
          },
          body: JSON.stringify({ action: "continue", recipient: "agent" }),
        }),
        params,
      )
    ).status,
    400,
    "Admin must not obtain another person's signing URL",
  );
  assert.equal(
    (
      await edit(
        new NextRequest("http://localhost/api/agents", {
          method: "PUT",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            id: applicant.agent.id,
            accountStatus: "active",
          }),
        }),
      )
    ).status,
    409,
    "Ordinary edit cannot bypass onboarding",
  );
  applicant.envelope.status = "IN_PROGRESS";
  applicant.envelope.recipients![0].status = "COMPLETED";
  applicant.envelope.recipients![0].completedAt = new Date().toISOString();
  await db
    .update(agents)
    .set({ paymentStatus: "paid" })
    .where(eq(agents.id, applicant.agent.id));
  const [order] = await db
    .insert(commerceOrders)
    .values({
      agentId: applicant.agent.id,
      productKey: "one_year_membership",
      productName: "QA plan",
      billingMode: "one_time",
      amountCents: 52000,
      licenseTransferFeeCents: 2000,
      currency: "usd",
      status: "paid",
      paymentChannel: "stripe",
      paidAt: new Date().toISOString(),
      workspaceStatus: "not_required",
    })
    .returning();
  assert.equal(
    (await approve(approvalRequest(), params)).status,
    409,
    "Online payment is an automatic path, not manual approval",
  );
  await db
    .update(commerceOrders)
    .set({
      paymentChannel: "offline",
      offlineMethod: "check",
      externalPaymentKey: `offline:${randomUUID()}`,
      offlineReference: "QA receipt",
      verifiedByEmail: administrator.agent.email,
    })
    .where(eq(commerceOrders.id, order.id));
  const verified = await (await detail(new Request(adminUrl), params)).json();
  assert.equal(verified.workflow.canApprove, true);
  const approvals = await Promise.all([
    approve(approvalRequest(), params),
    approve(approvalRequest(), params),
  ]);
  assert.ok(approvals.some((r) => r.status === 200));
  assert.ok(approvals.every((r) => [200, 409].includes(r.status)));
  assert.equal(
    (await db.select().from(agents).where(eq(agents.id, applicant.agent.id)))[0]
      .accountStatus,
    "active",
  );
  assert.equal(
    (
      await db
        .select()
        .from(notifications)
        .where(eq(notifications.recipientAgentId, applicant.agent.id))
    ).length,
    1,
    "Concurrent approval sends one activation notification",
  );
  await db
    .update(agents)
    .set({ isAdmin: false })
    .where(eq(agents.id, administrator.agent.id));
  assert.equal(
    (await detail(new Request(adminUrl), params)).status,
    403,
    "Stale admin session must be rechecked",
  );
  console.log(
    "PASS: private contract preview, recipient/document ownership, admin-only onboarding, honest approval gates and stale administrator revocation",
  );
}
main()
  .finally(async () => {
    globalThis.fetch = fetchOriginal;
    session(null);
    if (ids.length) {
      await db
        .delete(notifications)
        .where(inArray(notifications.recipientAgentId, ids));
      await db
        .delete(commerceOrders)
        .where(inArray(commerceOrders.agentId, ids));
      await db
        .delete(onboardingEvents)
        .where(inArray(onboardingEvents.agentId, ids));
      await db.delete(agents).where(inArray(agents.id, ids));
    }
    await closeDatabaseConnections();
  })
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
