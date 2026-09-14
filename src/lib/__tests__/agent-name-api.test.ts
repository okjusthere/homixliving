// Offline route regression: every database query and external request is mocked.
import assert from "node:assert/strict";
import { mock, test } from "node:test";
import { pgPool, closeDatabaseConnections } from "@/db";
import { GET, POST } from "@/app/api/signing/[...path]/route";
import type { SigningPackage } from "@/lib/signing-contract";
import { linkPublicProfile, publishPublicProfile, syncPublicIdentity } from "@/lib/homixweb";
import { loadBrand } from "@/lib/content/brand";
import { onboardingSigningContextHash } from "@/lib/signing-onboarding";
import type { Agent } from "@/db/schema";

async function responseOf(value: Promise<Response | undefined>) {
  const response = await value;
  assert.ok(response);
  return response;
}

test("package API binds server legal identity despite spoofed names and owner ids", async (t) => {
  const priorEnv = { ...process.env };
  t.after(async () => { mock.restoreAll(); process.env = priorEnv; await closeDatabaseConnections(); });
  process.env.ESIGN_BRIDGE_BASE_URL = "http://localhost:4113";
  process.env.ESIGN_BRIDGE_API_KEY = "synthetic-offline-only";
  const globals = globalThis as typeof globalThis & { __agreementTestSession: unknown };
  globals.__agreementTestSession = { user: { agentId: 101, email: "agent@example.invalid", name: "Grace", accountStatus: "active", isAdmin: false } };
  t.after(() => { globals.__agreementTestSession = null; });
  let legalName: string | null = "Jiaer Xia";
  mock.method(pgPool, "query", async (query: string | { text: string }) => {
    const sql = typeof query === "string" ? query : query.text;
    if (sql.includes('"is_admin", "account_status"')) return { rows: [[false, "active"]] };
    if (sql.includes("portal.agent_email_addresses")) return { rows: [{ email: "agent@example.invalid" }] };
    if (sql.includes("SELECT licensed_company_id")) return { rows: [{ licensed_company_id: "homix_realty", licensed_company: "Homix Realty Inc." }] };
    if (sql.includes('select "legal_name", "email"')) return { rows: [[legalName, "agent@example.invalid"]] };
    if (sql.includes('select "legal_name"')) return { rows: [[legalName]] };
    throw new Error(`Unexpected offline query: ${sql}`);
  });
  const published: SigningPackage = {
    id: "00000000-0000-4000-8000-000000000001", package_key: "synthetic", version: 1,
    title: "Synthetic buyer package", scenario: "buyer", company_key: "homix_realty", selectors: {},
    definition: [{ title: "Synthetic", templateId: "template", connectionId: "connection", fingerprint: "hash", files: [],
      roles: [{ key: "agent", actor: "owner", label: "Agent", templateRecipientId: 1 }, { key: "buyer", actor: "customer", label: "Buyer", templateRecipientId: 2 }],
      prefill: [{ key: "agent_name", templateFieldId: 1, required: true, label: "Agent Legal name" }],
    }],
  };
  const posted: Array<Record<string, unknown>> = [];
  mock.method(globalThis, "fetch", async (url: string | URL, init?: RequestInit) => {
    if (String(url) === "http://localhost:4113/v1/packages") return Response.json({ items: [published] });
    assert.equal(String(url), "http://localhost:4113/v1/packages/preview", "never send a real signing invitation");
    const body = JSON.parse(String(init?.body));
    posted.push(body);
    return Response.json({ preview: true });
  });
  const context = { params: Promise.resolve({ path: ["packages", "preview"] }) };
  const payload = { scenario: "buyer", companyKey: "homix_realty", packageId: published.id, ownerAgentId: 999,
    recipients: [{ key: "agent", name: "Spoofed Preferred", email: "agent@example.invalid" }, { key: "buyer", name: "Customer Legal", email: "buyer@example.invalid" }],
    values: { agent_name: "Nickname", customer_name: "Customer Legal" },
  };
  const request = (origin = "http://localhost") => new Request("http://localhost/api/signing/packages/preview", { method: "POST", headers: { origin, "content-type": "application/json" }, body: JSON.stringify(payload) });
  const catalog = await responseOf(GET(new Request("http://localhost/api/signing/packages"), { params: Promise.resolve({ path: ["packages"] }) }));
  assert.equal(catalog.status, 200);
  assert.deepEqual((await catalog.json()).agentIdentity, { legalName: "Jiaer Xia", email: "agent@example.invalid" });
  assert.equal((await responseOf(POST(request(), context))).status, 200);
  assert.equal(posted[0].ownerAgentId, 101);
  assert.equal((posted[0].values as Record<string, string>).agent_name, "Jiaer Xia");
  assert.deepEqual(posted[0].recipients, [{ ...payload.recipients[0], name: "Jiaer Xia" }, payload.recipients[1]]);
  assert.equal((await responseOf(POST(request("https://untrusted.invalid"), context))).status, 403);
  legalName = null;
  const blocked = await responseOf(POST(request(), context));
  assert.equal(blocked.status, 409);
  assert.equal((await blocked.json()).error, "LEGAL_NAME_REQUIRED");
  assert.equal(posted.length, 1, "missing Legal name never creates or previews a package");
  globals.__agreementTestSession = null;
  assert.equal((await responseOf(POST(request(), context))).status, 401);
});

