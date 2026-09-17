import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import postgres from "postgres";
import { and, eq } from "drizzle-orm";
import { NextRequest } from "next/server";

// Always use a new, disposable LOCAL database, including in CI.
const configured = new URL(process.env.DATABASE_URL || "postgres://postgres@localhost:5499/homixliving");
assert.ok(["localhost", "127.0.0.1"].includes(configured.hostname), "Local test DB only");
const databaseName = `homix_invoice_${randomUUID().replaceAll("-", "")}`;
const adminUrl = new URL(configured);
adminUrl.pathname = "/postgres";
const testUrl = new URL(configured);
testUrl.pathname = `/${databaseName}`;
process.env.DATABASE_URL = testUrl.toString();
const admin = postgres(adminUrl.toString(), { max: 1, onnotice: () => {} });
const globals = globalThis as typeof globalThis & { __agreementTestSession: unknown };

async function main() {
  await admin.unsafe(`CREATE DATABASE ${databaseName}`);
  const { db, pgClient, closeDatabaseConnections } = await import("@/db");
  try {
    const { ensureSchema } = await import("@/db/ensure-schema");
    await ensureSchema(pgClient);
    const { agents, buildings, deals, dealAgents, invoices, auditLog } = await import("@/db/schema");
    const { POST } = await import("@/app/api/rental/[id]/create-invoice/route");
    const { summarizeInvoicePayment } = await import("@/lib/invoice-payment");
    const [owner, stranger, adminAgent] = await db.insert(agents).values([
      { name: "Synthetic Owner", email: "owner@example.invalid", accountStatus: "active" as const },
      { name: "Synthetic Stranger", email: "stranger@example.invalid", accountStatus: "active" as const },
      { name: "Synthetic Admin", email: "admin@example.invalid", accountStatus: "active" as const, isAdmin: true },
    ]).returning();
    const [building] = await db.insert(buildings).values({ name: "Synthetic Building", region: "Test", submissionType: "email" }).returning();
    const makeDeal = async (status = "active") => {
      const [deal] = await db.insert(deals).values({ buildingId: building.id, unit: "TEST", tenantName: "Synthetic Tenant",
        totalCommission: 4510, licensedCompany: "Homix Realty Inc.", dealDate: "2026-01-01", status,
      }).returning();
      await db.insert(dealAgents).values({ dealId: deal.id, agentId: owner.id, sharePct: 100, isPrimary: true });
      return deal;
    };
    const session = (agent: typeof owner) => { globals.__agreementTestSession = { user: { agentId: agent.id, email: agent.email } }; };
    const call = async (id: number | string) => {
      const response = await POST(new NextRequest(`http://localhost/api/rental/${id}/create-invoice`, { method: "POST" }), { params: Promise.resolve({ id: String(id) }) });
      assert.ok(response, "Route must always return a response");
      return response;
    };
    const rows = (dealId: number) => db.select().from(invoices).where(eq(invoices.dealId, dealId));
    const deal = await makeDeal();
    globals.__agreementTestSession = null;
    assert.equal((await call(deal.id)).status, 401);
    session(stranger);
    assert.equal((await call(deal.id)).status, 403);
    session(owner);
    const firstResponse = await call(deal.id);
    assert.equal(firstResponse.status, 200);
    const first = await firstResponse.json();
    const retry = await (await call(deal.id)).json();
    assert.equal(retry.invoiceId, first.invoiceId, "A repeat request must reuse the first invoice");
    assert.equal(retry.reused, true);
    assert.equal((await rows(deal.id)).length, 1);
    for (const status of ["draft", "sent", "failed", "paid"]) {
      await db.update(invoices).set({ status }).where(eq(invoices.id, first.invoiceId));
      const result = await (await call(deal.id)).json();
      assert.equal(result.invoiceId, first.invoiceId, `${status} invoices must be reused`);
      assert.equal((await rows(deal.id))[0].status, status, "Retry must not change invoice status");
    }
    const concurrentDeal = await makeDeal();
    const results = await Promise.all(Array.from({ length: 8 }, async () => {
      const response = await call(concurrentDeal.id);
      assert.equal(response.status, 200);
      return response.json();
    }));
    assert.equal(new Set(results.map(result => result.invoiceId)).size, 1, "Concurrent requests must create only one invoice");
    assert.equal(results.filter(result => !result.reused).length, 1);
    const concurrentInvoices = await rows(concurrentDeal.id);
    assert.equal(concurrentInvoices.length, 1);
    assert.equal(concurrentInvoices[0].year, 2026);
    await db.update(invoices).set({ status: "sent" }).where(eq(invoices.id, concurrentInvoices[0].id));
    assert.equal(summarizeInvoicePayment(await rows(concurrentDeal.id)).totalOutstanding, 4510);
    const audits = await db.select().from(auditLog).where(and(eq(auditLog.entityType, "invoice"), eq(auditLog.entityId, String(concurrentInvoices[0].id))));
    assert.equal(audits.length, 1, "Only a new invoice is audited as created");
    const cancelled = await makeDeal("cancelled");
    assert.equal((await call(cancelled.id)).status, 409);
    assert.equal((await rows(cancelled.id)).length, 0);
    await db.update(deals).set({ status: "cancelled" }).where(eq(deals.id, deal.id));
    assert.equal((await (await call(deal.id)).json()).invoiceId, first.invoiceId, "Existing invoices remain accessible for cancelled deals");
    session(stranger);
    assert.equal((await call(deal.id)).status, 403, "Reuse must not leak another agent's invoice");
    session(adminAgent);
    assert.equal((await call(2147483647)).status, 404);
    for (const id of ["5bad", "0", "-1", "1.5"]) assert.equal((await call(id)).status, 400);

    // Keep the visible navigation contract alongside the actual-route DB regression.
    const listPage = readFileSync("src/app/invoices/page.tsx", "utf8");
    assert.match(listPage, /href="\/rental"/);
    assert.match(listPage, /backToRental: "返回租赁"/);
    const detailPage = readFileSync("src/app/rental/[id]/page.tsx", "utf8");
    assert.match(detailPage, /viewInvoice: "查看发票"/);
    assert.match(detailPage, /existingInvoiceId \? \(/);
    console.log("PASS: rental invoices reuse all statuses; 8 parallel creates produce 1 row and 1 audit; no doubled balance; permissions, cancelled rentals, invalid IDs, and bilingual navigation verified.");
  } finally {
    globals.__agreementTestSession = null;
    await closeDatabaseConnections();
  }
}

main().finally(async () => {
  // Exact generated test database only. Never drop the configured application DB.
  await admin.unsafe(`DROP DATABASE IF EXISTS ${databaseName} WITH (FORCE)`);
  await admin.end();
}).catch(error => { console.error(error); process.exitCode = 1; });
