import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFile, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { closeDatabaseConnections } from "@/db";
import { POST as portalCallback } from "@/app/api/signing/events/route";
import { prepareOnboardingSigning } from "@/lib/signing-onboarding";
import {
  requireSigningTestDatabase,
  signingAgent,
  currentAgent,
} from "./signing-fixtures";

// Uses actual Documenso, bridge HTTP, PostgreSQL and Portal's callback handler.
// It sends only synthetic invitations into Mailpit and never signs a document.
async function main() {
  requireSigningTestDatabase();
  if (
    process.env.DOCUMENSO_BASE_URL !== "http://localhost:3469" ||
    process.env.ESIGN_DATABASE_URL !==
      "postgres://homix:synthetic-only@127.0.0.1:5569/homix_signing_bridge_integration"
  )
    throw new Error("Isolated synthetic signing environment required");
  const repository = process.env.ESIGN_REPO_PATH || path.resolve("../esign");
  const { loadBridgeConfig } = await import(
    pathToFileURL(path.join(repository, "apps/bridge/src/config.ts")).href
  );
  const { BridgeStore } = await import(
    pathToFileURL(path.join(repository, "apps/bridge/src/store.ts")).href
  );
  const { SigningService } = await import(
    pathToFileURL(path.join(repository, "apps/bridge/src/service.ts")).href
  );
  const { buildServer } = await import(
    pathToFileURL(path.join(repository, "apps/bridge/src/server.ts")).href
  );
  const { Documenso, sha256 } = await import(
    pathToFileURL(path.join(repository, "apps/bridge/src/documenso.ts")).href
  );
  const { webhookSecret } = await import(
    pathToFileURL(path.join(repository, "apps/bridge/src/auth.ts")).href
  );
  const directory = "/private/tmp/homix-documenso-integration";
  const fixture = JSON.parse(
    await readFile(`${directory}/fixtures.json`, "utf8"),
  ) as {
    admin: { email: string };
    connections: Array<{
      scope: string;
      token: string;
      email: string;
      teamId: number;
      nativeUserId: number;
    }>;
  };
  const hr = fixture.connections.find((c) => c.scope === "company")!;
  assert.ok(hr.email.endsWith("@example.invalid"));
  const secret = "synthetic-test-portal-api-key-never-production";
  const callbackSecret = "synthetic-http-callback-never-production-1234567890";
  process.env.ESIGN_BRIDGE_BASE_URL = "http://localhost:4100";
  process.env.ESIGN_BRIDGE_API_KEY = secret;
  process.env.ESIGN_PORTAL_CALLBACK_SECRET = callbackSecret;
  process.env.ONBOARDING_V2_ENFORCED = "1";
  process.env.RESEND_API_KEY = "";
  const config = loadBridgeConfig({
    NODE_ENV: "test",
    PORT: "4100",
    DOCUMENSO_BASE_URL: "http://localhost:3469",
    ESIGN_DATABASE_URL: process.env.ESIGN_DATABASE_URL,
    ESIGN_CREDENTIAL_KEY: "34".repeat(32),
    ESIGN_WEBHOOK_SECRET: "synthetic-webhook-secret-never-use-production",
    ESIGN_RECONCILE_INTERVAL_MS: "60000",
    ESIGN_PORTAL_CLIENTS_JSON: JSON.stringify([
      {
        id: "homix-test",
        keyHash: sha256(secret),
        portalOrigin: "http://localhost:3109",
        callbackSecret,
      },
    ]),
  });
  const store = new BridgeStore(
    config.ESIGN_DATABASE_URL,
    config.ESIGN_CREDENTIAL_KEY,
  );
  const service = new SigningService(store, config);
  const admin = {
    clientId: "homix-test",
    agentId: 900,
    admin: true,
    verifiedEmails: [hr.email],
    portalOrigin: "http://localhost:3109",
  };
  let failNextCallback = true;
  let callbackCalls = 0;
  const callbackServer = createServer(async (req, res) => {
    try {
      if (req.url !== "/api/signing/events") {
        res.writeHead(404).end();
        return;
      }
      const chunks: Buffer[] = [];
      for await (const chunk of req) chunks.push(Buffer.from(chunk));
      callbackCalls++;
      if (failNextCallback) {
        failNextCallback = false;
        res.writeHead(503).end("Synthetic temporary outage");
        return;
      }
      const headers = new Headers();
      for (const [key, value] of Object.entries(req.headers))
        if (typeof value === "string") headers.set(key, value);
      const response = await portalCallback(
        new Request("http://localhost:3109/api/signing/events", {
          method: "POST",
          headers,
          body: Buffer.concat(chunks),
        }),
      );
      res.writeHead(response.status, Object.fromEntries(response.headers));
      res.end(Buffer.from(await response.arrayBuffer()));
    } catch {
      res.writeHead(500).end("Synthetic handler failure");
    }
  });
  await store.migrate();
  const bridge = await buildServer(config, service);
  let requestId: string | undefined;
  try {
    await new Promise<void>((resolve, reject) => {
      callbackServer.once("error", reject);
      callbackServer.listen(3109, "127.0.0.1", resolve);
    });
    await bridge.listen({ port: 4100, host: "0.0.0.0" });
    const company = (await service.connections(admin)).find(
      (c: { scope: string; companyKey: string }) =>
        c.scope === "company" && c.companyKey === "homix_realty",
    );
    assert.ok(
      company,
      "Run bridge native integration to configure the synthetic HR team first",
    );
    const source = new Documenso(config.DOCUMENSO_BASE_URL, hr.token);
    const prior = (await service.packages(admin)).find(
      (p: { scenario: string }) => p.scenario === "buyer",
    );
    assert.ok(prior, "Synthetic buyer template fixture is required");
    const sourceDocument = await source.get(prior.definition[0].templateId);
    const bytes = await source.document(
      sourceDocument.id,
      sourceDocument.envelopeItems[0].id,
      "original",
    );
    const run = randomUUID();
    const templateId = await source.create(
      {
        title: `Synthetic onboarding HTTP ${run}`,
        type: "TEMPLATE",
        visibility: "ADMIN",
        recipients: [
          {
            name: "Synthetic Applicant",
            email: "qa-applicant@example.invalid",
            role: "SIGNER",
            signingOrder: 1,
            fields: [
              {
                identifier: 0,
                type: "SIGNATURE",
                page: 1,
                positionX: 10,
                positionY: 50,
                width: 30,
                height: 8,
                fieldMeta: { type: "signature", required: true },
              },
              {
                identifier: 0,
                type: "TEXT",
                page: 1,
                positionX: 10,
                positionY: 35,
                width: 60,
                height: 5,
                fieldMeta: {
                  type: "text",
                  readOnly: true,
                  label: "Agent name",
                },
              },
            ],
          },
          {
            name: "Synthetic Company",
            email: hr.email,
            role: "SIGNER",
            signingOrder: 2,
            fields: [
              {
                identifier: 0,
                type: "SIGNATURE",
                page: 1,
                positionX: 10,
                positionY: 70,
                width: 30,
                height: 8,
                fieldMeta: { type: "signature", required: true },
              },
            ],
          },
        ],
        meta: {
          signingOrder: "SEQUENTIAL",
          distributionMethod: "EMAIL",
          timezone: "America/New_York",
        },
      },
      [{ name: "SYNTHETIC QA ONLY - NOT A CONTRACT.pdf", bytes }],
    );
    const template = await source.get(templateId);
    await service.publish(admin, {
      packageKey: "synthetic-onboarding-http",
      version: Math.floor(Date.now() / 1000),
      title: "Synthetic onboarding HTTP",
      scenario: "onboarding",
      companyKey: "homix_realty",
      selectors: { plan: "solo", liborMembershipStatus: "existing_member" },
      parts: [
        {
          title: "Synthetic contract",
          templateId,
          roles: template.recipients.map(
            (r: { id: number; name: string }, i: number) => ({
              key: i ? "company" : "applicant",
              templateRecipientId: r.id,
              actor: i ? "company" : "owner",
              label: r.name,
            }),
          ),
          prefill: [
            {
              key: "agent_name",
              templateFieldId: template.fields.find(
                (f: { type: string }) => f.type === "TEXT",
              ).id,
              required: true,
              label: "Agent name",
            },
          ],
        },
      ],
    });
    const applicant = await signingAgent({
      licensedCompany: "homix_realty",
      licensedCompanyId: "homix_realty",
      liborMembershipStatus: "existing_member",
    });
    const prepared = await prepareOnboardingSigning(applicant);
    requestId = prepared.signingRequestId!;
    assert.equal(prepared.agreementStatus, "sent");
    const again = await prepareOnboardingSigning(
      await currentAgent(applicant.id),
    );
    assert.equal(
      again.signingRequestId,
      requestId,
      "Real HTTP retries keep the same native task",
    );
    await service.deliverPortalEvents();
    await store.query(
      "UPDATE signing.portal_outbox SET next_attempt_at=NOW() WHERE request_id=$1 AND delivered_at IS NULL",
      [requestId],
    );
    await service.deliverPortalEvents();
    const outbox = await store.query(
      "SELECT delivered_at,attempts,last_error FROM signing.portal_outbox WHERE request_id=$1",
      [requestId],
    );
    assert.ok(
      outbox.length >= 2 &&
        outbox.every((m: { delivered_at: Date | null }) => m.delivered_at),
    );
    assert.ok(
      outbox.some((m: { attempts: number }) => m.attempts >= 2),
      "Temporary callback failure is retried durably",
    );
    assert.ok(callbackCalls >= 3);
    assert.equal((await currentAgent(applicant.id)).accountStatus, "pending");
    const actor = {
      ...admin,
      agentId: applicant.id,
      admin: false,
      verifiedEmails: [applicant.email],
    };
    const detail = await service.detail(actor, requestId);
    assert.equal(
      detail.parts[0].document.recipients.find(
        (r: { actor: string }) => r.actor === "owner",
      ).canSign,
      true,
    );
    assert.equal(
      detail.parts[0].document.recipients.find(
        (r: { actor: string }) => r.actor === "company",
      ).canSign,
      false,
    );
    await writeFile(
      `${directory}/native-http-followup.json`,
      JSON.stringify(
        {
          requestId,
          agentId: applicant.id,
          nativeId: detail.parts[0].document.id,
          connectionId: company.id,
          webhookUrl: `http://host.docker.internal:4100/webhooks/documenso/${company.id}`,
          webhookSecret: webhookSecret(config, company.id),
        },
        null,
        2,
      ),
      { mode: 0o600 },
    );
    console.log(
      "PASS: real Documenso HR package → bridge HTTP → Portal preparation, durable callback retry, native sequential roles and no premature activation",
    );
    if (process.env.HOMIX_QA_KEEP_RUNNING === "1") {
      console.log(
        "Synthetic HTTP integration remains available for native webhook/browser QA.",
      );
      await new Promise<void>((resolve) => {
        process.once("SIGTERM", resolve);
        process.once("SIGINT", resolve);
      });
    }
  } finally {
    await bridge.close();
    await new Promise<void>((resolve) => callbackServer.close(() => resolve()));
    await store.close();
    await closeDatabaseConnections();
  }
}
void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
