# Homix 内部经纪 CRM

Internal brokerage CRM for Homix (NYC residential real estate). It records rental and
sales deals with multi-agent commission splits, generates OP invoices (PDF + email to
building management), and tracks everything an admin needs to run the brokerage:

- **Deals** — rental & sale pipelines, multi-agent splits (primary / co-agent / referrer), cents-exact commission math
- **Invoices** — OP invoicing per building with PDF generation (`@react-pdf/renderer`) and Resend email send log
- **Buildings DB** — 369 NYC buildings with billing/submission rules per management company
- **Teams & visibility** — row-level access: agents see their own deals, team leads their team, admins everything
- **Reports** — monthly + year-mode commission/GCI reporting, aging report for outstanding invoices
- **Renewals** — lease-end pipeline (30/60/90-day windows) with a daily reminder cron
- **Training & resources portal** — Cloudflare Stream video library + shared resource links
- **Notifications** — in-app bell + optional email fan-out (approvals, renewals, deal events)
- **Audit log** — append-only trail on every money/roster mutation, browsable at `/audit`
- **Commerce** — public `/pay` page for desk fees & memberships via Stripe Checkout, with Google Workspace mailbox provisioning for company-email orders
- **Global search** — ⌘K palette over deals, invoices, buildings, agents
- Bilingual UI (中文 / English) via a cookie-based locale toggle

**Auth is Google-only.** Any Google account can sign in; new accounts land in a pending
state until an admin approves them. Emails listed in `ADMIN_EMAILS` are auto-approved
as admins. There are no passwords or magic links.

## Stack

Next.js 16 (App Router) · React 19 · TypeScript · Tailwind v4 · Drizzle ORM +
Turso/libsql · next-auth v5 (Google, JWT sessions) · Stripe · Resend · Vercel Blob ·
Cloudflare Stream · deployed on Vercel.

## Getting started

```bash
npm install

# There is no .env.example — create .env.local by hand.
# Minimum for local dev (DB falls back to file:local.db if unset):
#   AUTH_SECRET=...            # openssl rand -base64 32
#   AUTH_GOOGLE_ID=...
#   AUTH_GOOGLE_SECRET=...
#   ADMIN_EMAILS=you@example.com
# See "Environment variables" below for the full list.

npm run db:seed   # creates all tables + seeds buildings/settings (idempotent)
npm run dev       # http://localhost:3000
```

Set `SEED_DEMO=1` when seeding to also insert demo teams/agents (never use in prod).

## Scripts

| Script | What it does |
| --- | --- |
| `npm run dev` | Dev server at http://localhost:3000 |
| `npm run build` | Production build |
| `npm run start` | Serve the production build |
| `npm run lint` | ESLint |
| `npm test` | All unit test suites (see Tests) |
| `npm run test:<suite>` | One suite, e.g. `test:commission`, `test:renewals` |
| `npm run db:seed` | Create/seed schema against `TURSO_DATABASE_URL` (defaults to `file:local.db`) |
| `npm run stripe:products` | Create or reuse the configured Stripe Products/Prices |
| `npm run google:workspace:oauth` | Generate a Google Workspace admin refresh token locally |
| `npx tsx scripts/verify-tables.ts` | Check a DB's tables against the expected schema |
| `npx tsx scripts/import-cloudflare-videos.ts` | Import existing Cloudflare Stream videos into `training_videos` |

## Environment variables

**Database (Turso/libsql)**

```bash
TURSO_DATABASE_URL=libsql://...   # unset → file:local.db (dev only; prod refuses to start without it)
TURSO_AUTH_TOKEN=...
```

**Auth (next-auth v5, Google only)**

```bash
AUTH_SECRET=...            # required in production
AUTH_GOOGLE_ID=...
AUTH_GOOGLE_SECRET=...
ADMIN_EMAILS=a@x.com,b@y.com   # comma-separated; auto-approved as admins
```

**Email (Resend)**

```bash
RESEND_API_KEY=re_...
FROM_EMAIL=invoice@homixny.com      # optional; invoice-send from address
CC_EMAIL=homix@homixny.com          # optional; invoice-send CC
NOTIFY_FROM_EMAIL="Homix <invoice@homixny.com>"  # optional; notification emails
APP_BASE_URL=https://agents.homixny.com          # optional; links inside notification emails (defaults to agents.homixny.com)
```

**Cron**

```bash
CRON_SECRET=...   # required — cron routes fail closed without it
```

