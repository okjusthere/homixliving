import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import postgres from "postgres";
import { eq } from "drizzle-orm";
import { NextRequest } from "next/server";

// Exercise the actual route handlers, SQL projections, and authorization with
// synthetic records. Only the identity provider is replaced by the test loader.
const configured = new URL(process.env.DATABASE_URL || "postgres://postgres@localhost:5499/homixliving");
assert.ok(["localhost", "127.0.0.1"].includes(configured.hostname), "Local test DB only");
const databaseName = `homix_privacy_${randomUUID().replaceAll("-", "")}`;
const adminUrl = new URL(configured);
adminUrl.pathname = "/postgres";
const testUrl = new URL(configured);
testUrl.pathname = `/${databaseName}`;
process.env.DATABASE_URL = testUrl.toString();
process.env.ADMIN_EMAILS = "admin@example.invalid";
const admin = postgres(adminUrl.toString(), { max: 1, onnotice: () => {} });
const globals = globalThis as typeof globalThis & { __agreementTestSession: unknown };

const safeKeys = ["id", "licensedCompany", "name", "splitPct"].sort();
type DealResponse = {
  deal?: { id: number };
  saleDeal?: { id: number };
  agents: Array<{ agent: Record<string, unknown>; sharePct: number; isPrimary: boolean }>;
  primaryAgent: Record<string, unknown>;
};

async function responseOf(value: Promise<Response | undefined>) {
  const response = await value;
  assert.ok(response, "Route must always return a response");
  return response;
}

