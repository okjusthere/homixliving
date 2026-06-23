import { loadEnvConfig } from "@next/env";
import Stripe from "stripe";
import { commerceProducts, type CommerceProduct } from "../src/lib/commerce/catalog";

loadEnvConfig(process.cwd());

const secretKey = process.env.STRIPE_SECRET_KEY?.trim();

if (!secretKey) {
  console.error("STRIPE_SECRET_KEY is required. Add sk_test_... or sk_live_... to .env.local.");
  process.exit(1);
}

const stripe = new Stripe(secretKey);

function recurringFor(product: CommerceProduct): Stripe.PriceCreateParams.Recurring | undefined {
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

async function findProduct(product: CommerceProduct): Promise<Stripe.Product | null> {
  for await (const candidate of stripe.products.list({ active: true, limit: 100 })) {
    if (candidate.name === product.name) return candidate;
  }
  return null;
}

async function ensureProduct(product: CommerceProduct): Promise<Stripe.Product> {
  const existing = await findProduct(product);
  if (existing) return existing;

  return stripe.products.create({
    name: product.name,
    description: product.description,
    metadata: {
      homix_product_key: product.key,
      source: "homixliving",
    },
  });
}

async function ensurePrice(product: CommerceProduct, stripeProduct: Stripe.Product): Promise<Stripe.Price> {
  for await (const price of stripe.prices.list({
    active: true,
    product: stripeProduct.id,
    limit: 100,
  })) {
    if (priceMatches(price, product)) return price;
  }

  return stripe.prices.create({
    product: stripeProduct.id,
    currency: product.currency,
    unit_amount: product.amountCents,
    recurring: recurringFor(product),
    metadata: {
      homix_product_key: product.key,
      source: "homixliving",
    },
  });
}

async function main() {
  console.log("Add these values to your environment:");

  for (const product of commerceProducts) {
    const stripeProduct = await ensureProduct(product);
    const price = await ensurePrice(product, stripeProduct);
    console.log(`${product.priceEnvVar}=${price.id}`);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
