import "server-only";
import { Pool } from "pg";
import { attachDatabasePool } from "@vercel/functions";
import { pgPool } from "@/db";
import { AsyncLocalStorage } from "node:async_hooks";

// A separate, single-connection pool is deliberate: holding a mutex in the
// application pool while a handler requests another connection can deadlock
// four concurrent deliveries (the application pool has max=4). Transactions
// keep these locks valid through Supabase's transaction-mode pooler.
const lockPool = new Pool({
  connectionString: pgPool.options.connectionString,
  max: 1,
  connectionTimeoutMillis: 1000,
  idleTimeoutMillis: 10000,
  statement_timeout: 15000,
  allowExitOnIdle: true,
  options: "-c TimeZone=UTC",
  application_name: "homix-stripe-webhook-mutex",
});
lockPool.on("error", (error) => console.error("Stripe processing lock connection failed", error));
if (process.env.VERCEL) attachDatabasePool(lockPool);

export class StripeEventBusy extends Error {}
const ownership = new AsyncLocalStorage<() => Promise<void>>();

/** Check again after provider/network waits and before effects. A PostgreSQL
 * connection can disappear without killing the Node process that held it. */
export async function assertStripeEventOwnership() {
  await ownership.getStore()?.();
}

/** The completion marker commits ONLY after the handler succeeds. A killed
 * process releases its transaction locks automatically; a retry can recover.
 * Business writes have their existing independent transactions/idempotency
 * keys. This does not promise atomicity with external providers. */
export async function withStripeEventProcessing(
  event: { id: string; type: string },
  resourceKey: string,
  work: () => Promise<number | null>,
): Promise<"processed" | "duplicate"> {
  const client = await lockPool.connect().catch(() => {
    throw new StripeEventBusy("Stripe processing is busy; retry this delivery.");
  });
  let connectionLost = false;
  const lost = () => { connectionLost = true; };
  client.on("error", lost);
  const assertOwned = async () => {
    if (connectionLost) throw new StripeEventBusy("Stripe processing lock connection was lost.");
    // Also detects a silently broken socket/aborted transaction before applying
    // the next effect. It cannot recall a provider request already in flight.
    await client.query("SELECT 1");
  };
  try {
    await client.query("BEGIN");
    for (const key of [`event:${event.id}`, `resource:${resourceKey}`]) {
      const { rows } = await client.query<{ locked: boolean }>(
        "SELECT pg_try_advisory_xact_lock(hashtextextended($1, 31005)) AS locked", [key],
      );
      if (!rows[0].locked) throw new StripeEventBusy("Stripe object is being reconciled; retry this delivery.");
    }
    const { rows } = await client.query<{ completed_at: string | null; commerce_order_id: number | null }>(
      "SELECT completed_at,commerce_order_id FROM portal.stripe_events WHERE id=$1", [event.id],
    );
    if (rows[0]?.completed_at || rows[0]?.commerce_order_id != null) {
      // The old deployment may finish a delivery AFTER the column migration
      // but BEFORE this code takes over. It only wrote its order link after
      // successful processing, so preserve that completion proof. New writers
      // always commit the order link and completed_at together below.
      if (!rows[0].completed_at) {
        await client.query(`UPDATE portal.stripe_events
          SET completed_at=COALESCE(received_at,NOW()) WHERE id=$1 AND completed_at IS NULL`, [event.id]);
      }
      await client.query("COMMIT");
      return "duplicate";
    }
    await client.query(`INSERT INTO portal.stripe_events(id,type,received_at)
      VALUES($1,$2,NOW()) ON CONFLICT(id) DO NOTHING`, [event.id, event.type]);
    const orderId = await ownership.run(assertOwned, work);
    await assertOwned();
    await client.query(`UPDATE portal.stripe_events SET commerce_order_id=$2,completed_at=NOW()
      WHERE id=$1`, [event.id, orderId]);
    await client.query("COMMIT");
    return "processed";
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    client.removeListener("error", lost);
    client.release(connectionLost);
  }
}

export async function closeStripeEventProcessingConnections() {
  await lockPool.end();
}
