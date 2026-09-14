import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import path from "node:path";
import {
  GET as getBase,
  POST as postBase,
} from "@/app/api/signing/[...path]/route";
import {
  GET as adminGetBase,
  POST as adminPostBase,
} from "@/app/api/admin/signing/[...path]/route";
import { closeDatabaseConnections } from "@/db";
import {
  currentAgent,
  signingAgent,
  session,
  requireSigningTestDatabase,
} from "./signing-fixtures";

async function responseOf(response: Promise<Response | undefined>) {
  const result = await response;
  assert(result);
  return result;
}
const GET = (...args: Parameters<typeof getBase>) =>
  responseOf(getBase(...args));
const POST = (...args: Parameters<typeof postBase>) =>
  responseOf(postBase(...args));
const adminGet = (...args: Parameters<typeof adminGetBase>) =>
  responseOf(adminGetBase(...args));
const adminPost = (...args: Parameters<typeof adminPostBase>) =>
  responseOf(adminPostBase(...args));
async function main() {
  requireSigningTestDatabase();
  assert.equal(
    process.env.DATABASE_URL,
    "postgres://homix:synthetic-only@127.0.0.1:5569/homix_onboarding_integration",
  );
  const repo = process.env.ESIGN_REPO_PATH || path.resolve("../esign");
  const imp = (file: string) =>
    import(pathToFileURL(path.join(repo, `apps/bridge/src/${file}.ts`)).href);
  const { loadBridgeConfig } = await imp("config");
  const { BridgeStore } = await imp("store");
  const { SigningService } = await imp("service");
  const { buildServer } = await imp("server");
  const { sha256 } = await imp("documenso");
  const secret = "synthetic-company-package-api-key";
  process.env.ESIGN_BRIDGE_BASE_URL = "http://localhost:4113";
  process.env.ESIGN_BRIDGE_API_KEY = secret;
  Object.assign(process.env, {
    R2_ACCOUNT_ID: "synthetic-local-only",
    R2_LOCAL_ENDPOINT: "http://127.0.0.1:4569",
    R2_ACCESS_KEY_ID: "S3RVER",
    R2_SECRET_ACCESS_KEY: "S3RVER",
    R2_BUCKET_NAME: "homix-synthetic-hr",
    RESEND_API_KEY: "",
  });
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
  const ctx = (parts: string) => ({
    params: Promise.resolve({ path: parts.split("/") }),
  });
  const get = (parts: string) =>
    GET(
      new Request(`http://localhost/api/signing/${parts}`),
      ctx(parts.split("?")[0]),
    );
  const post = (parts: string, body: unknown, admin = false) =>
    (admin ? adminPost : POST)(
      new Request(
        `http://localhost/api/${admin ? "admin/" : ""}signing/${parts}`,
        {
          method: "POST",
          headers: {
            origin: "http://localhost",
            "content-type": "application/json",
          },
          body: JSON.stringify(body),
        },
      ),
      ctx(parts),
    );
  try {
    await bridge.listen({ port: 4113, host: "127.0.0.1" });
    const people = [];
    for (const [id, email, isAdmin] of [
      [10401, "qa-company-agent-a@example.invalid", false],
      [10402, "qa-company-agent-b@example.invalid", false],
      [10400, "qa-package-admin@example.invalid", true],
    ] as const) {
      let person = await currentAgent(id);
      if (!person)
        person = await signingAgent({
          id,
          email,
          isAdmin,
          accountStatus: "active",
          licensedCompanyId: "homix_realty",
          licensedCompany: "homix_realty",
          name: `Synthetic package ${id}`,
        });
      assert.equal(person.email, email);
      people.push(person);
    }
    const [agent, other, admin] = people;
    const inactive = await signingAgent({ accountStatus: "inactive" });
    session(inactive);
    assert.equal((await get("packages")).status, 403);
    session({ ...other, isAdmin: true });
    assert.equal(
      (
        await adminGet(
          new Request("http://localhost/api/admin/signing/connections"),
          ctx("connections"),
        )
      ).status,
      403,
    );
    const runs = JSON.parse(
      await readFile(
        "/private/tmp/homix-documenso-integration/company-stage-one-run.json",
        "utf8",
      ),
    );
    const completed = runs.cases[0];
    assert(completed?.requestId);
    session(null);
    assert.equal((await get("packages")).status, 401);
    session(agent);
    assert.equal((await post("uploads", {})).status, 403);
    assert.equal((await post("requests", { scenario: "custom" })).status, 403);
    assert.equal(
      (
        await post("requests", {
          scenario: "buyer",
          companyKey: "homix_living",
        })
      ).status,
      403,
    );
    assert.equal(
      (
        await adminGet(
          new Request("http://localhost/api/admin/signing/connections"),
          ctx("connections"),
        )
      ).status,
      403,
    );
    assert.equal((await get(`requests/${completed.requestId}`)).status, 200);
    const bundle = await get(`requests/${completed.requestId}/bundle`);
    assert.equal(bundle.status, 200);
    assert.match(
      bundle.headers.get("content-disposition") ?? "",
      /filename\*=UTF-8''/,
    );
    const seedResponse = await get(`requests/${completed.requestId}/reissue`);
    assert.equal(seedResponse.status, 200);
    const seed = await seedResponse.json(),
      key = crypto.randomUUID();
    const createResponse = await post("requests", {
      ...seed,
      idempotencyKey: key,
      externalReference: `portal:${key}`,
      reissueReason: "Synthetic Portal preparation",
      ownerAgentId: other.id,
    });
    assert.equal(createResponse.status, 201);
    const draft = await createResponse.json();
    assert.equal(draft.ownerAgentId, agent.id, "BFF overwrites forged owner");
    assert.equal(
      (
        await post(`requests/${draft.id}/parts/${draft.parts[0].id}/access`, {
          kind: "editor",
        })
      ).status,
      403,
    );
    const reviewResponse = await get(`requests/${draft.id}/review`);
    assert.equal(reviewResponse.status, 200);
    const review = await reviewResponse.json();
    assert.equal(review.files.length, 2);
    const file = review.files[0];
    const original = await get(
      `requests/${draft.id}/parts/${file.partId}/files?kind=original&itemId=${file.id}`,
    );
    assert.equal(original.status, 200);
    assert.match(
      original.headers.get("content-disposition") ?? "",
      /filename\*=UTF-8''/,
    );
    assert.equal(
      Buffer.from(await original.arrayBuffer())
        .subarray(0, 5)
        .toString(),
      "%PDF-",
    );
    session(other);
    for (const suffix of [
      "",
      "/review",
      "/reissue",
      "/bundle",
      `/parts/${file.partId}/files?kind=original&itemId=${file.id}`,
    ])
      assert.equal((await get(`requests/${draft.id}${suffix}`)).status, 404);
    assert.equal(
      (await post(`requests/${draft.id}/commands`, { action: "remind" }))
        .status,
      404,
    );
    session(admin);
    const connections = await (
      await adminGet(
        new Request("http://localhost/api/admin/signing/connections"),
        ctx("connections"),
      )
    ).json();
    const connection = connections.items.find(
      (c: { scope: string }) => c.scope === "company",
    );
    assert(connection);
    const bytes = await readFile(
      "/private/tmp/homix-documenso-integration/synthetic-paper-qa.pdf",
    );
    const stageResponse = await post(
      `connections/${connection.id}/template-uploads`,
      {
        fileName: "Synthetic Portal company upload.pdf",
        byteSize: bytes.length,
      },
      true,
    );
    assert.equal(stageResponse.status, 200);
    const stage = await stageResponse.json();
    assert(new URL(stage.uploadUrl).hostname === "127.0.0.1");
    const put = await fetch(stage.uploadUrl, {
      method: "PUT",
      headers: { "Content-Type": "application/pdf" },
      body: bytes,
    });
    assert(put.ok);
    const upload = {
      uploadId: crypto.randomUUID(),
      title: "Synthetic company Portal upload - NOT A CONTRACT",
      uploads: [
        { id: stage.uploadId, name: "Synthetic Portal company upload.pdf" },
      ],
    };
    const result = await post(
      `connections/${connection.id}/templates`,
      upload,
      true,
    );
    assert.equal(result.status, 201);
    const template = await result.json();
    assert(template.editorUrl.includes("/templates/"));
    const repeat = await post(
      `connections/${connection.id}/templates`,
      upload,
      true,
    );
    assert.equal(repeat.status, 201);
    assert.equal((await repeat.json()).id, template.id);
    session(agent);
    assert.equal(
      (await post(`connections/${connection.id}/templates`, upload, true))
        .status,
      403,
    );
    console.log(
      "PASS: Portal company upload via private S3 staging, idempotency, published catalog, structured preparation, owner/company enforcement, read-only PDF preview, ZIP and cross-agent denials.",
    );
  } finally {
    await bridge.close();
    await store.close();
    await closeDatabaseConnections();
  }
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
