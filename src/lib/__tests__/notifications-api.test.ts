// Offline API regression: no real database or network requests.
import assert from "node:assert/strict";
import { test } from "node:test";
import { pgPool, closeDatabaseConnections } from "@/db";
import { GET } from "@/app/api/notifications/route";

test("notification summary skips list reads, enforces account scope and stays private", async (t) => {
  const identity = globalThis as typeof globalThis & { __agreementTestSession: unknown };
  identity.__agreementTestSession = { user: { agentId: 101, email: "agent@example.invalid", accountStatus: "active", isAdmin: false } };
  const queries: Array<{ sql: string; params: unknown[] }> = [];
  t.mock.method(pgPool, "query", async (query: { text: string }, params: unknown[]) => {
    const sql = query.text;
    queries.push({ sql, params });
    if (sql.includes('"is_admin", "account_status"')) return { rows: [[false, "active"]] };
    if (sql.includes("count(*)")) return { rows: [[7]] };
    if (sql.includes('"portal"."notifications"')) return { rows: [] };
    throw new Error(`Unexpected query: ${sql}`);
  });
  t.after(async () => { identity.__agreementTestSession = null; await closeDatabaseConnections(); });

  const summary = await GET(new Request("https://fixture.invalid/api/notifications?countOnly=1&agentId=999"));
  assert.ok(summary);
  assert.equal(summary.status, 200);
  assert.deepEqual(await summary.json(), { agentId: 101, unread: 7 });
  assert.equal(summary.headers.get("cache-control"), "private, no-store");
  const notificationQueries = queries.filter((q) => q.sql.includes('"portal"."notifications"'));
  assert.equal(notificationQueries.length, 1);
  assert.match(notificationQueries[0].sql, /count\(\*\)/);
  assert.deepEqual(notificationQueries[0].params, [101], "query-string identity cannot change account scope");

  queries.length = 0;
  const details = await GET(new Request("https://fixture.invalid/api/notifications"));
  assert.ok(details);
  assert.deepEqual(await details.json(), { agentId: 101, unread: 7, items: [] });
  assert.equal(queries.filter((q) => q.sql.includes('"portal"."notifications"')).length, 2);

  identity.__agreementTestSession = null;
  queries.length = 0;
  const unauthorized = await GET(new Request("https://fixture.invalid/api/notifications?countOnly=1"));
  assert.ok(unauthorized);
  assert.equal(unauthorized.status, 401);
  assert.equal(queries.length, 0);
});
