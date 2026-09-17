import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { agents, agentEmailAddresses, licensedCompanies } from "@/db/schema";
import type { SigningPackage, SigningRequest } from "@/lib/signing-contract";

export function requireSigningTestDatabase() {
  const url = new URL(process.env.DATABASE_URL || "");
  assert.ok(
    ["localhost", "127.0.0.1"].includes(url.hostname) &&
      [
        "/homix_onboarding_integration",
        "/homix_agreement_recovery",
        "/homix_signing_access",
      ].includes(url.pathname),
    "Dedicated synthetic database only",
  );
}
export const now = () => new Date().toISOString();
export function session(agent: typeof agents.$inferSelect | null) {
  (
    globalThis as typeof globalThis & { __agreementTestSession: unknown }
  ).__agreementTestSession = agent
    ? {
        user: {
          agentId: agent.id,
          email: agent.email,
          loginEmail: agent.email,
          accountStatus: agent.accountStatus,
          isAdmin: agent.isAdmin,
        },
      }
    : null;
}
export async function signingAgent(
  overrides: Partial<typeof agents.$inferInsert> = {},
) {
  requireSigningTestDatabase();
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
  const [agent] = await db
    .insert(agents)
    .values({
      name: "Synthetic signing applicant",
      legalName: "Synthetic Legal Applicant",
      email: `${randomUUID()}@example.invalid`,
      licensedCompany: "homix_living",
      licensedCompanyId: "homix_living",
      plan: "solo",
      accountStatus: "pending",
      onboardingCompletedAt: now(),
      licenseNumber: "SYNTHETIC-ONLY",
      ...overrides,
    })
    .returning();
  if (agent.isAdmin) {
    process.env.ADMIN_EMAILS = [process.env.ADMIN_EMAILS, agent.email].filter(Boolean).join(",");
  }
  await db
    .insert(agentEmailAddresses)
    .values({
      agentId: agent.id,
      email: agent.email,
      isPrimary: true,
      canSignIn: true,
      verifiedAt: now(),
      source: "synthetic-qa",
    });
  return agent;
}
export const currentAgent = async (id: number) =>
  (await db.select().from(agents).where(eq(agents.id, id)).limit(1))[0];
