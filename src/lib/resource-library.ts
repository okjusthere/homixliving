import "server-only";
import { asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { checklistItems, resources } from "@/db/schema";
async function queryLibrary(includeDrafts: boolean) {
  return Promise.all([
    db
      .select()
      .from(resources)
      .where(includeDrafts ? undefined : eq(resources.isPublished, true))
      .orderBy(asc(resources.sortOrder), asc(resources.id)),
    db
      .select()
      .from(checklistItems)
      .orderBy(asc(checklistItems.sortOrder), asc(checklistItems.id)),
  ]);
}

/**
 * Self-healing load: right after a deploy that adds columns/tables, the
 * production database hasn't run the DDL yet. On the
 * first failed query, apply the idempotent ensure-schema and retry once,
 * instead of 500ing until someone remembers to hit the admin endpoint.
 */
export async function loadLibrary(includeDrafts = false) {
  try {
    return await queryLibrary(includeDrafts);
  } catch {
    const [{ pgClient }, { ensureSchema }] = await Promise.all([
      import("@/db"),
      import("@/db/ensure-schema"),
    ]);
    await ensureSchema(pgClient);
    return queryLibrary(includeDrafts);
  }
}
