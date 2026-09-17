import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mock } from "node:test";
import { setTimeout as delay } from "node:timers/promises";
import postgres from "postgres";
import { eq } from "drizzle-orm";
import { NextRequest } from "next/server";
import { DeleteObjectCommand, HeadObjectCommand, S3Client } from "@aws-sdk/client-s3";

const configured = new URL(process.env.DATABASE_URL || "postgres://postgres@localhost:5499/homixliving");
assert.ok(["localhost", "127.0.0.1"].includes(configured.hostname), "Local test DB only");
const databaseName = `homix_documents_${randomUUID().replaceAll("-", "")}`;
const adminUrl = new URL(configured);
adminUrl.pathname = "/postgres";
const testUrl = new URL(configured);
testUrl.pathname = `/${databaseName}`;
process.env.DATABASE_URL = testUrl.toString();
process.env.ADMIN_EMAILS = "admin@example.invalid";
// S3 commands are intercepted before any network call. No actual R2 credentials
// are used and every generated database is local, random, and disposable.
process.env.R2_ACCOUNT_ID = "synthetic";
process.env.R2_ACCESS_KEY_ID = "synthetic";
process.env.R2_SECRET_ACCESS_KEY = "synthetic";
process.env.R2_BUCKET_NAME = "synthetic-documents";
const admin = postgres(adminUrl.toString(), { max: 1, onnotice: () => {} });
const globals = globalThis as typeof globalThis & { __agreementTestSession: unknown };

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>(done => { resolve = done; });
  return { promise, resolve };
}
async function responseOf(value: Promise<Response | undefined>) {
  const response = await value;
  assert.ok(response, "Route must always return a response");
  return response;
}

