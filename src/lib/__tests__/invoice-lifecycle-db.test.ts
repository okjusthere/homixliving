import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import postgres from "postgres";
import { eq } from "drizzle-orm";
import { NextRequest } from "next/server";

const configured = new URL(process.env.DATABASE_URL || "postgres://postgres@localhost:5499/homixliving");
assert.ok(["localhost", "127.0.0.1"].includes(configured.hostname), "Local test DB only");
const databaseName = `homix_invoice_lifecycle_${randomUUID().replaceAll("-", "")}`;
const adminUrl = new URL(configured); adminUrl.pathname = "/postgres";
const testUrl = new URL(configured); testUrl.pathname = `/${databaseName}`;
process.env.DATABASE_URL = testUrl.toString();
process.env.ADMIN_EMAILS = "admin@example.invalid";
const admin = postgres(adminUrl.toString(), { max: 1, onnotice: () => {} });
const globals = globalThis as typeof globalThis & { __agreementTestSession: unknown; __invoiceTestSend: () => Promise<unknown> };

async function main() {
  await admin.unsafe(`CREATE DATABASE ${databaseName}`);
  const { db, pgClient, closeDatabaseConnections } = await import("@/db");
  try {
    const { ensureSchema } = await import("@/db/ensure-schema"); await ensureSchema(pgClient);
    const { agents, buildings, deals, dealAgents, invoices, invoiceSendLog, compensationReceipts, compensationObligations } = await import("@/db/schema");
    const invoiceRoute = await import("@/app/api/invoices/[id]/route");
    const paymentRoute = await import("@/app/api/invoices/[id]/mark-paid/route");
    const sendRoute = await import("@/app/api/invoices/[id]/send/route");
    const finalizeRoute = await import("@/app/api/compensation/[type]/[id]/route");
    const rentalRoute = await import("@/app/api/rental/[id]/route");
    const [owner, stranger, adminAgent] = await db.insert(agents).values([
      { name: "Synthetic Owner", email: "owner@example.invalid", accountStatus: "active" as const },
      { name: "Synthetic Stranger", email: "stranger@example.invalid", accountStatus: "active" as const },
      { name: "Synthetic Admin", email: "admin@example.invalid", accountStatus: "active" as const, isAdmin: true },
    ]).returning();
    const [building] = await db.insert(buildings).values({ name: "Synthetic Building", region: "Test", submissionType: "email", contactEmail: "building@example.invalid" }).returning();
    const session = (agent: typeof owner) => { globals.__agreementTestSession = { user: { agentId: agent.id, email: agent.email, loginEmail: agent.email } }; };
    let serial = 0;
    const makeInvoice = async (status = "draft") => {
      const [deal] = await db.insert(deals).values({ buildingId: building.id, unit: "TEST", tenantName: "Synthetic Tenant", totalCommission: 5000, licensedCompany: "Homix Realty Inc.", dealDate: "2026-09-01", status: "active" }).returning();
      await db.insert(dealAgents).values({ dealId: deal.id, agentId: owner.id, sharePct: 100, isPrimary: true });
      const [invoice] = await db.insert(invoices).values({ buildingId: building.id, dealId: deal.id, invoiceNumber: `TEST-${++serial}`, fileName: "test", unit: "TEST", tenantName: "Synthetic Tenant", licensedCompany: "Homix Realty Inc.", agentEmail: owner.email, totalAmount: 5000, status }).returning();
      return invoice;
    };
    type Handler = (req: NextRequest, context: { params: Promise<{ id: string }> }) => Promise<Response | undefined>;
    const call = async (handler: Handler, id: number, method = "POST") => {
      const response = await handler(new NextRequest(`http://localhost/api/invoices/${id}`, { method }), { params: Promise.resolve({ id: String(id) }) });
      assert.ok(response, "Every request must return a response");
      return response;
    };
    const row = async (id: number) => (await db.select().from(invoices).where(eq(invoices.id, id)))[0];

    const draft = await makeInvoice();
    globals.__agreementTestSession = null; assert.equal((await call(invoiceRoute.DELETE, draft.id, "DELETE")).status, 401);
    session(stranger); assert.equal((await call(invoiceRoute.DELETE, draft.id, "DELETE")).status, 403);
    session(owner); assert.equal((await (await call(invoiceRoute.GET, draft.id, "GET")).json()).canDelete, true);
    assert.equal((await call(invoiceRoute.DELETE, draft.id, "DELETE")).status, 200);
    assert.equal(await row(draft.id), undefined);
    for (const status of ["sent", "failed", "paid"]) {
      const invoice = await makeInvoice(status);
      for (const actor of [owner, adminAgent]) {
        session(actor); assert.equal((await call(invoiceRoute.DELETE, invoice.id, "DELETE")).status, 409, `${status} cannot be deleted by ${actor.name}`);
      }
      assert.ok(await row(invoice.id));
    }
    for (const changed of [{ paidAmount: 0 }, { paidAt: new Date().toISOString() }, { sentAt: new Date().toISOString() }]) {
      const invoice = await makeInvoice(); await db.update(invoices).set(changed).where(eq(invoices.id, invoice.id));
      assert.equal((await call(invoiceRoute.DELETE, invoice.id, "DELETE")).status, 409);
    }

    // Exercise real finalization -> receipt -> payable ledger -> reversal protection.
    const financial = await makeInvoice(); session(adminAgent);
    const finalized = await finalizeRoute.POST(new NextRequest("http://localhost/api/compensation", { method: "POST" }), { params: Promise.resolve({ type: "rental", id: String(financial.dealId) }) });
    assert.ok(finalized);
    assert.equal(finalized.status, 200);
    const finalData = await finalized.json();
    assert.equal((await call(invoiceRoute.DELETE, financial.id, "DELETE")).status, 409, "Finalized draft must be retained");
    assert.equal((await call(paymentRoute.POST, financial.id)).status, 200);
    const receipts = await db.select().from(compensationReceipts).where(eq(compensationReceipts.snapshotId, finalData.snapshot.id));
    assert.equal(receipts.length, 1); assert.equal(receipts[0].amountCents, 500000);
    const obligations = await db.select().from(compensationObligations).where(eq(compensationObligations.snapshotId, finalData.snapshot.id));
    assert.ok(obligations.length > 0); assert.ok(obligations.every(o => o.status === "payable"));
    assert.equal((await call(invoiceRoute.DELETE, financial.id, "DELETE")).status, 409);
    assert.equal((await call(rentalRoute.DELETE, financial.dealId!, "DELETE")).status, 409, "Deleting the rental cannot bypass finalized financial history");
    await db.update(compensationObligations).set({ paidCents: 1, status: "partially_paid" }).where(eq(compensationObligations.id, obligations[0].id));
    assert.equal((await call(paymentRoute.DELETE, financial.id, "DELETE")).status, 409, "Paid-out commission blocks receipt reversal");
    assert.equal((await row(financial.id)).status, "paid");
    assert.equal((await db.select().from(compensationReceipts).where(eq(compensationReceipts.snapshotId, finalData.snapshot.id))).length, 1);

    const detached = await makeInvoice("paid");
    assert.equal((await call(rentalRoute.DELETE, detached.dealId!, "DELETE")).status, 200);
    assert.equal((await row(detached.id)).dealId, null);
    assert.equal((await row(detached.id)).status, "paid");
    assert.equal((await call(invoiceRoute.DELETE, detached.id, "DELETE")).status, 409, "Detaching a rental must preserve the paid invoice");

    // Gate the external provider while real database routes race against delivery.
    for (const fail of [false, true]) {
      const invoice = await makeInvoice();
      let release!: () => void; let entered!: () => void;
      const enteredPromise = new Promise<void>(resolve => { entered = resolve; });
      const blocked = new Promise<void>(resolve => { release = resolve; });
      let sendCount = 0;
      globals.__invoiceTestSend = async () => { sendCount++; entered(); await blocked; if (fail) throw new Error("Synthetic provider failure"); return { id: "synthetic" }; };
      const sending = call(sendRoute.POST, invoice.id);
      await enteredPromise;
      try {
        assert.equal((await call(invoiceRoute.DELETE, invoice.id, "DELETE")).status, 409, "Sending draft cannot disappear");
        assert.equal((await call(sendRoute.POST, invoice.id)).status, 409, "Parallel send cannot deliver twice");
        assert.equal((await call(paymentRoute.POST, invoice.id)).status, 200);
      } finally { release(); }
      assert.equal((await sending).status, fail ? 500 : 200);
      assert.equal(sendCount, 1);
      assert.equal((await row(invoice.id)).status, "paid", "Delivery completion/failure must preserve concurrent payment");
      const logs = await db.select().from(invoiceSendLog).where(eq(invoiceSendLog.invoiceId, invoice.id));
      assert.equal(logs.length, 1); assert.equal(logs[0].status, fail ? "failed" : "sent");
    }
    // Provider accepted the mail, then persistence failed: keep it pending,
    // never label it failed and invite an automatic duplicate delivery.
    const uncertain = await makeInvoice();
    globals.__invoiceTestSend = async () => ({ id: "accepted-before-db-failure" });
    await pgClient.unsafe(`CREATE FUNCTION portal.fail_invoice_send_confirmation() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN IF NEW.id = ${uncertain.id} AND NEW.status = 'sent' THEN RAISE EXCEPTION 'synthetic confirmation failure'; END IF; RETURN NEW; END $$`);
    await pgClient.unsafe("CREATE TRIGGER invoice_send_confirmation_fault BEFORE UPDATE ON portal.invoices FOR EACH ROW EXECUTE FUNCTION portal.fail_invoice_send_confirmation()");
    try {
      assert.equal((await call(sendRoute.POST, uncertain.id)).status, 503);
      const [pending] = await db.select().from(invoiceSendLog).where(eq(invoiceSendLog.invoiceId, uncertain.id));
      assert.equal(pending.status, "sending");
      assert.equal((await call(sendRoute.POST, uncertain.id)).status, 409);
    } finally { await pgClient.unsafe("DROP TRIGGER invoice_send_confirmation_fault ON portal.invoices"); }

    const transportUnknown = await makeInvoice();
    const { UncertainInvoiceDeliveryError } = await import("@/lib/invoice-email-errors");
    let transportAttempts = 0;
    globals.__invoiceTestSend = async () => { transportAttempts++; throw new UncertainInvoiceDeliveryError("Synthetic timeout after provider accepted mail"); };
    assert.equal((await call(sendRoute.POST, transportUnknown.id)).status, 503);
    assert.equal((await db.select().from(invoiceSendLog).where(eq(invoiceSendLog.invoiceId, transportUnknown.id)))[0].status, "sending");
    assert.equal((await call(sendRoute.POST, transportUnknown.id)).status, 409);
    assert.equal(transportAttempts, 1, "Ambiguous provider response must not invite duplicate mail");

    // Either deletion wins or payment wins; a stale read must never report both success.
    for (let n = 0; n < 8; n++) {
      const invoice = await makeInvoice();
      const [deleting, paying] = await Promise.all([call(invoiceRoute.DELETE, invoice.id, "DELETE"), call(paymentRoute.POST, invoice.id)]);
      assert.ok((deleting.status === 200 && paying.status === 404) || (deleting.status === 409 && paying.status === 200), `Unexpected race: ${deleting.status}/${paying.status}`);
      if (paying.status === 200) assert.equal((await row(invoice.id)).status, "paid");
    }
    console.log("PASS invoice lifecycle: protected financial history, permissions, finalized receipt/obligations, payout reversal, concurrent send/payment/delete and duplicate-send prevention.");
  } finally { globals.__agreementTestSession = null; await closeDatabaseConnections(); }
}
main().finally(async () => { await admin.unsafe(`DROP DATABASE IF EXISTS ${databaseName} WITH (FORCE)`); await admin.end(); })
  .catch(error => { console.error(error); process.exitCode = 1; });
