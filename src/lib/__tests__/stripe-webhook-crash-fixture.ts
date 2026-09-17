// Spawned ONLY by stripe-webhook-reliability-db.test.ts, then deliberately killed.
import assert from "node:assert/strict";
import { db } from "@/db";
import { commerceOrders } from "@/db/schema";
import { eq } from "drizzle-orm";
import { withStripeEventProcessing } from "@/lib/commerce/stripe-event-processing";
const url = new URL(process.env.DATABASE_URL || "");
assert.ok(["localhost", "127.0.0.1"].includes(url.hostname) && url.pathname.startsWith("/homix_stripe_"));
void withStripeEventProcessing({ id: process.env.STRIPE_TEST_EVENT_ID!, type: "invoice.payment_succeeded" },
  process.env.STRIPE_TEST_RESOURCE!, async () => {
    await db.update(commerceOrders).set({ status: "synthetic_interrupted" }).where(eq(commerceOrders.id, Number(process.env.STRIPE_TEST_ORDER_ID)));
    process.stdout.write("SIDE_EFFECT_COMMITTED\n");
    await new Promise(() => { setInterval(() => {}, 1000); });
    return null;
  }).catch(error => { console.error(error); process.exitCode = 1; });
