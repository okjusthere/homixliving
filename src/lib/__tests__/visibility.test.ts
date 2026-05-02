import assert from "node:assert/strict";
import { existsSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createClient } from "@libsql/client";

const dbPath = join(tmpdir(), `homix-visibility-${Date.now()}-${Math.random().toString(36).slice(2)}.db`);
process.env.TURSO_DATABASE_URL = `file:${dbPath}`;
delete process.env.TURSO_AUTH_TOKEN;

const client = createClient({ url: process.env.TURSO_DATABASE_URL });

async function execute(sql: string) {
  await client.execute(sql);
}

async function setup() {
  await execute("PRAGMA foreign_keys = ON");
  await execute(`
    CREATE TABLE buildings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      region TEXT NOT NULL,
      name TEXT NOT NULL
    )
  `);
  await execute(`
    CREATE TABLE teams (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      leader_agent_id INTEGER,
      notes TEXT
    )
  `);
  await execute(`
    CREATE TABLE agents (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      split_pct REAL NOT NULL DEFAULT 50,
      team_id INTEGER REFERENCES teams(id) ON DELETE SET NULL,
      is_admin INTEGER NOT NULL DEFAULT 0,
      is_active INTEGER NOT NULL DEFAULT 0
    )
  `);
  await execute(`
    CREATE TABLE deals (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      building_id INTEGER NOT NULL REFERENCES buildings(id),
      unit TEXT NOT NULL,
      tenant_name TEXT NOT NULL,
      total_commission REAL NOT NULL,
      licensed_company TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'active',
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);
  await execute(`
    CREATE TABLE deal_agents (
      deal_id INTEGER NOT NULL REFERENCES deals(id) ON DELETE CASCADE,
      agent_id INTEGER NOT NULL REFERENCES agents(id) ON DELETE RESTRICT,
      share_pct REAL NOT NULL,
      is_primary INTEGER NOT NULL DEFAULT 0,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (deal_id, agent_id)
    )
  `);

  await execute("INSERT INTO buildings (id, region, name) VALUES (1, 'NYC', 'Test Building')");
  await execute("INSERT INTO teams (id, name, leader_agent_id) VALUES (1, 'Rental Team', 4)");
  await execute(`
    INSERT INTO agents (id, name, email, split_pct, team_id, is_admin, is_active) VALUES
      (1, 'Participant', 'participant@example.com', 70, NULL, 0, 1),
      (2, 'Outsider', 'outsider@example.com', 70, NULL, 0, 1),
      (3, 'Team Member', 'member@example.com', 70, 1, 0, 1),
      (4, 'Team Leader', 'leader@example.com', 70, NULL, 0, 1),
      (5, 'Inactive Participant', 'inactive@example.com', 70, NULL, 0, 0)
  `);
  await execute(`
    INSERT INTO deals (id, building_id, unit, tenant_name, total_commission, licensed_company, status) VALUES
      (101, 1, '1A', 'Self Deal', 5000, 'Homix Living Inc.', 'active'),
      (102, 1, '2B', 'Team Deal', 6000, 'Homix Living Inc.', 'active'),
      (103, 1, '3C', 'Inactive Deal', 7000, 'Homix Living Inc.', 'active')
  `);
  await execute(`
    INSERT INTO deal_agents (deal_id, agent_id, share_pct, is_primary) VALUES
      (101, 1, 100, 1),
      (102, 3, 100, 1),
      (103, 5, 100, 1)
  `);
}

async function main() {
  try {
    await setup();

    const { db } = await import("@/db");
    const { deals } = await import("@/db/schema");
    const { canEditDeal, canViewDeal, dealsVisibleToSql } = await import("../visibility");

    type TestSession = Parameters<typeof canViewDeal>[0];

    async function visibleDealIds(session: TestSession) {
      const filter = dealsVisibleToSql(session);
      const rows = filter
        ? await db.select({ id: deals.id }).from(deals).where(filter)
        : await db.select({ id: deals.id }).from(deals);
      return rows.map((row) => row.id).sort((a, b) => a - b);
    }

    const adminSession: TestSession = { user: { agentId: 99, isAdmin: true, isActive: true } };
    assert.deepEqual(await visibleDealIds(adminSession), [101, 102, 103]);
    assert.equal(await canViewDeal(adminSession, 101), true);
    assert.equal(await canEditDeal(adminSession, 101), true);

    const participantSession: TestSession = { user: { agentId: 1, isAdmin: false, isActive: true } };
    assert.deepEqual(await visibleDealIds(participantSession), [101]);
    assert.equal(await canViewDeal(participantSession, 101), true);
    assert.equal(await canEditDeal(participantSession, 101), true);

    const leaderSession: TestSession = { user: { agentId: 4, isAdmin: false, isActive: true } };
    assert.deepEqual(await visibleDealIds(leaderSession), [102]);
    assert.equal(await canViewDeal(leaderSession, 102), true);
    assert.equal(await canEditDeal(leaderSession, 102), false);

    const outsiderSession: TestSession = { user: { agentId: 2, isAdmin: false, isActive: true } };
    assert.deepEqual(await visibleDealIds(outsiderSession), []);
    assert.equal(await canViewDeal(outsiderSession, 102), false);
    assert.equal(await canEditDeal(outsiderSession, 102), false);

    const inactiveSession: TestSession = { user: { agentId: 5, isAdmin: false, isActive: false } };
    assert.deepEqual(await visibleDealIds(inactiveSession), []);
    assert.equal(await canViewDeal(inactiveSession, 103), false);
    assert.equal(await canEditDeal(inactiveSession, 103), false);

    const missingAgentSession: TestSession = { user: { agentId: null, isAdmin: false, isActive: true } };
    assert.deepEqual(await visibleDealIds(missingAgentSession), []);
    assert.equal(await canViewDeal(missingAgentSession, 101), false);
    assert.equal(await canEditDeal(missingAgentSession, 101), false);

    console.log("visibility tests passed");
  } finally {
    client.close();
    for (const suffix of ["", "-wal", "-shm"]) {
      const path = `${dbPath}${suffix}`;
      if (existsSync(path)) unlinkSync(path);
    }
  }
}

main().catch((error) => {
  throw error;
});
