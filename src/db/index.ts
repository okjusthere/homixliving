import { attachDatabasePool } from "@vercel/functions";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
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

const connectionString = url || LOCAL_DEV_URL;

// Application traffic uses node-postgres so Vercel Fluid Compute can close
// idle sockets before freezing an instance. Reusing a frozen postgres-js
// socket caused intermittent CONNECT_TIMEOUTs and 300-second request hangs.
export const pgPool = new Pool({
  connectionString,
  max: 4,
  connectionTimeoutMillis: 5_000,
  idleTimeoutMillis: 10_000,
  query_timeout: 15_000,
  statement_timeout: 15_000,
  keepAlive: true,
  keepAliveInitialDelayMillis: 5_000,
  allowExitOnIdle: true,
  maxLifetimeSeconds: 60,
});

pgPool.on("error", (error) => {
  console.error("Idle Postgres pool client failed", error);
});

if (process.env.VERCEL) {
  attachDatabasePool(pgPool);
}

export const db = drizzle(pgPool, { schema });

// Administrative DDL and seed scripts still use postgres-js because the
// migration helpers rely on its tagged-template and unsafe-query APIs. It is
// lazy and no longer runs during application startup.
export const pgClient = postgres(url || LOCAL_DEV_URL, {
  prepare: false,
  max: 1,
  connect_timeout: 10,
  idle_timeout: 10,
  keep_alive: 5,
  max_lifetime: 60,
  onnotice: () => {},
});

export async function closeDatabaseConnections() {
  await Promise.allSettled([
    pgPool.end(),
    pgClient.end({ timeout: 5 }),
  ]);
}
