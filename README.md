This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Payments Setup

The public payment page is `/pay`. Stripe Checkout uses server-side price IDs, and the webhook endpoint is `/api/stripe/webhook`.

Required Stripe environment variables:

```bash
STRIPE_SECRET_KEY=sk_test_or_live_...
STRIPE_WEBHOOK_SECRET=whsec_...
APP_URL=https://your-production-domain
STRIPE_PRICE_COMPANY_DOMAIN_EMAIL_MONTHLY=price_...
STRIPE_PRICE_ELITE_DESK_FEE_YEARLY=price_...
STRIPE_PRICE_GROWTH_DESK_FEE_YEARLY=price_...
STRIPE_PRICE_TWO_YEAR_MEMBERSHIP=price_...
STRIPE_PRICE_ONE_YEAR_MEMBERSHIP=price_...
STRIPE_PRICE_LIBOR=price_...
STRIPE_PRICE_TRANSFER_FEE=price_...
```

Create or reuse the configured Stripe Products and Prices:

```bash
npm run stripe:products
```

Google Workspace provisioning for company email supports two server-side auth modes. The recommended
fallback when service account keys are blocked by organization policy is OAuth with an admin refresh
token:

```bash
GOOGLE_WORKSPACE_ALLOWED_DOMAINS=homixny.com
GOOGLE_WORKSPACE_AUTH_MODE=oauth
GOOGLE_WORKSPACE_OAUTH_CLIENT_ID=...
GOOGLE_WORKSPACE_OAUTH_CLIENT_SECRET=...
GOOGLE_WORKSPACE_OAUTH_REFRESH_TOKEN=...
RESEND_API_KEY=re_...
WORKSPACE_ONBOARDING_FROM_EMAIL=invoice@homixny.com
```

After creating a Google OAuth client, generate the refresh token locally:

```bash
npm run google:workspace:oauth
```

Service account auth is also supported when domain-wide delegation and private key creation are
allowed:

```bash
GOOGLE_WORKSPACE_ALLOWED_DOMAINS=homixny.com
GOOGLE_WORKSPACE_ADMIN_EMAIL=admin@homixny.com
GOOGLE_WORKSPACE_CLIENT_EMAIL=service-account@project.iam.gserviceaccount.com
GOOGLE_WORKSPACE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
RESEND_API_KEY=re_...
WORKSPACE_ONBOARDING_FROM_EMAIL=invoice@homixny.com
```

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
