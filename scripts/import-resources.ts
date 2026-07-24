/**
 * CLI wrapper for the resources import (data lives in
 * src/db/import-resources-data.ts; production runs it via
 * POST /api/admin/import-resources instead, where DATABASE_URL is configured).
 *
 * Local:  npx tsx scripts/import-resources.ts        (Postgres on :5499)
 */
import postgres from "postgres";
import { runResourcesImport } from "../src/db/import-resources-data";

const url =
  process.env.DATABASE_URL?.trim() || "postgres://postgres@localhost:5499/homixliving";
const client = postgres(url, { prepare: false, max: 1, onnotice: () => {} });

runResourcesImport(client)
  .then((s) => {
    console.log("target:", process.env.DATABASE_URL ? "DATABASE_URL (remote)" : "local :5499");
    console.log(
      `forms: ${s.formsInserted} inserted, ${s.formsUpdated} updated | ` +
        `checklist: ${s.checklistInserted} inserted, ${s.checklistSkipped} already present`,
    );
    client.end({ timeout: 2 }).finally(() => process.exit(0));
  })
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
