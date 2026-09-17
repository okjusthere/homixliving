import { sql } from "drizzle-orm";
import type { DbTransaction } from "@/lib/advisory-locks";

// Registration retries and deletion must agree on a single object-key lock.
// A transaction lock also works across separate Vercel processes. Hash
// collisions only serialize otherwise independent files; they cannot mix data.
export async function lockDealDocumentObject(tx: DbTransaction, objectKey: string) {
  await tx.execute(sql`SELECT pg_advisory_xact_lock(31006, hashtext(${objectKey}))`);
}