async function main() {
  await admin.unsafe(`CREATE DATABASE ${databaseName}`);
  const { db, pgClient, closeDatabaseConnections } = await import("@/db");
  try {
    const { ensureSchema } = await import("@/db/ensure-schema");
    await ensureSchema(pgClient);
    const { agents, buildings, deals, dealAgents, saleDeals, saleDealAgents, teams, trainingVideos, trainingVideoViews } = await import("@/db/schema");
    const rentalList = await import("@/app/api/rental/route");
    const rentalDetail = await import("@/app/api/rental/[id]/route");
    const saleList = await import("@/app/api/sales/route");
    const saleDetail = await import("@/app/api/sales/[id]/route");
    const trainingList = await import("@/app/api/training/route");
    const trainingView = await import("@/app/api/training/[id]/view/route");
    const [owner, colleague, stranger, adminAgent, leader, inactive] = await db.insert(agents).values([
      { name: "Preferred Owner", email: "owner@example.invalid", accountStatus: "active" as const },
      { name: "Preferred Colleague", legalName: "PRIVATE_LEGAL_NAME", email: "colleague@example.invalid", accountStatus: "active" as const,
        notes: "PRIVATE_ADMIN_NOTE", emailChangeTokenHash: "PRIVATE_TOKEN_HASH", pendingEmail: "private-pending@example.invalid",
        esignEnvelopeId: "PRIVATE_SIGNING_ENVELOPE", licenseNumber: "PRIVATE_LICENSE", phone: "PRIVATE_PHONE",
        licensedCompany: "Homix Realty Inc.", splitPct: 85 },
      { name: "Stranger", email: "stranger@example.invalid", accountStatus: "active" as const },
      { name: "Administrator", email: "admin@example.invalid", accountStatus: "active" as const, isAdmin: true },
      { name: "Team Leader", email: "leader@example.invalid", accountStatus: "active" as const },
      { name: "Inactive", email: "inactive@example.invalid", accountStatus: "inactive" as const },
    ]).returning();
    const [team] = await db.insert(teams).values({ name: "Synthetic team", leaderAgentId: leader.id }).returning();
    await db.update(agents).set({ teamId: team.id }).where(eq(agents.id, colleague.id));
    const [building] = await db.insert(buildings).values({ name: "Synthetic Building", region: "Test", submissionType: "email" }).returning();
    const [rental, otherRental] = await db.insert(deals).values([
      { buildingId: building.id, unit: "TEST", tenantName: "Synthetic Tenant", totalCommission: 1000, licensedCompany: "Homix Realty Inc.", dealDate: "2026-01-01" },
      { buildingId: building.id, unit: "OTHER", tenantName: "Unrelated Tenant", totalCommission: 2000, licensedCompany: "Homix Realty Inc.", dealDate: "2026-01-01" },
    ]).returning();
    await db.insert(dealAgents).values([
      { dealId: rental.id, agentId: owner.id, sharePct: 60, isPrimary: false },
      { dealId: rental.id, agentId: colleague.id, sharePct: 40, isPrimary: true },
      { dealId: otherRental.id, agentId: stranger.id, sharePct: 100, isPrimary: true },
    ]);
    const [sale, otherSale] = await db.insert(saleDeals).values([
      { representationType: "buyer_rep", propertyAddress: "Synthetic Sale", grossCommission: 3000 },
      { representationType: "buyer_rep", propertyAddress: "Unrelated Sale", grossCommission: 4000 },
    ]).returning();
    await db.insert(saleDealAgents).values([
      { saleDealId: sale.id, agentId: owner.id, sharePct: 60, isPrimary: false },
      { saleDealId: sale.id, agentId: colleague.id, sharePct: 40, isPrimary: true },
      { saleDealId: otherSale.id, agentId: stranger.id, sharePct: 100, isPrimary: true },
    ]);
    const session = (agent: typeof owner) => {
      globals.__agreementTestSession = { user: { agentId: agent.id, email: agent.email, loginEmail: agent.email } };
    };
    const request = (path: string) => new NextRequest(`http://localhost/api/${path}`);
    const context = (id: number) => ({ params: Promise.resolve({ id: String(id) }) });
    const assertSafe = (body: DealResponse, expectedCount = 2) => {
      assert.equal(body.agents.length, expectedCount);
      for (const participant of body.agents) {
        assert.deepEqual(Object.keys(participant.agent).sort(), safeKeys, "Every role receives only the allowlisted transaction fields");
      }
      assert.deepEqual(Object.keys(body.primaryAgent).sort(), safeKeys, "primaryAgent must use the same safe projection");
      assert.ok(!JSON.stringify(body).includes("PRIVATE_"), "Private agent data must not occur anywhere in the response");
    };
    const assertColleague = (body: DealResponse) => {
      assertSafe(body);
      assert.deepEqual(body.primaryAgent, { id: colleague.id, name: "Preferred Colleague", splitPct: 85, licensedCompany: "Homix Realty Inc." });
      assert.deepEqual(body.agents.map(p => p.sharePct).sort(), [40, 60]);
    };

    for (const actor of [owner, leader, adminAgent]) {
      session(actor);
      const rentals = await (await responseOf(rentalList.GET(request("rental")))).json() as DealResponse[];
      const sales = await (await responseOf(saleList.GET(request("sales")))).json() as DealResponse[];
      assert.equal(rentals.length, actor.isAdmin ? 2 : 1, "Preserve rental participant/team/admin visibility");
      assert.equal(sales.length, actor.isAdmin ? 2 : 1, "Preserve sale participant/team/admin visibility");
      assertColleague(rentals.find(row => row.deal?.id === rental.id)!);
      assertColleague(sales.find(row => row.saleDeal?.id === sale.id)!);
      const rentalResponse = await responseOf(rentalDetail.GET(request(`rental/${rental.id}`), context(rental.id)));
      const saleResponse = await responseOf(saleDetail.GET(request(`sales/${sale.id}`), context(sale.id)));
      assert.equal(rentalResponse.status, 200);
      assert.equal(saleResponse.status, 200);
      assertColleague(await rentalResponse.json());
      assertColleague(await saleResponse.json());
    }

    const participants = [
      { agentId: owner.id, sharePct: 60, isPrimary: false },
      { agentId: colleague.id, sharePct: 40, isPrimary: true },
    ];
    const update = (path: string, body: unknown) => new NextRequest(`http://localhost/api/${path}`, {
      method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
    });
    for (const actor of [owner, adminAgent]) {
      session(actor);
      const rentalResponse = await responseOf(rentalDetail.PUT(update(`rental/${rental.id}`, { ...rental, agents: participants }), context(rental.id)));
      const saleResponse = await responseOf(saleDetail.PUT(update(`sales/${sale.id}`, { ...sale, agents: participants }), context(sale.id)));
      assert.equal(rentalResponse.status, 200);
      assert.equal(saleResponse.status, 200);
      assertColleague(await rentalResponse.json());
      assertColleague(await saleResponse.json());
    }
    session(leader);
    assert.equal((await responseOf(rentalDetail.PUT(update(`rental/${rental.id}`, { ...rental, agents: participants }), context(rental.id)))).status, 403);
    assert.equal((await responseOf(saleDetail.PUT(update(`sales/${sale.id}`, { ...sale, agents: participants }), context(sale.id)))).status, 403);

    session(stranger);
    assert.equal((await responseOf(rentalDetail.GET(request(`rental/${rental.id}`), context(rental.id)))).status, 403);
    assert.equal((await responseOf(saleDetail.GET(request(`sales/${sale.id}`), context(sale.id)))).status, 403);
    for (const actor of [inactive, null]) {
      if (actor) session(actor); else globals.__agreementTestSession = null;
      const expectedStatus = actor ? 403 : 401;
      assert.equal((await responseOf(rentalList.GET(request("rental")))).status, expectedStatus);
      assert.equal((await responseOf(saleList.GET(request("sales")))).status, expectedStatus);
      assert.equal((await responseOf(rentalDetail.GET(request(`rental/${rental.id}`), context(rental.id)))).status, expectedStatus);
      assert.equal((await responseOf(saleDetail.GET(request(`sales/${sale.id}`), context(sale.id)))).status, expectedStatus);
    }

    // F7 was already fixed on main: preserve the server publication gate.
    // This checks metadata and view recording, not Cloudflare playback policy.
    const [published, draft] = await db.insert(trainingVideos).values([
      { title: "Published training", cloudflareUid: "published-synthetic", isPublished: true },
      { title: "PRIVATE_DRAFT", cloudflareUid: "PRIVATE_DRAFT_UID", isPublished: false },
    ]).returning();
    for (const actor of [owner, adminAgent]) {
      session(actor);
      const response = await responseOf(trainingList.GET());
      assert.equal(response.status, 200);
      const body = await response.json();
      assert.deepEqual(body.map((row: { id: number }) => row.id), [published.id]);
      assert.ok(!JSON.stringify(body).includes("PRIVATE_DRAFT"));
    }
    session(owner);
    assert.equal((await responseOf(trainingView.POST(request(`training/${draft.id}/view`), context(draft.id)))).status, 404);
    assert.equal((await db.select().from(trainingVideoViews)).length, 0, "Unpublished training cannot record member views");
    assert.equal((await responseOf(trainingView.POST(request(`training/${published.id}/view`), context(published.id)))).status, 200);
    assert.equal((await db.select().from(trainingVideoViews)).length, 1);
    console.log("PASS: rental/sale list, detail, and update responses minimize participant data for members, team leaders, and admins; visibility and published-training gates preserved.");
  } finally {
    globals.__agreementTestSession = null;
    await closeDatabaseConnections();
  }
}

main().finally(async () => {
  await admin.unsafe(`DROP DATABASE IF EXISTS ${databaseName} WITH (FORCE)`);
  await admin.end();
}).catch(error => { console.error(error); process.exitCode = 1; });
