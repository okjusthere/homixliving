import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import type Stripe from "stripe";
import { db, closeDatabaseConnections } from "@/db";
import { agents } from "@/db/schema";
import { query } from "../content/store";
import { getStripe } from "../stripe";
import { startListingEmailCheckout, requireListingEmailPayment, getListingEmailPayment } from "../commerce/listing-email-payment";

async function main() {
  assert.ok(["localhost", "127.0.0.1"].includes(new URL(process.env.DATABASE_URL!).hostname), "Local test DB only");
  process.env.STRIPE_SECRET_KEY = "sk_test_local_fake";
  process.env.EMAIL_SERVICE_URL = "http://localhost:3999";
  process.env.EMAIL_SERVICE_HOMIX_SECRET = "local-integration-secret-not-for-production";
  process.env.AGENTS_REVALIDATE_SECRET = "local-only";
  const realFetch = globalThis.fetch;
  const campaignId = randomUUID(), otherCampaign = randomUUID();
  const [agent] = await db.insert(agents).values({ name: "Listing payment test", email: `${randomUUID()}@example.invalid`, accountStatus: "active", licensedCompanyId: "homix_realty", stripeCustomerId: `cus_test${Date.now()}` }).returning();
  let prepared = false;
  const actor = { agentId: agent.id, admin: false, email: agent.email };
  globalThis.fetch = async (input, init) => {
    const url = new URL(String(input));
    if (url.pathname === "/api/agent-profile") return Response.json({ linked: false });
    assert.equal(url.origin, "http://localhost:3999", "No outbound service calls in test");
    const token = String((init?.headers as Record<string,string>).Authorization).slice(7);
    const claims = JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString());
    assert.equal(claims.admin, false, "Payment creation enforces owner scope even for admins");
    assert.ok(url.pathname.endsWith(campaignId) || url.pathname.endsWith(otherCampaign));
    return Response.json({ campaign: { id: url.pathname.split("/").pop(), status: "DRAFT", audienceCount: prepared ? 100 : 0, version: 1, lastTestedVersion: prepared ? 1 : null, lastSuccessfulTestAt: prepared ? new Date().toISOString() : null } });
  };
  const stripe = getStripe();
  const sessions = new Map<string, Stripe.Checkout.Session>();
  const keyed = new Map<string, Stripe.Checkout.Session>();
  let creations = 0;
  stripe.checkout.sessions.create = (async (params: Stripe.Checkout.SessionCreateParams, options: Stripe.RequestOptions) => {
    const key = options.idempotencyKey!;
    if (keyed.has(key)) return keyed.get(key)!;
    creations++;
    assert.deepEqual(params.payment_method_types, ["card"]);
    assert.equal(params.allow_promotion_codes, undefined);
    assert.equal(params.line_items?.[0].price_data?.unit_amount, 2200);
    assert.ok(params.success_url?.includes(`campaign=${campaignId}`));
    const session = { id: `cs_test_${creations}`, url: `https://checkout.stripe.com/test_${creations}`, status: "open", payment_status: "unpaid", mode: "payment", metadata: params.metadata, client_reference_id: params.client_reference_id, amount_subtotal: 2200, amount_total: 2200, currency: "usd" } as Stripe.Checkout.Session;
    sessions.set(session.id, session); keyed.set(key, session);
    return session;
  }) as typeof stripe.checkout.sessions.create;
  stripe.checkout.sessions.retrieve = (async (id: string) => {
    assert.ok(sessions.has(id)); return sessions.get(id)!;
  }) as typeof stripe.checkout.sessions.retrieve;
  try {
    await assert.rejects(requireListingEmailPayment(actor, campaignId), { status: 402 });
    await assert.rejects(startListingEmailCheckout(actor, campaignId, "http://localhost:3107"), { status: 409 });
    assert.equal(creations, 0, "No checkout before the campaign is prepared and tested");
    prepared = true;
    const results = await Promise.all(Array.from({ length: 4 }, () => startListingEmailCheckout(actor, campaignId, "http://localhost:3107")));
    assert.equal(new Set(results.map((r) => r.url)).size, 1);
    assert.equal(creations, 1, "Parallel clicks reuse one checkout");
    await assert.rejects(requireListingEmailPayment(actor, campaignId), { status: 402 });
    const first = sessions.get("cs_test_1")!;
    first.status = "expired"; first.url = null;
    await startListingEmailCheckout(actor, campaignId, "http://localhost:3107");
    assert.equal(creations, 2, "Only expired checkout can be replaced");
    // Simulate a lost response: the order has no session ID but Stripe has one.
    await query("UPDATE portal.commerce_orders SET stripe_checkout_session_id=NULL WHERE id=(SELECT order_id FROM portal.listing_email_payments WHERE campaign_id=$1)", [campaignId]);
    await startListingEmailCheckout(actor, campaignId, "http://localhost:3107");
    assert.equal(creations, 2, "Uncertain request recovers through the same Stripe idempotency key");
    const second = sessions.get("cs_test_2")!;
    Object.assign(second, { status: "complete", url: null, payment_status: "paid", payment_intent: { status: "succeeded", currency: "usd", amount_received: 2200, latest_charge: { paid: true, captured: true, amount_refunded: 0, refunded: false } } });
    await requireListingEmailPayment(actor, campaignId);
    await requireListingEmailPayment(actor, campaignId); // A delivery retry does not consume payment.
    assert.deepEqual(await startListingEmailCheckout(actor, campaignId, "http://localhost:3107"), { paid: true });
    assert.equal(creations, 2);
    await assert.rejects(requireListingEmailPayment(actor, otherCampaign), { status: 402 });
    await assert.rejects(getListingEmailPayment({ ...actor, agentId: agent.id + 1 }, campaignId), { status: 404 });
    (second.payment_intent as Stripe.PaymentIntent).latest_charge = { paid: true, captured: true, amount_refunded: 2200, refunded: true } as Stripe.Charge;
    await assert.rejects(requireListingEmailPayment(actor, campaignId), { status: 402 });
    await assert.rejects(startListingEmailCheckout(actor, campaignId, "http://localhost:3107"), { status: 409 });
    console.log("Listing email DB integration passed: concurrent checkout, expiry, lost response, payment gate, retry, task/owner isolation, refund. No emails or real payments sent.");
  } finally {
    globalThis.fetch = realFetch;
    await query("DELETE FROM portal.listing_email_payments WHERE agent_id=$1", [agent.id]);
    await query("DELETE FROM portal.commerce_orders WHERE agent_id=$1", [agent.id]);
    await query("DELETE FROM portal.agents WHERE id=$1", [agent.id]);
  }
}
main().finally(closeDatabaseConnections);
