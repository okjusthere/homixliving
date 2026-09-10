import { loadEnvConfig } from "@next/env";
import Stripe from "stripe";
import { commerceProducts } from "../src/lib/commerce/catalog";
import { ensureStripeProductPrice } from "../src/lib/commerce/stripe-products";

loadEnvConfig(process.cwd(), process.env.NODE_ENV !== "production");

const secretKey = process.env.STRIPE_SECRET_KEY?.trim();
const onlyProductKey = process.env.STRIPE_ONLY_PRODUCT_KEY?.trim();

if (!secretKey) {
  console.error("STRIPE_SECRET_KEY is required. Add sk_test_... or sk_live_... to .env.local.");
  process.exit(1);
}

if (secretKey.startsWith("sk_live_") || secretKey.startsWith("rk_live_")) {
  if (process.env.STRIPE_ALLOW_LIVE_SETUP !== "1") {
    console.error("Refusing live-mode Stripe setup without STRIPE_ALLOW_LIVE_SETUP=1.");
    process.exit(1);
  }
}

const stripe = new Stripe(secretKey);

async function main() {
  console.log("Add these values to your environment:");

  const selectedProducts = onlyProductKey
    ? commerceProducts.filter((product) => product.key === onlyProductKey)
    : commerceProducts;
  if (selectedProducts.length === 0) {
    throw new Error(`Unknown STRIPE_ONLY_PRODUCT_KEY: ${onlyProductKey}`);
  }

  for (const product of selectedProducts) {
    const priceId = await ensureStripeProductPrice(stripe, product);
    console.log(`${product.priceEnvVar}=${priceId}`);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
