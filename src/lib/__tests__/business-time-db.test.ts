// Run only against a disposable local database after ensureSchema.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mock } from "node:test";
import { NextRequest } from "next/server";
import { eq, inArray } from "drizzle-orm";
import { db, closeDatabaseConnections } from "@/db";
import { agents, buildings, deals, invoices, teams, teamCompensationConfigs } from "@/db/schema";
import { GET as monthlyReport } from "@/app/api/reports/monthly/route";
import { GET as teamTerms, POST as saveTeamTerms } from "@/app/api/teams/[id]/compensation/route";
import { POST as markInvoicePaid } from "@/app/api/invoices/[id]/mark-paid/route";
import { dbDatePart } from "../db-time";
import { settlePlanPayment } from "../plan-payments";
import type { CommerceOrder } from "@/db/schema";

async function main() {
  const url = new URL(process.env.DATABASE_URL || "");
  assert.ok(["localhost", "127.0.0.1"].includes(url.hostname) && url.pathname.endsWith("_test"),
    "Use a disposable local *_test database; never production");
  // Every external call is a test failure; auth uses the existing offline stub.
  mock.method(globalThis, "fetch", async () => { throw new Error("Unexpected external request"); });
  const suffix = randomUUID();
  const [agent] = await db.insert(agents).values({
    name: "Timezone Test", email: `timezone-${suffix}@example.invalid`,
    accountStatus: "active", isAdmin: true, plan: "solo",
  }).returning();
  process.env.ADMIN_EMAILS = agent.email;
  const [building] = await db.insert(buildings).values({ name: "Timezone Test", region: "NY", submissionType: "email" }).returning();
  const [team] = await db.insert(teams).values({ name: "Timezone Test", leaderAgentId: agent.id }).returning();
  const globals = globalThis as typeof globalThis & { __agreementTestSession: unknown };
  globals.__agreementTestSession = { user: {
    agentId: agent.id, email: agent.email, loginEmail: agent.email, name: agent.name, isAdmin: true, accountStatus: "active",
  } };
  const insertedDealIds: number[] = [];
  const insertedInvoiceIds: number[] = [];
  try {
    mock.timers.enable({ apis: ["Date"], now: new Date("2026-10-01T01:00:00Z") });
    // A record created without an explicit closing day belongs to September in NY.
    const monthRequest = () => new NextRequest("http://localhost/api/reports/monthly");
    const before = await monthlyReport(monthRequest());
    assert.ok(before);
    assert.equal(before.status, 200);
    const beforeBody = await before.json();
    assert.equal(beforeBody.month, "2026-09");
    const [deal] = await db.insert(deals).values({
      buildingId: building.id, unit: "2A", tenantName: "Timezone Test", totalCommission: 2200,
      licensedCompany: "Homix Living Inc.", createdAt: "2026-10-01T01:00:00Z", dealDate: null,
    }).returning();
    insertedDealIds.push(deal.id);
    const after = await monthlyReport(monthRequest());
    assert.ok(after);
    assert.equal(after.status, 200);
    assert.equal((await after.json()).summary.rentalDeals, beforeBody.summary.rentalDeals + 1);

    await db.insert(teamCompensationConfigs).values([
      { teamId: team.id, version: 1, effectiveFrom: "2026-09-30", defaultTeamSplitPct: 10, teamLeadSplitPct: 10 },
      { teamId: team.id, version: 2, effectiveFrom: "2026-10-01", defaultTeamSplitPct: 15, teamLeadSplitPct: 15 },
    ]);
    const context = { params: Promise.resolve({ id: String(team.id) }) };
    const terms = await teamTerms(new NextRequest("http://localhost/api/teams/1/compensation"), context);
    assert.ok(terms);
    assert.equal(terms.status, 200);
    const termsBody = await terms.json();
    assert.equal(termsBody.current.version, 1, "tomorrow's terms are not active at NY 9 PM");
    assert.equal(termsBody.scheduled[0].version, 2);
    const saved = await saveTeamTerms(new NextRequest("http://localhost/api/teams/1/compensation", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ effectiveFrom: "2026-09-30", defaultTeamSplitPct: 20, teamLeadSplitPct: 20 }),
    }), context);
    assert.ok(saved);
    assert.ok(saved.ok, `admin can select today's NY date: ${await saved.text()}`);

    await settlePlanPayment(db, {
      order: { agentId: agent.id, productKey: "one_year_membership", paymentChannel: "online" } as CommerceOrder,
      amountCents: 10000, earnedAt: "2026-10-01T01:00:00Z", sourceKey: `timezone-${suffix}`,
    });
    const [paidAgent] = await db.select().from(agents).where(eq(agents.id, agent.id));
    assert.equal(paidAgent.affiliationPaidAt, "2026-09-30", "persist the NY payment day");

    const [invoice] = await db.insert(invoices).values({
      buildingId: building.id, invoiceNumber: `TIMEZONE-${suffix}`, unit: "2A", tenantName: "Timezone Test",
      fileName: "timezone-test.pdf", emailSubject: "Timezone regression",
      licensedCompany: "Homix Living Inc.", year: 2026, totalAmount: 2200, status: "sent",
    }).returning();
    insertedInvoiceIds.push(invoice.id);
    const paid = await markInvoicePaid(new NextRequest(`http://localhost/api/invoices/${invoice.id}/mark-paid`, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ paidAt: "2026-09-30", paidAmount: 2200 }),
    }), { params: Promise.resolve({ id: String(invoice.id) }) });
    assert.ok(paid);
    assert.ok(paid.ok, await paid.text());
    const [savedInvoice] = await db.select().from(invoices).where(eq(invoices.id, invoice.id));
    assert.equal(dbDatePart(savedInvoice.paidAt), "2026-09-30", "date-only receipt remains on the entered day");
    console.log("business-time DB regressions passed: SQL month boundary, team effective dates, payment date, manual invoice receipt");
  } finally {
    mock.restoreAll();
    mock.timers.reset();
    globals.__agreementTestSession = null;
    if (insertedInvoiceIds.length) await db.delete(invoices).where(inArray(invoices.id, insertedInvoiceIds));
    if (insertedDealIds.length) await db.delete(deals).where(inArray(deals.id, insertedDealIds));
    await db.delete(teams).where(eq(teams.id, team.id));
    await db.delete(buildings).where(eq(buildings.id, building.id));
    await db.delete(agents).where(eq(agents.id, agent.id));
  }
}
main().catch((error) => { console.error(error); process.exitCode = 1; }).finally(closeDatabaseConnections);