test("website APIs use the combined name while newly loaded poster branding uses Preferred name", async (t) => {
  const saved = { ...process.env };
  t.after(() => { mock.restoreAll(); process.env = saved; });
  process.env.HOMIXWEB_REVALIDATE_URL = "https://website.example.invalid/api/revalidate-agents";
  process.env.AGENTS_REVALIDATE_SECRET = "synthetic-offline-only";
  const outbound: Array<Record<string, unknown>> = [];
  mock.method(globalThis, "fetch", async (url: string | URL, init?: RequestInit) => {
    assert.equal(new URL(String(url)).origin, "https://website.example.invalid");
    if (init?.method === "POST") {
      outbound.push(JSON.parse(String(init.body)));
      return Response.json({ ok: true, verificationStatus: "verified" });
    }
    return Response.json({ profile: { name: "Jiaer Xia (Grace)", phone: "555", photo_url: "/portrait.jpg" }, linked: true });
  });
  const input = { agentId: 101, name: "Grace Xia", legalName: "Jiaer Xia", phone: "555", license: "synthetic" };
  await linkPublicProfile({ ...input, publicId: "gracexia" });
  await publishPublicProfile(input);
  await syncPublicIdentity(input);
  assert.equal(outbound.length, 3);
  assert.ok(outbound.every((body) => body.name === "Jiaer Xia (Grace)"));
  assert.equal((await syncPublicIdentity({ ...input, legalName: null })).status, 409);
  assert.equal(outbound.length, 3, "unverified legacy names do not overwrite existing public identities");
  mock.method(pgPool, "query", async () => ({ rows: [{ id: 101, name: "Grace Xia", email: "agent@example.invalid", phone: "555", license_number: "synthetic", licensed_company_id: "homix_realty", company_name: "Homix Realty Inc." }] }));
  assert.equal((await loadBrand(101)).name, "Grace Xia");
});

test("changing Preferred name leaves an established onboarding signing context unchanged", () => {
  const agent = { id: 101, name: "Grace Xia", legalName: "Jiaer Xia", email: "agent@example.invalid", licensedCompanyId: "homix_realty", plan: "solo" } as Agent;
  assert.equal(onboardingSigningContextHash(agent), onboardingSigningContextHash({ ...agent, name: "Grace" }));
  assert.notEqual(onboardingSigningContextHash(agent), onboardingSigningContextHash({ ...agent, legalName: "Another Legal Person" }));
});
