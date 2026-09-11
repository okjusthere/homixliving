import "server-only";
import type Stripe from "stripe";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { agents } from "@/db/schema";
import { query, transaction, ContentError } from "@/lib/content/store";
import type { ContentActor } from "@/lib/content/api";
import { emailMarketingRequest } from "@/lib/email-marketing";
import { getStripe } from "@/lib/stripe";
import { resolveStripeCustomerForAgent, checkoutCustomerOptions } from "./stripe-customer";
import { withStripeAppMetadata } from "./stripe-app";
import { LISTING_EMAIL_AMOUNT_CENTS, LISTING_EMAIL_PRODUCT_KEY, listingEmailPaymentState, type ListingEmailPayment } from "./listing-email-policy";

type Binding = {
  campaignId: string; agentId: number; orderId: number;
  checkoutParams: Stripe.Checkout.SessionCreateParams;
  sessionId: string | null;
};
const columns = `p.campaign_id AS "campaignId",p.agent_id AS "agentId",p.order_id AS "orderId",p.checkout_params AS "checkoutParams",o.stripe_checkout_session_id AS "sessionId"`;
async function bindingFor(campaignId: string, agentId: number) {
  const [binding] = await query<Binding>(`SELECT ${columns} FROM portal.listing_email_payments p JOIN portal.commerce_orders o ON o.id=p.order_id WHERE p.campaign_id=$1`, [campaignId]);
  if (binding && binding.agentId !== agentId) throw new ContentError("Campaign not found", 404);
  return binding;
}
async function inspect(binding: Binding) {
  if (!binding.sessionId) return { payment: { paid: false, status: "unpaid" } as ListingEmailPayment, session: null };
  const session = await getStripe().checkout.sessions.retrieve(binding.sessionId, { expand: ["payment_intent.latest_charge"] });
  const payment = listingEmailPaymentState(session, binding);
  return { payment, session };
}
export async function getListingEmailPayment(actor: ContentActor, campaignId: string): Promise<ListingEmailPayment> {
  const binding = await bindingFor(campaignId, actor.agentId);
  return binding ? (await inspect(binding)).payment : { paid: false, status: "unpaid" };
}
export async function requireListingEmailPayment(actor: ContentActor, campaignId: string) {
  const payment = await getListingEmailPayment(actor, campaignId);
  if (!payment.paid) throw new ContentError(
    "Pay $22 for this campaign before sending / 请先支付此群发任务的 $22 费用。",
    402, "LISTING_EMAIL_PAYMENT_REQUIRED",
  );
}

/** Reserve an order before calling Stripe. Concurrent clicks and uncertain
 * network responses reuse the persisted parameters and Stripe idempotency key. */
