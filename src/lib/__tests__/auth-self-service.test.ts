import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";
import { NextRequest } from "next/server";
import type { Session } from "next-auth";
import { authConfig } from "../../auth.config";
import { ONBOARDING_ENTRY_COOKIE, onboardingEntryForSignIn, serializeOnboardingEntry } from "../onboarding-entry";

// Execute the actual resolver and Google callback without booting Next or
// contacting OAuth, Postgres or email providers. Database/identity lookups are
// controlled here; the production control flow is not copied into the test.
const source = ts.createSourceFile("auth.ts", readFileSync("src/auth.ts", "utf8"), ts.ScriptTarget.Latest, true);
const resolver = source.statements.find((node): node is ts.FunctionDeclaration =>
  ts.isFunctionDeclaration(node) && node.name?.text === "upsertAgentFromGoogle");
let callback: ts.MethodDeclaration | undefined;
function visit(node: ts.Node) {
  if (ts.isMethodDeclaration(node) && node.name.getText(source) === "signIn") callback = node;
  ts.forEachChild(node, visit);
}
visit(source);
assert.ok(resolver && callback, "The actual auth resolver and verified-Google callback must be tested");
const code = ts.transpileModule(`${resolver.getText(source)}\nreturn { upsertAgentFromGoogle, ...({ ${callback.getText(source)} }) };`, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
}).outputText;
type Identity = { id: number; email: string; accountStatus: string; isAdmin?: boolean };
class LegacyClaimError extends Error { code = "INVALID_INVITATION"; }
function harness(options: {
  subject?: Identity; email?: Identity; existing?: Identity; alias?: Identity;
  cookie?: Record<string, string>; invitation?: boolean; claimConflict?: boolean;
} = {}) {
  const writes: { table: string; values: Record<string, unknown> }[] = [];
  const identities: { id: number; reason: string }[] = [];
  const deferred: (() => Promise<void>)[] = [];
  const tables = { agents: { table: "agents", email: "email", pendingEmail: "pendingEmail" },
    agentEmailAddresses: { table: "emails" }, agentLoginIdentities: { table: "identities" } };
  const rows = [options.existing, options.alias];
  const db = {
    select: () => ({ from: () => ({ where: () => ({ limit: async () => {
      const row = rows.shift(); return row ? [row] : [];
    } }) }) }),
    insert: (table: { table: string }) => ({ values: (values: Record<string, unknown>) => {
      writes.push({ table: table.table, values });
      return { onConflictDoNothing: () => ({ returning: async () => [{ id: 99, ...values }] }) };
    } }),
    transaction: async (fn: (tx: unknown) => unknown) => fn(db),
  };
  const scope = {
    db, ...tables, ONBOARDING_ENTRY_COOKIE, onboardingEntryForSignIn,
    ONBOARDING_INVITE_COOKIE: "invite", LEGACY_CLAIM_COOKIE: "claim", LegacyClaimError,
    normalizeEmail: (email: string) => email.trim().toLowerCase(),
    isConfiguredAdminEmail: (email: string) => email === "admin@example.invalid",
    cookies: async () => ({ get: (key: string) => options.cookie?.[key] ? { value: options.cookie[key] } : undefined,
      delete: () => undefined }),
    findUsableInvitation: async () => options.invitation,
    claimLegacyAgent: async () => { if (options.claimConflict) throw new LegacyClaimError(); return null; },
    agentForGoogleSubject: async () => options.subject || null,
    agentForVerifiedLoginEmail: async () => options.email || null,
    recordVerifiedGoogleIdentity: async (agent: Identity, _email: string, _sub: string, reason: string) => { identities.push({ id: agent.id, reason }); },
    reconcileConfiguredAccess: async (agent: Identity) => agent,
    completeEmailAliasLink: async (agent: Identity) => agent,
    PLAN_SPLIT_PCT: { solo: 80, solo_pro: 100 }, DEFAULT_AGENT_SPLIT_PCT: 80,
    dbDatePart: (value: string) => value.slice(0, 10),
    sql: () => undefined, eq: () => undefined,
    after: (fn: () => Promise<void>) => deferred.push(fn),
  };
  const result = new Function(...Object.keys(scope), code)(...Object.values(scope)) as {
    upsertAgentFromGoogle: (user: { email: string; name: string; providerSubject: string }) => Promise<Identity>;
    signIn: (input: { account: { provider: string; providerAccountId?: string }; profile: { email: string; email_verified?: boolean; name: string } }) => Promise<boolean | string>;
  };
  return { ...result, writes, identities, deferred };
}