async function main() {
  await admin.unsafe(`CREATE DATABASE ${databaseName}`);
  const { db, pgClient, closeDatabaseConnections } = await import("@/db");
  const objects = new Map<string, { ContentType: string; ContentLength: number }>();
  const deletedKeys: string[] = [];
  let headCount = 0;
  let headGate: ReturnType<typeof deferred> | null = null;
  let headEntered: ReturnType<typeof deferred> | null = null;
  let deleteGate: ReturnType<typeof deferred> | null = null;
  let deleteEntered: ReturnType<typeof deferred> | null = null;
  let deleteFails = false;
  mock.method(S3Client.prototype, "send", async (command: HeadObjectCommand | DeleteObjectCommand) => {
    const key = command.input.Key!;
    if (command instanceof HeadObjectCommand) {
      headCount++;
      headEntered?.resolve();
      if (headGate) await headGate.promise;
      const object = objects.get(key);
      if (!object) throw new Error("Synthetic object is missing");
      return { ...object };
    }
    assert.ok(command instanceof DeleteObjectCommand, "Only mock HEAD and DELETE are allowed");
    deleteEntered?.resolve();
    if (deleteGate) await deleteGate.promise;
    if (deleteFails) throw new Error("Synthetic storage failure");
    deletedKeys.push(key);
    objects.delete(key);
    return {};
  });
  mock.method(globalThis, "fetch", async () => { throw new Error("External HTTP is forbidden in this regression"); });
  try {
    const { ensureSchema } = await import("@/db/ensure-schema");
    await ensureSchema(pgClient);
    const { agents, buildings, deals, dealAgents, saleDeals, saleDealAgents, dealDocuments, auditLog } = await import("@/db/schema");
    const { buildDealDocumentKey } = await import("@/lib/deal-document-storage");
    const documentRoute = await import("@/app/api/deals/[type]/[id]/documents/route");
    const deleteRoute = await import("@/app/api/deals/[type]/[id]/documents/[docId]/route");
    const [owner, stranger, adminAgent] = await db.insert(agents).values([
      { name: "Owner", email: "owner@example.invalid", accountStatus: "active" as const },
      { name: "Stranger", email: "stranger@example.invalid", accountStatus: "active" as const },
      { name: "Admin", email: "admin@example.invalid", accountStatus: "active" as const, isAdmin: true },
    ]).returning();
    const [building] = await db.insert(buildings).values({ name: "Synthetic Building", region: "Test", submissionType: "email" }).returning();
    const [rental] = await db.insert(deals).values({ buildingId: building.id, unit: "TEST", tenantName: "Synthetic", totalCommission: 100, licensedCompany: "Homix Realty Inc." }).returning();
    const [sale] = await db.insert(saleDeals).values({ representationType: "buyer_rep", propertyAddress: "Synthetic Sale" }).returning();
    await db.insert(dealAgents).values({ dealId: rental.id, agentId: owner.id, sharePct: 100, isPrimary: true });
    await db.insert(saleDealAgents).values({ saleDealId: sale.id, agentId: owner.id, sharePct: 100, isPrimary: true });
    const session = (agent: typeof owner | null) => {
      globals.__agreementTestSession = agent ? { user: { agentId: agent.id, email: agent.email, loginEmail: agent.email } } : null;
    };
    const metadata = { fileName: "lease.pdf", contentType: "application/pdf", size: 100 };
    const rows = (key: string) => db.select().from(dealDocuments).where(eq(dealDocuments.objectKey, key));
    for (const [type, deal] of [["rental", rental], ["sale", sale]] as const) {
      const params = { type, id: String(deal.id) };
      const register = (key: string, overrides: Record<string, unknown> = {}) => responseOf(documentRoute.POST(
        new NextRequest(`http://localhost/api/deals/${type}/${deal.id}/documents`, {
          method: "POST", headers: { "content-type": "application/json" },
          body: JSON.stringify({ ...metadata, objectKey: key, ...overrides }),
        }), { params: Promise.resolve(params) },
      ));
      const remove = (id: number) => responseOf(deleteRoute.DELETE(
        new NextRequest(`http://localhost/api/deals/${type}/${deal.id}/documents/${id}`, { method: "DELETE" }),
        { params: Promise.resolve({ ...params, docId: String(id) }) },
      ));
      const prepare = (fileName = metadata.fileName) => {
        const key = buildDealDocumentKey(type, deal.id, fileName);
        objects.set(key, { ContentType: metadata.contentType, ContentLength: metadata.size });
        return key;
      };

      session(owner);
      const key = prepare();
      headGate = deferred(); headEntered = deferred();
      const beforeHeads = headCount;
      const concurrent = Promise.all([register(key), register(key)]);
      await headEntered.promise;
      // Keep HEAD open while the second request reaches the database. With the
      // old read-then-insert route, both requests observe an absent row.
      await delay(75);
      headGate.resolve(); headGate = null; headEntered = null;
      const responses = await concurrent;
      assert.deepEqual(responses.map(row => row.status).sort(), [200, 201]);
      const documents = await Promise.all(responses.map(row => row.json()));
      assert.equal(documents[0].id, documents[1].id, "Parallel registration reuses one document id");
      assert.equal((await rows(key)).length, 1);
      assert.equal(headCount - beforeHeads, 1, "Replay reuses a verified registration");
      assert.equal((await register(key)).status, 200);
      assert.equal((await register(key, { fileName: "different.pdf" })).status, 409);
      assert.equal((await register(key, { size: 101 })).status, 409);
      assert.equal(objects.has(key), true, "Conflicting retries must not delete registered storage");
      assert.equal((await db.select().from(auditLog).where(eq(auditLog.entityId, String(documents[0].id)))).filter(row => row.action === "upload" && row.entityType === "deal_document").length, 1);

      session(stranger);
      assert.equal((await register(key)).status, 403);
      assert.equal((await remove(documents[0].id)).status, 403);
      session(null);
      assert.equal((await register(key)).status, 401);
      assert.equal((await remove(documents[0].id)).status, 401);
      session(owner);
      assert.equal((await register(buildDealDocumentKey(type, deal.id + 100, metadata.fileName))).status, 400);

      // Existing deployments can already contain duplicate rows. Do not destroy
      // the shared object when deleting only one of those rows.
      const [original] = await rows(key);
      const { id: _originalId, ...legacyCopy } = original;
      void _originalId;
      const [duplicate] = await db.insert(dealDocuments).values(legacyCopy).returning();
      const beforeDeletes = deletedKeys.length;
      assert.equal((await remove(original.id)).status, 200);
      assert.equal(objects.has(key), true);
      assert.equal((await rows(key))[0].id, duplicate.id);
      assert.equal(deletedKeys.length, beforeDeletes);
      session(adminAgent);
      assert.equal((await remove(duplicate.id)).status, 200);
      assert.equal(objects.has(key), false);
      assert.equal(deletedKeys.length, beforeDeletes + 1);

      // Concurrent removal of two historical references deletes storage once.
      session(owner);
      const concurrentKey = prepare();
      const legacy = { ...legacyCopy, objectKey: concurrentKey, legacyUrl: concurrentKey };
      const duplicates = await db.insert(dealDocuments).values([legacy, legacy]).returning();
      const deletedBeforeParallel = deletedKeys.length;
      assert.deepEqual((await Promise.all(duplicates.map(row => remove(row.id)))).map(row => row.status), [200, 200]);
      assert.equal((await rows(concurrentKey)).length, 0);
      assert.equal(deletedKeys.length, deletedBeforeParallel + 1);

      // R2 failure must keep the row available for a safe deletion retry.
      const failureKey = prepare();
      const failureDoc = await (await register(failureKey)).json();
      deleteFails = true;
      assert.equal((await remove(failureDoc.id)).status, 500);
      deleteFails = false;
      assert.equal((await rows(failureKey)).length, 1);
      assert.equal(objects.has(failureKey), true);
      assert.equal((await remove(failureDoc.id)).status, 200);

      // A register racing the final deletion must not recreate a database row
      // after the physical object has been removed.
      const racingKey = prepare();
      const racingDoc = await (await register(racingKey)).json();
      deleteGate = deferred(); deleteEntered = deferred();
      const deleting = remove(racingDoc.id);
      await deleteEntered.promise;
      const registering = register(racingKey);
      await delay(50);
      deleteGate.resolve(); deleteGate = null; deleteEntered = null;
      assert.equal((await deleting).status, 200);
      assert.equal((await registering).status, 502);
      assert.equal((await rows(racingKey)).length, 0);

      const mismatchKey = prepare();
      assert.equal((await register(mismatchKey, { size: 99 })).status, 400);
      assert.equal(objects.has(mismatchKey), true, "A bad metadata request must not destroy a retryable upload");
      assert.equal((await register(mismatchKey)).status, 201);

      // A real SQL failure after HEAD must not delete an uploaded object.
      // The next identical request can recover after the DB issue is removed.
      const dbFailureKey = prepare("force-db-fail.pdf");
      await pgClient.unsafe(`CREATE OR REPLACE FUNCTION portal.test_document_failure() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.file_name = 'force-db-fail.pdf' THEN RAISE EXCEPTION 'synthetic insert failure'; END IF; RETURN NEW; END $$`);
      await pgClient.unsafe(`CREATE TRIGGER test_document_failure BEFORE INSERT ON portal.deal_documents FOR EACH ROW EXECUTE FUNCTION portal.test_document_failure()`);
      assert.equal((await register(dbFailureKey, { fileName: "force-db-fail.pdf" })).status, 500);
      assert.equal(objects.has(dbFailureKey), true);
      assert.equal((await rows(dbFailureKey)).length, 0);
      await pgClient.unsafe(`DROP TRIGGER test_document_failure ON portal.deal_documents`);
      assert.equal((await register(dbFailureKey, { fileName: "force-db-fail.pdf" })).status, 201);
    }
    console.log("PASS: rental/sale concurrent registration is idempotent; historical shared objects survive partial deletion; concurrent delete/register, storage/SQL failures, and authorization verified.");
  } finally {
    headGate?.resolve(); deleteGate?.resolve();
    globals.__agreementTestSession = null;
    mock.restoreAll();
    await closeDatabaseConnections();
  }
}

main().finally(async () => {
  await admin.unsafe(`DROP DATABASE IF EXISTS ${databaseName} WITH (FORCE)`);
  await admin.end();
}).catch(error => { console.error(error); process.exitCode = 1; });
