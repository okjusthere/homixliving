import type Stripe from "stripe";
import {
  getProductStripePriceId,
  type CommerceProduct,
} from "@/lib/commerce/catalog";
import { STRIPE_APP_ID } from "@/lib/commerce/stripe-app";

function recurringFor(
  product: CommerceProduct,
): Stripe.PriceCreateParams.Recurring | undefined {
  if (product.billingMode !== "subscription") return undefined;
  if (product.key === "company_domain_email") return { interval: "month" };
  return { interval: "year" };
}

function priceMatches(price: Stripe.Price, product: CommerceProduct): boolean {
  const recurring = recurringFor(product);
  const recurringMatches =
    product.billingMode === "payment"
      ? !price.recurring
      : price.recurring?.interval === recurring?.interval;

  return (
    price.currency === product.currency &&
    price.unit_amount === product.amountCents &&
    recurringMatches
  );
}

async function findProduct(
  stripe: Stripe,
  product: CommerceProduct,
): Promise<Stripe.Product | null> {
  for await (const candidate of stripe.products.list({ active: true, limit: 100 })) {
    if (
      (!candidate.metadata.app || candidate.metadata.app === STRIPE_APP_ID) &&
      (candidate.metadata.homix_product_key === product.key ||
        candidate.name === product.name)
    ) {
      return candidate;
    }
  }
  return null;
}

export async function ensureStripeProductPrice(
  stripe: Stripe,
  product: CommerceProduct,
): Promise<string> {
  const configuredPriceId = getProductStripePriceId(product);
  if (configuredPriceId) return configuredPriceId;

  const stripeProduct =
    (await findProduct(stripe, product)) ||
    (await stripe.products.create(
      {
        name: product.name,
        description: product.description,
        metadata: {
          app: STRIPE_APP_ID,
          homix_product_key: product.key,
          source: "homixliving",
        },
      },
      { idempotencyKey: `homix-product-${product.key}` },
    ));

  for await (const price of stripe.prices.list({
    active: true,
    product: stripeProduct.id,
    limit: 100,
  })) {
    if (priceMatches(price, product)) return price.id;
  }

  const price = await stripe.prices.create(
    {
      product: stripeProduct.id,
      currency: product.currency,
      unit_amount: product.amountCents,
      recurring: recurringFor(product),
      metadata: {
        app: STRIPE_APP_ID,
        homix_product_key: product.key,
        source: "homixliving",
      },
    },
    { idempotencyKey: `homix-price-${product.key}-${product.amountCents}-${product.billingMode}` },
  );
  return price.id;
}