**Storage (deal documents)**

```bash
# Vercel Blob (deal documents): connect a Blob store to the project. Newer
# stores inject BLOB_STORE_ID (OIDC mode) automatically; classic stores use:
# BLOB_READ_WRITE_TOKEN=...
```

**Stripe (public `/pay` checkout + webhook)**

```bash
STRIPE_SECRET_KEY=sk_test_or_live_...
STRIPE_WEBHOOK_SECRET=whsec_...     # webhook endpoint: /api/stripe/webhook
APP_URL=https://your-production-domain   # checkout/portal redirect base
STRIPE_PRICE_COMPANY_DOMAIN_EMAIL_MONTHLY=price_...
STRIPE_PRICE_ELITE_DESK_FEE_YEARLY=price_...
STRIPE_PRICE_GROWTH_DESK_FEE_YEARLY=price_...
STRIPE_PRICE_TWO_YEAR_MEMBERSHIP=price_...
STRIPE_PRICE_ONE_YEAR_MEMBERSHIP=price_...
STRIPE_PRICE_LIBOR=price_...
STRIPE_PRICE_TRANSFER_FEE=price_...
STRIPE_AUTOMATIC_TAX=1                     # optional
STRIPE_CUSTOMER_PORTAL_CONFIGURATION=...   # optional
```

**Google Workspace provisioning** (company-email orders). Two server-side auth
modes; OAuth with an admin refresh token is the recommended fallback when org
policy blocks service-account keys:

```bash
GOOGLE_WORKSPACE_ALLOWED_DOMAINS=homixny.com
GOOGLE_WORKSPACE_AUTH_MODE=oauth
GOOGLE_WORKSPACE_OAUTH_CLIENT_ID=...
GOOGLE_WORKSPACE_OAUTH_CLIENT_SECRET=...
GOOGLE_WORKSPACE_OAUTH_REFRESH_TOKEN=...   # generate via: npm run google:workspace:oauth
WORKSPACE_ONBOARDING_FROM_EMAIL=invoice@homixny.com
```

Service-account mode (needs domain-wide delegation + key creation allowed):

```bash
GOOGLE_WORKSPACE_ALLOWED_DOMAINS=homixny.com
GOOGLE_WORKSPACE_ADMIN_EMAIL=admin@homixny.com
GOOGLE_WORKSPACE_CLIENT_EMAIL=service-account@project.iam.gserviceaccount.com
GOOGLE_WORKSPACE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
```

Optional: `GOOGLE_WORKSPACE_RETENTION_DAYS` (suspend/delete window for lapsed
mailboxes), `GOOGLE_WORKSPACE_LOGIN_URL`.

**Cloudflare**

```bash
NEXT_PUBLIC_CLOUDFLARE_STREAM_CUSTOMER_CODE=...   # training video playback
CLOUDFLARE_ACCOUNT_ID=...    # only for scripts/import-cloudflare-videos.ts
CLOUDFLARE_API_TOKEN=...     # only for scripts/import-cloudflare-videos.ts
```

## Tests

`npm test` runs 8 plain-`tsx` assertion suites (no test framework):
commission, visibility, email-sender, invoice-payment, commerce-checkout,
aging, reporting, renewals — all under `src/lib/__tests__/`. CI
(`.github/workflows/ci.yml`) runs typecheck, lint, a `db:seed` smoke test
against a throwaway SQLite file, and the full test suite.

## Deploy (Vercel)

- Set the env vars above in the Vercel project.
- Crons are declared in `vercel.json` (`/api/cron/workspace-retention`,
  `/api/cron/renewal-reminders`, both daily). Vercel sends `CRON_SECRET`
  automatically; the routes reject anything without it.
- The Stripe webhook must point at `https://<domain>/api/stripe/webhook`.
- **Schema rollouts**: after adding tables/columns to
  `src/db/ensure-schema.ts`, deploy and then hit the rollout endpoint — it
  runs the idempotent DDL with the deployment's own credentials (Turso env
  vars are Sensitive in Vercel and can't be pulled locally):

  ```bash
  curl -X POST https://agents.homixny.com/api/admin/ensure-schema \
    -H "Authorization: Bearer $CRON_SECRET"
  ```

  (An admin browser session works too.) Alternatively run `npm run db:seed`
  against the production Turso URL if you have direct credentials. Verify
  with `npx tsx scripts/verify-tables.ts`.
