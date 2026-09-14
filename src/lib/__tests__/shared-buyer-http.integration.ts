import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import path from "node:path";
import { GET as baseGet, POST as basePost } from "@/app/api/signing/[...path]/route";
import { closeDatabaseConnections, db } from "@/db";
import { settings } from "@/db/schema";
import {
  signingAgent,
  session,
  requireSigningTestDatabase,
} from "./signing-fixtures";

async function responseOf(result: Promise<Response | undefined>) {
  const response = await result;
  assert(response);
  return response;
}
const GET = (...args: Parameters<typeof baseGet>) => responseOf(baseGet(...args));
const POST = (...args: Parameters<typeof basePost>) => responseOf(basePost(...args));

async function main() {
  requireSigningTestDatabase();
  assert.equal(
    process.env.DATABASE_URL,
    "postgres://homix:synthetic-only@127.0.0.1:5569/homix_onboarding_integration",
  );
  const repo = process.env.ESIGN_REPO_PATH!;
  assert(repo);
  const imp = (file: string) =>
    import(pathToFileURL(path.join(repo, `apps/bridge/src/${file}.ts`)).href);
  const { loadBridgeConfig } = await imp("config"),
    { BridgeStore } = await imp("store"),
    { SigningService } = await imp("service"),
    { buildServer } = await imp("server"),
    { sha256 } = await imp("documenso");
  const secret = "synthetic-company-package-api-key";
  process.env.ESIGN_BRIDGE_BASE_URL = "http://localhost:4113";
  process.env.ESIGN_BRIDGE_API_KEY = secret;
  const config = loadBridgeConfig({
    NODE_ENV: "test",
    ESIGN_DATABASE_URL:
      "postgres://homix:synthetic-only@127.0.0.1:5569/homix_company_packages_integration",
    ESIGN_CREDENTIAL_KEY: "34".repeat(32),
    DOCUMENSO_BASE_URL: "http://localhost:3469",
    ESIGN_WEBHOOK_SECRET: "synthetic-webhook-secret-never-production",
    ESIGN_PORTAL_CLIENTS_JSON: JSON.stringify([
      {
        id: "homix-test",
        keyHash: sha256(secret),
        portalOrigin: "http://localhost",
      },
    ]),
  });
  const store = new BridgeStore(
      config.ESIGN_DATABASE_URL,
      config.ESIGN_CREDENTIAL_KEY,
    ),
    service = new SigningService(store, config),
    bridge = await buildServer(config, service);
  const ctx = (p: string) => ({
    params: Promise.resolve({ path: p.split("/") }),
  });
  const get = (p: string) =>
    GET(new Request(`http://localhost/api/signing/${p}`), ctx(p));
  const post = (body: unknown) =>
    POST(
      new Request("http://localhost/api/signing/requests", {
        method: "POST",
        headers: {
          origin: "http://localhost",
          "content-type": "application/json",
        },
        body: JSON.stringify(body),
      }),
      ctx("requests"),
    );
  try {
    await bridge.listen({ port: 4113, host: "127.0.0.1" });
    const report = JSON.parse(
      await readFile(
        "/private/tmp/homix-documenso-integration/shared-buyer-run.json",
        "utf8",
      ),
    );
    const [published] = await store.query(
      "SELECT * FROM signing.packages WHERE id=$1",
      [report.packageId],
    );
    for (const [key, value] of [
      ["homix_realty_broker_license", "10990000001"],
      ["homix_living_broker_license", "10990000002"],
    ])
      await db
        .insert(settings)
        .values({ key, value })
        .onConflictDoUpdate({ target: settings.key, set: { value } });
    for (const company of ["homix_realty", "homix_living"] as const) {
      const person = await signingAgent({
        name: "Synthetic Display",
        legalName: "Synthetic Legal",
        accountStatus: "active",
        licensedCompany: company,
        licensedCompanyId: company,
        licenseNumber: "SYNTHETIC-AGENT",
      });
      session(person);
      const catalogResponse = await get("packages");
      assert.equal(catalogResponse.status, 200);
      const catalog = await catalogResponse.json();
      assert(
        catalog.items.some((p: { id: string }) => p.id === report.packageId),
      );
      assert.equal(catalog.agentIdentity.companyKey, company);
      const roles = published.definition[0].roles.slice(0, 2);
      const input = {
        title: "Synthetic shared Portal draft",
        scenario: "buyer",
        packageId: report.packageId,
        idempotencyKey: crypto.randomUUID(),
        externalReference: crypto.randomUUID(),
        recipients: roles.map((role: { key: string }, i: number) => ({
          key: role.key,
          name: i === 0 ? "Forged Agent" : "Synthetic Buyer",
          email: i === 0 ? person.email : "client@example.invalid",
        })),
        values: {
          ...Object.fromEntries(
            roles.map((r: { templateRecipientId: number }) => [
              `name_${r.templateRecipientId}`,
              "Synthetic value",
            ]),
          ),
          company_name: "Forged Company",
          broker_license: "forged",
          agent_license: "forged",
          agent_name: "Forged Agent",
        },
      };
      assert.equal(
        (
          await post({
            ...input,
            companyKey:
              company === "homix_realty" ? "homix_living" : "homix_realty",
          })
        ).status,
        403,
      );
      const response = await post(input);
      assert.equal(
        response.status,
        201,
        JSON.stringify(await response.clone().json()),
      );
      const draft = await response.json();
      const [row] = await store.query(
        "SELECT input_snapshot FROM signing.requests WHERE id=$1",
        [draft.id],
      );
      assert.equal(row.input_snapshot.companyKey, company);
      assert.equal(
        row.input_snapshot.values.company_name,
        company === "homix_realty" ? "Homix Realty Inc." : "Homix Living Inc.",
      );
      assert.equal(
        row.input_snapshot.values.broker_license,
        catalog.agentIdentity.brokerLicense,
      );
      assert.equal(row.input_snapshot.values.agent_license, "SYNTHETIC-AGENT");
      assert.equal(row.input_snapshot.values.agent_name, "Synthetic Legal");
      assert.equal(row.input_snapshot.recipients[0].name, "Synthetic Legal");
      assert.equal(draft.parts[0].document.recipients.length, 2);
      console.log(
        `PASS Portal shared package: ${company}; settings/profile authoritative; forged company rejected`,
      );
    }
  } finally {
    session(null);
    await bridge.close();
    await store.close();
    await closeDatabaseConnections();
  }
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