export function signingTestRequest(
  path = "/api/onboarding/agreement",
  body: unknown = {},
  origin = "http://localhost",
) {
  return new Request(`http://localhost${path}`, {
    method: "POST",
    headers: { origin, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}
export class SigningBridgeFixture {
  requests = new Map<string, SigningRequest>();
  keys = new Map<string, { hash: string; id: string }>();
  calls: string[] = [];
  creations = 0;
  sends = 0;
  reminders = new Set<string>();
  failCreateOnce = false;
  failSendOnce = false;
  failingRequest = "";
  originalFetch = globalThis.fetch;
  packages: SigningPackage[] = [
    "solo",
    "solo_pro",
    "team_member",
    "team_leader",
  ].map((plan) => ({
    id: randomUUID(),
    package_key: `qa-${plan}`,
    version: 1,
    title: "Synthetic HR package",
    scenario: plan === "team_leader" ? "team_leader" : "onboarding",
    company_key: "homix_living",
    company_signer_email: "qa-company@example.invalid",
    company_signer_name: "Synthetic Company",
    selectors: { plan: plan === "team_leader" ? "solo_pro" : plan },
    definition: [
      {
        title: "Synthetic contract",
        templateId: "synthetic-template",
        connectionId: randomUUID(),
        fingerprint: "0".repeat(64),
        files: [{ title: "Synthetic only.pdf", hash: "0".repeat(64) }],
        roles: [
          {
            key: "applicant",
            templateRecipientId: 1,
            actor: "owner",
            label: "Applicant",
          },
          {
            key: "company",
            templateRecipientId: 2,
            actor: "company",
            label: "Company",
          },
        ],
        prefill: [
          {
            key: "agent_name",
            templateFieldId: 1,
            required: true,
            label: "Name",
          },
        ],
      },
    ],
  }));
  install() {
    process.env.ESIGN_BRIDGE_BASE_URL = "http://localhost:4100";
    process.env.ESIGN_BRIDGE_API_KEY = "synthetic-only";
    process.env.ONBOARDING_V2_ENFORCED = "1";
    process.env.RESEND_API_KEY = "";
    globalThis.fetch = async (input, init) => {
      const url = new URL(String(input));
      assert.equal(
        url.origin,
        "http://localhost:4100",
        "No real external service may be contacted by this transport fault test",
      );
      const headers = new Headers(init?.headers);
      assert.equal(headers.get("authorization"), "Bearer synthetic-only");
      const actor = JSON.parse(
        Buffer.from(headers.get("x-portal-actor")!, "base64url").toString(),
      );
      assert.ok(
        actor.verifiedEmails.length > 0,
        "Trusted actor still requires verified emails",
      );
      this.calls.push(url.pathname);
      const body = init?.body ? JSON.parse(String(init.body)) : {};
      if (url.pathname === "/v1/packages")
        return Response.json({ items: this.packages });
      if (url.pathname === "/v1/requests") {
        assert.equal(body.ownerAgentId, actor.agentId);
        const hash = JSON.stringify(body),
          existing = this.keys.get(body.idempotencyKey);
        if (existing) {
          assert.equal(
            hash,
            existing.hash,
            "Retries must retain the frozen payload",
          );
          return Response.json(this.requests.get(existing.id));
        }
        const id = randomUUID(),
          published = this.packages.find((p) => p.id === body.packageId)!;
        const request: SigningRequest = {
          id,
          title: body.title,
          scenario: body.scenario,
          ownerAgentId: actor.agentId,
          business: body.business,
          createdAt: now(),
          updatedAt: now(),
          category: "draft",
          events: [],
          parts: [
            {
              id: randomUUID(),
              index: 0,
              operationState: "linked",
              error: null,
              lastSyncedAt: now(),
              canEdit: false,
              document: {
                id: randomUUID(),
                title: body.title,
                status: "DRAFT",
                signingOrder: ["onboarding", "team_leader"].includes(body.scenario) ? "SEQUENTIAL" : "PARALLEL",
                updatedAt: now(),
                completedAt: null,
                expired: false,
                completionFilesReady: false,
                files: [
                  {
                    id: "synthetic-file",
                    title: "Synthetic contract",
                    order: 1,
                  },
                ],
                recipients: body.recipients.map(
                  (
                    r: { key: string; name: string; email: string },
                    i: number,
                  ) => ({
                    id: i + 1,
                    key: r.key,
                    actor: published.definition[0].roles.find(
                      (role) => role.key === r.key,
                    )!.actor,
                    name: r.name,
                    email: r.email,
                    role: "SIGNER",
                    signingOrder: 1,
                    signingStatus: "NOT_SIGNED",
                    signedAt: null,
                    expiresAt: new Date(Date.now() + 86400000).toISOString(),
                    sendStatus: "NOT_SENT",
                    canSign: false,
                  }),
                ),
              },
            },
          ],
        };
        this.requests.set(id, request);
        this.keys.set(body.idempotencyKey, { hash, id });
        this.creations++;
        if (this.failCreateOnce) {
          this.failCreateOnce = false;
          throw new TypeError("Synthetic lost create response");
        }
        return Response.json(request);
      }
      const id = url.pathname.split("/")[3],
        request = this.requests.get(id);
      assert.ok(request, url.pathname);
      if (request.ownerAgentId !== actor.agentId && !actor.admin)
        return Response.json({ error: "NOT_FOUND" }, { status: 404 });
      if (this.failingRequest === id)
        return Response.json({ error: "SIGNING_UNAVAILABLE" }, { status: 503 });
      if (url.pathname.endsWith("/access")) {
        const part = request.parts.find(
          (p) => p.id === url.pathname.split("/")[5],
        );
        const r = part?.document?.recipients.find(
          (r) => r.id === body.recipientId,
        );
        if (
          !r ||
          !actor.verifiedEmails.includes(r.email) ||
          r.signingStatus !== "NOT_SIGNED"
        )
          return Response.json(
            { error: "SIGNER_ACCESS_DENIED" },
            { status: 403 },
          );
        return Response.json({
          url: `http://localhost:3469/sign/synthetic-token-${r.id}`,
        });
      }
      if (url.pathname.endsWith("/files")) {
        if (
          url.searchParams.get("kind") !== "original" &&
          request.parts.some((p) => p.document?.status !== "COMPLETED")
        )
          return Response.json(
            { error: "SIGNED_PDF_NOT_READY" },
            { status: 409 },
          );
        return new Response("%PDF-1.7\nSYNTHETIC ONLY");
      }
      if (url.pathname.endsWith("/commands")) {
        if (body.action === "close") {
          if (!actor.admin) return Response.json({ error: "ADMIN_REQUIRED" }, { status: 403 });
          request.parts.forEach((part) => {
            if (part.document?.status === "PENDING") part.document.status = "CANCELLED";
            else if (part.document?.status === "DRAFT") { part.operationState = "discarded"; part.document = null; }
          });
        }
        if (body.action === "send") {
          request.parts.forEach((p) => {
            if (p.document!.status === "DRAFT") {
              p.document!.status = "PENDING";
              this.sends++;
            }
          });
          if (this.failSendOnce) {
            this.failSendOnce = false;
            throw new TypeError("Synthetic lost send response");
          }
        }
        if (body.action === "remind") {
          const key = `${id}:${body.recipientActor}`;
          if (this.reminders.has(key))
            return Response.json(
              { error: "REMINDER_RECENTLY_REQUESTED" },
              { status: 429 },
            );
          this.reminders.add(key);
          request.parts.forEach((p) =>
            p
              .document!.recipients.filter(
                (r) =>
                  r.actor === body.recipientActor &&
                  r.signingStatus === "NOT_SIGNED",
              )
              .forEach((r) => {
                r.expiresAt = new Date(Date.now() + 86400000).toISOString();
              }),
          );
        }
      }
      return Response.json(request);
    };
  }
  close() {
    globalThis.fetch = this.originalFetch;
    session(null);
  }
  document(agent: typeof agents.$inferSelect) {
    return this.requests.get(agent.signingRequestId!)!.parts[0].document!;
  }
}
