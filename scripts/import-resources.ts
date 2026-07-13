/**
 * CLI wrapper for the resources import (data lives in
 * src/db/import-resources-data.ts; production runs it via
 * POST /api/admin/import-resources instead, where Turso credentials live).
 *
 * Local:  npx tsx scripts/import-resources.ts        (file:local.db)
 */
import { createClient } from "@libsql/client";
import { runResourcesImport } from "../src/db/import-resources-data";

const client = createClient({
  url: process.env.TURSO_DATABASE_URL || "file:local.db",
  authToken: process.env.TURSO_AUTH_TOKEN,
});

runResourcesImport(client)
  .then((s) => {
    console.log("target:", process.env.TURSO_DATABASE_URL ? "TURSO (remote)" : "file:local.db");
    console.log(
      `forms: ${s.formsInserted} inserted, ${s.formsUpdated} updated | ` +
        `checklist: ${s.checklistInserted} inserted, ${s.checklistSkipped} already present`,
    );
    process.exit(0);
  })
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
