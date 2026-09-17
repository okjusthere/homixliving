import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import postgres from "postgres";
import { eq } from "drizzle-orm";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import ts from "typescript";
import type { NextAuthConfig, Session } from "next-auth";

// Isolated local database only; no Google requests or production mutations.
const configured = new URL(process.env.DATABASE_URL || "postgres://postgres@localhost:5499/homixliving");
assert.ok(["localhost", "127.0.0.1"].includes(configured.hostname), "Local test DB only");
const databaseName = `homix_admin_access_${randomUUID().replaceAll("-", "")}`;
const adminUrl = new URL(configured);
adminUrl.pathname = "/postgres";
const testUrl = new URL(configured);
testUrl.pathname = `/${databaseName}`;
process.env.DATABASE_URL = testUrl.toString();
process.env.ADMIN_EMAILS = " MAIN@example.invalid , alias-grant@example.invalid, suspended@example.invalid, pending@example.invalid ";
const admin = postgres(adminUrl.toString(), { max: 1, onnotice: () => {} });
const globals = globalThis as typeof globalThis & { __agreementTestSession: unknown };

async function main() {
  await admin.unsafe(`CREATE DATABASE ${databaseName}`);
  const { db, pgClient, closeDatabaseConnections } = await import("@/db");
  try {
    const { ensureSchema } = await import("@/db/ensure-schema");
    await ensureSchema(pgClient);
    const { agents, agentEmailAddresses, auditLog } = await import("@/db/schema");
    const { hasConfiguredAdminAccess, hasConfiguredAdminLoginAccess, reconcileConfiguredAccess } = await import("@/lib/admin-access");
    const { requireAdminApi, requireActiveAgentApi } = await import("@/lib/auth-guards");
    const { contentActor } = await import("@/lib/content/api");
    const { adminAgentIds } = await import("@/lib/notify");
    const [primary, alias, suspended, pending, removed, ordinary] = await db.insert(agents).values([
      { name: "Primary Admin", email: "main@example.invalid", accountStatus: "active" as const, isAdmin: true },
      { name: "Alias Admin", email: "personal@example.invalid", accountStatus: "active" as const, isAdmin: true },
      { name: "Suspended Admin", email: "suspended@example.invalid", accountStatus: "inactive" as const, isAdmin: false },
      { name: "Pending Admin", email: "pending@example.invalid", accountStatus: "pending" as const, isAdmin: false },
      { name: "Former Admin", email: "removed@example.invalid", accountStatus: "active" as const, isAdmin: true },
      { name: "Ordinary Agent", email: "ordinary@example.invalid", accountStatus: "active" as const, isAdmin: false },
    ]).returning();
    const [loginAlias] = await db.insert(agentEmailAddresses).values({
      agentId: alias.id, email: "ALIAS-GRANT@example.invalid", kind: "login", canSignIn: true,
      verifiedAt: new Date().toISOString(), source: "test",
    }).returning();

    // Run callbacks compiled directly from the real server entry. Only Auth.js
    // construction and request cookies are replaced; identity and DB work remain
    // real. This avoids both an OAuth server and the generic auth() session stub.
    const authUrl = new URL("../../auth.ts", import.meta.url);
    const requireFromAuth = createRequire(authUrl);
    const captured: { config?: NextAuthConfig } = {};
    const compiled = ts.transpileModule(readFileSync(authUrl, "utf8"), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
    }).outputText;
    const testRequire = (specifier: string) => {
      if (specifier === "next-auth") return (config: NextAuthConfig) => { captured.config = config; return {}; };
      if (specifier === "next/headers") return { cookies: async () => ({ get: () => undefined, delete: () => undefined }) };
      return requireFromAuth(specifier);
    };
    const testModule = { exports: {} };
    new Function("require", "exports", "module", compiled)(testRequire, testModule.exports, testModule);
    const jwt = captured.config?.callbacks?.jwt;
    const projectSession = captured.config?.callbacks?.session;
    assert.ok(jwt && projectSession);
    const oauth = async (email: string, subject: string, verified = true, userEmail = email) => {
      const token = await jwt({ token: {}, user: { id: subject, email: userEmail }, account: { provider: "google", providerAccountId: subject, type: "oidc" },
        profile: { email, email_verified: verified }, trigger: "signIn", isNewUser: false });
      assert.ok(token);
      return token;
    };
    const listedLogin = await oauth(loginAlias.email, "synthetic-configured-alias");
    assert.equal(listedLogin.agentId, alias.id);
    assert.equal(listedLogin.email, alias.email, "Canonical business email remains independent of the actual login");
    assert.equal(listedLogin.loginEmail, loginAlias.email.toLowerCase());
    assert.equal(listedLogin.isAdmin, true);
    const personalLogin = await oauth(alias.email, "synthetic-personal-alias", true, loginAlias.email);
    assert.equal(personalLogin.loginEmail, alias.email, "Only the verified Google profile establishes loginEmail");
    assert.equal(personalLogin.isAdmin, false, "A configured email elsewhere on the same Agent grants no role to this login");
    const [unchangedGrant] = await db.select().from(agents).where(eq(agents.id, alias.id));
    assert.equal(unchangedGrant.isAdmin, true, "Personal login does not demote the configured session's Agent");
    await assert.rejects(oauth(loginAlias.email, "synthetic-unverified", false), /Verified Google login email/);
    for (const trigger of [undefined, "update"] as const) {
      const legacy = await jwt({ token: { agentId: primary.id, email: primary.email, isAdmin: true, accountStatus: "active", isTeamLeader: false, checkedAt: Date.now() },
        trigger, session: { loginEmail: primary.email },
      } as Parameters<typeof jwt>[0]);
      assert.ok(legacy);
      assert.equal(legacy.loginEmail, undefined, "Session updates cannot manufacture an OAuth login address");
      assert.equal(legacy.isAdmin, false, "Legacy JWTs fail closed even while fresh or explicitly refreshed");
    }
    for (const [loginEmail, expected] of [[loginAlias.email.toLowerCase(), true], [alias.email, false], [undefined, false]] as const) {
      const projected = await projectSession({ session: { user: { email: alias.email }, expires: new Date(Date.now() + 60_000).toISOString() },
        token: { agentId: alias.id, email: alias.email, isAdmin: true, accountStatus: "active", loginEmail },
      } as Parameters<typeof projectSession>[0]) as Session;
      assert.equal(projected.user.isAdmin, expected, "Browser/sidebar session follows the actual login address");
    }
    const login = (agent: typeof primary, loginEmail: string | null = agent.email) => {
      // Claims deliberately disagree with current DB/configuration. A stable
      // agent ID, not the token's old email, binds the business identity.
      globals.__agreementTestSession = { user: {
        agentId: agent.id, email: "old-profile@example.invalid", loginEmail, isAdmin: true, accountStatus: "active",
      } };
    };
    async function expectAdmin(agent: typeof primary, status: number, loginEmail: string | null = agent.email) {
      login(agent, loginEmail);
      const result = await requireAdminApi();
      assert.equal("error" in result ? result.error!.status : 200, status, agent.name);
    }
    globals.__agreementTestSession = null;
    const anonymous = await requireAdminApi();
    assert.equal("error" in anonymous && anonymous.error?.status, 401);
    await expectAdmin(primary, 200);
    await expectAdmin(primary, 403, null);
    assert.ok("session" in await requireActiveAgentApi(), "Legacy sessions keep ordinary active-agent access");
    await expectAdmin(alias, 403, alias.email);
    await expectAdmin(alias, 200, loginAlias.email);
    assert.equal((await reconcileConfiguredAccess(alias, "Personal Alias")).isAdmin, true,
      "An unlisted login must not revoke another listed login on the same Agent");
    await expectAdmin(alias, 403, alias.email);
    await expectAdmin(alias, 200, loginAlias.email);
    await expectAdmin(alias, 403, primary.email);
    assert.equal(await hasConfiguredAdminLoginAccess(alias.id, alias.email), false);
    assert.equal(await hasConfiguredAdminLoginAccess(alias.id, loginAlias.email), true);
    assert.equal(await hasConfiguredAdminLoginAccess(alias.id, primary.email), false,
      "A listed address belonging to another Agent cannot authorize this Agent");

    await expectAdmin(ordinary, 403);
    await expectAdmin(removed, 403);
    const deniedContent = await contentActor(new Request("http://localhost/api/content/templates"), true);
    assert.ok(deniedContent instanceof Response);
    assert.equal(deniedContent.status, 403, "Content cannot restore the stale database admin role");
    const ordinaryContent = await contentActor(new Request("http://localhost/api/content/templates"));
    assert.ok(!(ordinaryContent instanceof Response));
    assert.equal(ordinaryContent.admin, false);
    const [beforeRefresh] = await db.select().from(agents).where(eq(agents.id, removed.id));
    assert.equal(beforeRefresh.isAdmin, true, "The guard blocks stale DB grants before the JWT refresh");
    assert.equal((await reconcileConfiguredAccess(beforeRefresh, null)).isAdmin, false);
    login(removed);
    assert.ok("session" in await requireActiveAgentApi(), "Demotion preserves ordinary active-agent access");

    for (const agent of [suspended, pending]) {
      const refreshed = await reconcileConfiguredAccess(agent, agent.name);
      assert.equal(refreshed.isAdmin, true, "Configured role is projected without changing lifecycle");
      assert.equal(refreshed.accountStatus, agent.accountStatus, "Sign-in/session refresh must never reactivate");
      await expectAdmin(agent, 403);
      const active = await requireActiveAgentApi();
      assert.equal("error" in active && active.error?.status, 403);
      const refreshedAgain = await reconcileConfiguredAccess(refreshed, agent.name);
      assert.equal(refreshedAgain.accountStatus, agent.accountStatus, "Repeated login does not reactivate either");
    }
    assert.deepEqual((await adminAgentIds()).sort((a, b) => a - b), [primary.id, alias.id],
      "Suspended, pending and unconfigured administrators do not receive administrative notifications");

    await db.update(agentEmailAddresses).set({ canSignIn: false }).where(eq(agentEmailAddresses.id, loginAlias.id));
    assert.equal(await hasConfiguredAdminAccess(alias.id), false, "Disabled alias cannot authorize");
    await expectAdmin(alias, 403, loginAlias.email);
    await db.update(agentEmailAddresses).set({ canSignIn: true, verifiedAt: null }).where(eq(agentEmailAddresses.id, loginAlias.id));
    assert.equal(await hasConfiguredAdminAccess(alias.id), false, "Unverified alias cannot authorize");
    await expectAdmin(alias, 403, loginAlias.email);
    await db.update(agentEmailAddresses).set({ verifiedAt: new Date().toISOString() }).where(eq(agentEmailAddresses.id, loginAlias.id));
    await expectAdmin(alias, 200, loginAlias.email);

    // Removing configuration takes effect on the next request without waiting
    // for token expiration or changing the person's ordinary active status.
    process.env.ADMIN_EMAILS = "unrelated@example.invalid";
    assert.deepEqual(await adminAgentIds(), [], "Configuration revocation immediately stops admin notifications");
    await expectAdmin(primary, 403);
    await expectAdmin(alias, 403, loginAlias.email);
    assert.equal((await reconcileConfiguredAccess(primary, null)).isAdmin, false);
    assert.equal((await reconcileConfiguredAccess(alias, null)).isAdmin, false);
    process.env.ADMIN_EMAILS = "";
    assert.equal(await hasConfiguredAdminAccess(primary.id), false);
    globals.__agreementTestSession = { user: { agentId: 2147483647, email: "old@example.invalid", isAdmin: true } };
    const deleted = await requireAdminApi();
    assert.equal("error" in deleted && deleted.error?.status, 401);
    const revoked = await db.select().from(auditLog).where(eq(auditLog.action, "configured_admin_revoked"));
    assert.equal(revoked.length, 3, "Each persisted grant removal leaves an audit entry");
    console.log("PASS: exact Google login allowlist required; legacy sessions and unlisted aliases cannot administer; another valid login keeps its account grant; disabled/unverified aliases denied; suspended/pending accounts never reactivate; notifications and role audit verified.");
  } finally {
    globals.__agreementTestSession = null;
    await closeDatabaseConnections();
  }
}

main().finally(async () => {
  await admin.unsafe(`DROP DATABASE IF EXISTS ${databaseName} WITH (FORCE)`);
  await admin.end();
}).catch(error => { console.error(error); process.exitCode = 1; });