export async function startListingEmailCheckout(actor: ContentActor, campaignId: string, baseUrl: string) {
  // Even Portal administrators must pay for their own campaign. Do not allow
  // a payment to be attached to a campaign owned by another agent.
  const { campaign } = await emailMarketingRequest({ ...actor, admin: false }, `campaigns/${campaignId}`);
  const old = await bindingFor(campaignId, actor.agentId);
  const current = old ? await inspect(old) : null;
  if (current?.payment.paid) return { paid: true };
  if (current?.payment.status === "refunded") throw new ContentError("This payment was reversed. Contact support / 此付款已退回，请联系管理员。", 409);
  if (!["DRAFT", "PAUSED"].includes(campaign.status)) throw new ContentError("This campaign cannot start a new checkout / 此任务当前无法开始付款。", 409);
  if (current?.session?.status === "complete") throw new ContentError("Payment is still being confirmed / 正在确认付款，请稍后刷新。", 409);
  if (campaign.status === "DRAFT" && (!campaign.audienceCount || campaign.lastTestedVersion !== campaign.version || !campaign.lastSuccessfulTestAt)) {
    throw new ContentError("Finish your email, audience and successful test before paying / 请先完成邮件、收件人选择和测试，再付款。", 409);
  }
  const now = Math.floor(Date.now() / 1000);
  // A session with an enforced expiration cannot be paid after this time. Keep
  // ambiguous attempts until then; never create a second payable checkout.
  const replace = !!old && (current?.session?.status === "expired" ||
    (!old.sessionId && (old.checkoutParams.expires_at ?? Infinity) + 60 < now));
  let binding = old;
  if (!binding || replace) {
    const [agent] = await db.select().from(agents).where(eq(agents.id, actor.agentId)).limit(1);
    if (!agent || agent.accountStatus !== "active") throw new ContentError("Access denied", 403);
    const stripeCustomerId = await resolveStripeCustomerForAgent({ agent, stripe: getStripe() });
    binding = await transaction(async (client) => {
      await query("SELECT pg_advisory_xact_lock(hashtextextended($1, 2200))", [campaignId], client);
      const [latest] = await query<Binding>(`SELECT ${columns} FROM portal.listing_email_payments p JOIN portal.commerce_orders o ON o.id=p.order_id WHERE p.campaign_id=$1`, [campaignId], client);
      if (latest && latest.agentId !== actor.agentId) throw new ContentError("Campaign not found", 404);
      if (latest && (!replace || latest.orderId !== old?.orderId)) return latest;
      const [order] = await query<{ id: number }>(`INSERT INTO portal.commerce_orders
        (agent_id,product_key,product_name,billing_mode,amount_cents,currency,status,customer_name,customer_email,stripe_customer_id,created_at,updated_at)
        VALUES($1,$2,'Listing Email Blast','payment',$3,'usd','pending',$4,$5,$6,NOW(),NOW()) RETURNING id`,
        [actor.agentId, LISTING_EMAIL_PRODUCT_KEY, LISTING_EMAIL_AMOUNT_CENTS, agent.legalName || agent.name, agent.email, stripeCustomerId], client);
      const metadata = withStripeAppMetadata({ agentId: String(actor.agentId), orderId: String(order.id), productKey: LISTING_EMAIL_PRODUCT_KEY, campaignId });
      const checkoutParams: Stripe.Checkout.SessionCreateParams = {
        mode: "payment", payment_method_types: ["card"],
        ...checkoutCustomerOptions(stripeCustomerId),
        client_reference_id: String(order.id), metadata,
        payment_intent_data: { metadata, description: "Listing Email Blast — $22 per campaign" },
        line_items: [{ quantity: 1, price_data: { currency: "usd", unit_amount: LISTING_EMAIL_AMOUNT_CENTS,
          product_data: { name: "Listing Email Blast / Listing 邮件群发", description: "One campaign · 同一任务失败重试不重复收费", metadata: withStripeAppMetadata({ homix_product_key: LISTING_EMAIL_PRODUCT_KEY }) } } }],
        expires_at: Math.floor(Date.now() / 1000) + 3600,
        success_url: `${baseUrl}/marketing/email?campaign=${campaignId}&payment=returned`,
        cancel_url: `${baseUrl}/marketing/email?campaign=${campaignId}&payment=canceled`,
      };
      await query(`INSERT INTO portal.listing_email_payments(campaign_id,agent_id,order_id,checkout_params)
        VALUES($1,$2,$3,$4) ON CONFLICT(campaign_id) DO UPDATE SET order_id=EXCLUDED.order_id,checkout_params=EXCLUDED.checkout_params,created_at=NOW()`,
        [campaignId, actor.agentId, order.id, JSON.stringify(checkoutParams)], client);
      return { campaignId, agentId: actor.agentId, orderId: order.id, checkoutParams, sessionId: null };
    });
  }
  // Re-read existing sessions rather than re-creating after Stripe's 24h
  // idempotency retention. Lost responses within an attempt use identical data.
  const session = binding.sessionId
    ? await getStripe().checkout.sessions.retrieve(binding.sessionId)
    : await getStripe().checkout.sessions.create(binding.checkoutParams, { idempotencyKey: `listing-email-order-${binding.orderId}` });
  await query(`UPDATE portal.commerce_orders SET stripe_checkout_session_id=$1,checkout_url=$2,updated_at=NOW() WHERE id=$3`, [session.id, session.url, binding.orderId]);
  if (!session.url || session.status !== "open") throw new ContentError("Checkout status changed. Refresh this campaign / 付款状态已更新，请刷新此任务。", 409);
  return { url: session.url, paid: false };
}
