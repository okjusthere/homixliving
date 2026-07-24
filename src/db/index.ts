import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

// Supabase Postgres. In production DATABASE_URL must point at the Supabase
// pooler (transaction mode) — refuse to boot without it rather than silently
// writing to a local database. Fail fast at runtime, but exempt the build
// phase: `next build` runs with NODE_ENV=production before runtime env is
// injected, and page-data collection imports this module.
//
// Local dev/E2E runs against the throwaway Postgres on :5499
// (initdb'd per-machine; see the pg-migration runbook).
const LOCAL_DEV_URL = "postgres://postgres@localhost:5499/homixliving";

const url = process.env.DATABASE_URL?.trim() || "";
const isBuildPhase = process.env.NEXT_PHASE === "phase-production-build";
if (process.env.NODE_ENV === "production" && !isBuildPhase && !url) {
  throw new Error(
    "DATABASE_URL is required in production. Refusing to fall back to a local database."
  );
}

// Supabase's transaction-mode pooler (pgbouncer) does not support prepared
// statements — `prepare: false` is required there and harmless locally.
//
// `max: 1` matches Supabase's own guidance for serverless + transaction-mode
// pooling: pgbouncer already pools connections server-side, so each function
// instance only needs one; holding several idle connections per instance (the
// prior `max: 5`) needlessly eats into pgbouncer's shared client-connection
// budget once many instances are warm at once, which is the likely cause of
// the intermittent `CONNECT_TIMEOUT` seen in production. `connect_timeout`
// makes a stuck attempt fail fast instead of hanging until the surrounding
// request times out; `idle_timeout` releases the connection promptly between
// requests so it doesn't sit open on a cold/rarely-hit instance.
export const pgClient = postgres(url || LOCAL_DEV_URL, {
  prepare: false,
  max: 1,
  connect_timeout: 10,
  idle_timeout: 20,
  onnotice: () => {},
});

export const db = drizzle(pgClient, { schema });
