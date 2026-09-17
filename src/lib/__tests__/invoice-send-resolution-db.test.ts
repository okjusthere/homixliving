import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mock } from "node:test";
import postgres from "postgres";
import { eq } from "drizzle-orm";

const configured = new URL(process.env.DATABASE_URL || "postgres://postgres@localhost:5499/homixliving");
assert.ok(["localhost", "127.0.0.1"].includes(configured.hostname), "Local test DB only");
const databaseName = `homix_send_resolution_${randomUUID().replaceAll("-", "")}`;
const adminUrl = new URL(configured);
adminUrl.pathname = "/postgres";
const testUrl = new URL(configured);
testUrl.pathname = `/${databaseName}`;
process.env.DATABASE_URL = testUrl.toString();
process.env.ADMIN_EMAILS = "admin@example.invalid";
const admin = postgres(adminUrl.toString(), { max: 1, onnotice: () => {} });
const globals = globalThis as typeof globalThis & { __agreementTestSession: unknown };

async function main() {
  await admin.unsafe(`CREATE DATABASE ${databaseName}`);
  const { db, pgClient, closeDatabaseConnections } = await import("@/db");
  try {
    mock.method(globalThis, "fetch", async () => { throw new Error("Resolution must never send mail or contact an external provider"); });
    const { ensureSchema } = await import("@/db/ensure-schema");
    await ensureSchema(pgClient);
    const { agents, buildings, invoices, invoiceSendLog, auditLog } = await import("@/db/schema");
    const { POST } = await import("@/app/api/invoices/[id]/send-attempts/[attemptId]/resolve/route");
    const [administrator, ordinary, inactive] = await db.insert(agents).values([
      { name: "Synthetic Administrator", email: "admin@example.invalid", accountStatus: "active" as const, isAdmin: true },
      { name: "Synthetic Ordinary", email: "ordinary@example.invalid", accountStatus: "active" as const },
      { name: "Synthetic Suspended", email: "suspended@example.invalid", accountStatus: "inactive" as const, isAdmin: true },
    ]).returning();
    const [building] = await db.insert(buildings).values({ name: "Synthetic Building", region: "Test", submissionType: "email" }).returning();
    const makeInvoice = async (paid = false) => (await db.insert(invoices).values({
      buildingId: building.id, invoiceNumber: `TEST-${randomUUID()}`, unit: "TEST", tenantName: "Synthetic Tenant",
      fileName: "synthetic", emailSubject: "Synthetic invoice", licensedCompany: "Homix Realty Inc.",
      year: 2026, totalAmount: 1000, status: paid ? "paid" : "draft",
      paidAt: paid ? "2026-01-15T10:00:00.000Z" : null, paidAmount: paid ? 1000 : null,
    }).returning())[0];
    const oldTime = new Date(Date.now() - 121_000).toISOString();
    const makeAttempt = async (invoiceId: number, sentAt: string | null = oldTime) => (await db.insert(invoiceSendLog).values({
      invoiceId, toRecipients: "recipient@example.invalid", subject: "Synthetic invoice", status: "sending", sentAt,
    }).returning())[0];
    const login = (agent: typeof administrator | null) => { globals.__agreementTestSession = agent ? { user: { agentId: agent.id, email: agent.email, loginEmail: agent.email, isAdmin: true, accountStatus: "active" } } : null; };
    const invoke = async (invoiceId: string | number, attemptId: string | number,
      body: unknown = { outcome: "failed", note: "Checked provider: delivery was not accepted." }, origin = "http://localhost") => {
      const response = await POST(new Request(`http://localhost/api/invoices/${invoiceId}/send-attempts/${attemptId}/resolve`, {
        method: "POST", headers: { origin, "content-type": "application/json" }, body: JSON.stringify(body),
      }), { params: Promise.resolve({ id: String(invoiceId), attemptId: String(attemptId) }) });
      assert.ok(response);
      return response;
    };
    const invoice = await makeInvoice();
    const attempt = await makeAttempt(invoice.id);
    login(null);
    assert.equal((await invoke(invoice.id, attempt.id)).status, 401);
    for (const person of [ordinary, inactive]) {
      login(person);
      assert.equal((await invoke(invoice.id, attempt.id)).status, 403);
    }
    login(administrator);
    assert.equal((await invoke(invoice.id, attempt.id, { outcome: "failed", note: "Checked provider records" }, "https://untrusted.invalid")).status, 403);
    for (const body of [null, { outcome: "sending", note: "Checked records" }, { outcome: "sent", note: "   " }, { outcome: "sent", note: "valid note", agentId: ordinary.id }]) {
      assert.equal((await invoke(invoice.id, attempt.id, body)).status, 400);
    }
    for (const invalid of ["1bad", "0", "-1", "1.2", "2147483648"]) {
      assert.equal((await invoke(invalid, attempt.id)).status, 400);
      assert.equal((await invoke(invoice.id, invalid)).status, 400);
    }
    const other = await makeInvoice();
    assert.equal((await invoke(other.id, attempt.id)).status, 404, "An attempt belongs to exactly one invoice");
    assert.equal((await invoke(2147483647, attempt.id)).status, 404);
    assert.equal((await invoke(invoice.id, 2147483647)).status, 404);
    const fresh = await makeAttempt(other.id, new Date().toISOString());
    assert.equal((await invoke(other.id, fresh.id)).status, 409, "Do not interfere with an in-flight send");
    const missingStart = await makeAttempt(other.id, null);
    assert.equal((await invoke(other.id, missingStart.id)).status, 409, "Unknown start time cannot prove the send is finished");

    const result = await invoke(invoice.id, attempt.id);
    assert.equal(result.status, 200);
    assert.deepEqual(await result.json(), { success: true, invoiceId: invoice.id, attemptId: attempt.id, outcome: "failed" });
    const [failedInvoice] = await db.select().from(invoices).where(eq(invoices.id, invoice.id));
    const [failedAttempt] = await db.select().from(invoiceSendLog).where(eq(invoiceSendLog.id, attempt.id));
    assert.equal(failedInvoice.status, "failed");
    assert.equal(failedAttempt.status, "failed");
    assert.equal(failedAttempt.sentAt, attempt.sentAt, "Keep the original delivery attempt timestamp");
    assert.match(failedAttempt.errorMessage!, /Checked provider/);
    assert.equal((await invoke(invoice.id, attempt.id)).status, 409, "Repeated resolution cannot create another audit or reverse the result");
    const records = await db.select().from(auditLog).where(eq(auditLog.action, "resolve_invoice_send"));
    assert.equal(records.length, 1);
    assert.equal(records[0].actorEmail, administrator.email);
    assert.equal(JSON.parse(records[0].detail!).actorAgentId, administrator.id);
    assert.equal(JSON.parse(records[0].detail!).attemptId, attempt.id);
    assert.match(JSON.parse(records[0].detail!).note, /Checked provider/);

    for (const outcome of ["sent", "failed"]) {
      const paid = await makeInvoice(true);
      const paidAttempt = await makeAttempt(paid.id);
      assert.equal((await invoke(paid.id, paidAttempt.id, { outcome, note: "Checked the provider's actual delivery record." })).status, 200);
      const [preserved] = await db.select().from(invoices).where(eq(invoices.id, paid.id));
      assert.equal(preserved.status, "paid");
      assert.equal(preserved.paidAt, paid.paidAt);
      assert.equal(preserved.paidAmount, paid.paidAmount);
    }
    const concurrent = await makeInvoice();
    const concurrentAttempt = await makeAttempt(concurrent.id);
    const results = await Promise.all(["sent", "failed"].map(outcome => invoke(concurrent.id, concurrentAttempt.id, { outcome, note: "Verified result with provider records." })));
    assert.deepEqual(results.map(response => response.status).sort(), [200, 409], "Only one competing resolution commits");
    const winning = await results.find(response => response.status === 200)!.json();
    const [settled] = await db.select().from(invoices).where(eq(invoices.id, concurrent.id));
    assert.equal(settled.status, winning.outcome);

    // Force an audit insert error inside this disposable database. State must
    // remain unresolved if the required explanation cannot be persisted.
    const atomicInvoice = await makeInvoice();
    const atomicAttempt = await makeAttempt(atomicInvoice.id);
    await pgClient.unsafe(`CREATE FUNCTION portal.qa_fail_resolution_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.action = 'resolve_invoice_send' THEN RAISE EXCEPTION 'synthetic audit failure'; END IF; RETURN NEW; END $$`);
    await pgClient.unsafe(`CREATE TRIGGER qa_fail_resolution_audit BEFORE INSERT ON portal.audit_log FOR EACH ROW EXECUTE FUNCTION portal.qa_fail_resolution_audit()`);
    assert.equal((await invoke(atomicInvoice.id, atomicAttempt.id)).status, 500);
    const [atomicAfter] = await db.select().from(invoices).where(eq(invoices.id, atomicInvoice.id));
    const [attemptAfter] = await db.select().from(invoiceSendLog).where(eq(invoiceSendLog.id, atomicAttempt.id));
    assert.equal(atomicAfter.status, "draft");
    assert.equal(attemptAfter.status, "sending");
    console.log("PASS: administrator-only send resolution checks origin, ownership and 120s delay; concurrent/repeated resolution is safe; paid facts survive; required audit failure rolls back all changes; no mail sent.");
  } finally {
    globals.__agreementTestSession = null;
    mock.restoreAll();
    await closeDatabaseConnections();
  }
}

main().finally(async () => {
  await admin.unsafe(`DROP DATABASE IF EXISTS ${databaseName} WITH (FORCE)`);
  await admin.end();
}).catch(error => { console.error(error); process.exitCode = 1; });