async function main() {
  const user = { email: " New.Agent@example.invalid ", name: "Synthetic Agent", providerSubject: "google-synthetic-new" };
  const fresh = harness();
  const created = await fresh.upsertAgentFromGoogle(user);
  assert.equal(created.accountStatus, "pending", "Ordinary verified sign-in must start onboarding, not fail or grant full access");
  assert.equal(created.isAdmin, false);
  assert.equal(created.email, "new.agent@example.invalid");
  assert.deepEqual(fresh.writes.map(row => row.table), ["agents", "emails", "identities"]);
  assert.equal(fresh.writes[1].values.canSignIn, true);
  assert.ok(fresh.writes[1].values.verifiedAt);
  assert.equal(fresh.writes[2].values.providerSubject, user.providerSubject);
  assert.equal(fresh.deferred.length, 1);

  for (const accountStatus of ["pending", "active", "inactive"]) {
    for (const match of ["subject", "email", "existing", "alias"] as const) {
      const original = { id: 17, email: "original@example.invalid", accountStatus };
      const known = harness({ [match]: original });
      const resolved = await known.upsertAgentFromGoogle(user);
      assert.equal(resolved.id, original.id, match);
      assert.equal(resolved.accountStatus, accountStatus);
      assert.equal(known.writes.length, 0);
    }
  }
  const invitation = harness({ cookie: { invite: "synthetic" }, invitation: true });
  assert.equal((await invitation.upsertAgentFromGoogle(user)).accountStatus, "pending");
  const application = harness({ cookie: { [ONBOARDING_ENTRY_COOKIE]: serializeOnboardingEntry({ source: "website", locale: "zh", plan: "solo_pro", campaign: null }) } });
  await application.upsertAgentFromGoogle(user);
  assert.equal(application.writes[0].values.plan, "solo_pro");
  assert.equal(application.writes[0].values.onboardingSource, "website");
  const claim = harness({ cookie: { claim: "synthetic-claim" }, claimConflict: true });
  await assert.rejects(claim.upsertAgentFromGoogle(user), LegacyClaimError);
  assert.equal(claim.writes.length, 0, "A conflicting legacy claim must not fall through into a duplicate signup");

  const google = { account: { provider: "google", providerAccountId: user.providerSubject },
    profile: { email: user.email, email_verified: true, name: user.name } };
  for (const input of [
    { ...google, profile: { ...google.profile, email_verified: false } },
    { ...google, profile: { ...google.profile, email_verified: undefined } },
    { ...google, account: { provider: "other", providerAccountId: user.providerSubject } },
    { ...google, account: { provider: "google" } },
  ]) {
    const rejected = harness();
    assert.equal(await rejected.signIn(input), false);
    assert.equal(rejected.writes.length, 0);
  }
  const verified = harness();
  assert.equal(await verified.signIn(google), true);
  assert.equal(verified.writes[0].values.accountStatus, "pending");

  // Pending self-registration is routing admission for onboarding only, not
  // membership access to the business APIs or other agents' data.
  const authorized = authConfig.callbacks!.authorized!;
  const session = (accountStatus: string) => ({ user: { id: "99", agentId: 99,
    email: "new.agent@example.invalid", isAdmin: false, accountStatus },
    expires: "2099-01-01T00:00:00.000Z" }) as Session;
  for (const path of ["/pending", "/api/onboarding/profile", "/api/onboarding/agreement", "/api/checkout"])
    assert.equal(await authorized({ request: new NextRequest(`http://localhost${path}`), auth: session("pending") }), true);
  for (const path of ["/api/rental", "/api/agents", "/api/invoices"])
    assert.equal(await authorized({ request: new NextRequest(`http://localhost${path}`), auth: session("pending") }), false);
  const redirect = await authorized({ request: new NextRequest("http://localhost/"), auth: session("pending") });
  assert.ok(redirect instanceof Response);
  assert.equal(new URL(redirect.headers.get("location")!).pathname, "/pending");
  assert.equal(await authorized({ request: new NextRequest("http://localhost/"), auth: session("active") }), true);
  console.log("PASS: actual Google resolver/callback; new verified email -> pending; identities/aliases/inactive access preserved; invite context and legacy-claim conflicts retained; unverified OAuth denied (isolated mocks, no external writes)");
}
void main();
