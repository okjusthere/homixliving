import { drizzle } from "drizzle-orm/libsql";
import { createClient } from "@libsql/client";
import * as schema from "./schema";

// In production, refuse to silently fall back to an ephemeral on-disk SQLite
// file: on a serverless host `file:local.db` lives on the instance's throwaway
// disk, so every write (deals, invoices, orders) vanishes when the instance
// recycles — with no error to signal it. Fail fast instead.
if (process.env.NODE_ENV === "production" && !process.env.TURSO_DATABASE_URL?.trim()) {
  throw new Error(
    "TURSO_DATABASE_URL is required in production. Refusing to fall back to the ephemeral file:local.db."
  );
}

const client = createClient({
  url: process.env.TURSO_DATABASE_URL || "file:local.db",
  authToken: process.env.TURSO_AUTH_TOKEN,
});

export const db = drizzle(client, { schema });
