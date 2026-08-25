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
- **Commerce** — authenticated `/pay` center for plan fees, memberships and services via Stripe Checkout, with every order bound to an agent and Google Workspace provisioning for company-email orders
- **Onboarding** — invitation links lock team, sponsor and plan; eSign and annual-fee completion are tracked before activation
- **Global search** — ⌘K palette over deals, invoices, buildings, agents
- Bilingual UI (中文 / English) via a cookie-based locale toggle

**Auth is Google-only.** Any Google account can sign in; new accounts land in a pending
state until an admin approves them. Emails listed in `ADMIN_EMAILS` are auto-approved
as admins. There are no passwords or magic links.

## Stack

Next.js 16 (App Router) · React 19 · TypeScript · Tailwind v4 · Drizzle ORM +
Supabase Postgres · next-auth v5 (Google, JWT sessions) · Stripe · Resend · Cloudflare
R2 + Stream · deployed on Vercel.

## Getting started

```bash
npm install

# Create .env.local from .env.example.
# Minimum for local dev (DB falls back to Postgres on localhost:5499 if unset):
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
| `npm run db:seed` | Create/seed the `portal` schema against `DATABASE_URL` |
| `npm run stripe:products` | Create or reuse the configured Stripe Products/Prices |
| `npm run google:workspace:oauth` | Generate a Google Workspace admin refresh token locally |
| `npx tsx scripts/verify-tables.ts` | Check a DB's tables against the expected schema |
| `npx tsx scripts/import-cloudflare-videos.ts` | Import existing Cloudflare Stream videos into `training_videos` |

## Environment variables

**Database (Supabase Postgres)**

```bash
DATABASE_URL=postgresql://...   # Supabase transaction pooler in production
```

Local development defaults to
`postgres://postgres@localhost:5499/homixliving`. Production refuses to boot
without `DATABASE_URL`.

**Public advisor profile sync**

```bash
HOMIXWEB_REVALIDATE_URL=https://www.homixny.com/api/revalidate-agents
AGENTS_REVALIDATE_SECRET=...   # identical value in both Vercel projects
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
# Private Cloudflare R2 bucket for rental and sale deal documents.
R2_ACCOUNT_ID=...
R2_ACCESS_KEY_ID=...
R2_SECRET_ACCESS_KEY=...
R2_BUCKET_NAME=homix-deal-documents
```

The R2 token should be scoped to Object Read & Write for this bucket only. The
bucket stays private. Configure CORS for `https://agents.homixny.com` (and
`http://localhost:3000` for local development), allowing `PUT` and the
`Content-Type` request header. Upload URLs expire after five minutes; download
URLs expire after one minute and are issued only after the deal visibility
check.

Apply the checked-in CORS policy after authenticating Wrangler:

```bash
npx wrangler r2 bucket cors set homix-deal-documents --file infra/r2-cors.json
```

**Stripe (authenticated `/pay` checkout + webhook)**

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

All authenticated Portal purchases are bound to `agentId`; email is retained as
a receipt/contact field rather than the accounting identity. Onboarding checkout
is available only after the agreement is signed, and its product is selected from
the agent's locked compensation plan. A Solo/Holding agent upgrading to Solo Pro
within 90 days receives the prior `$288` or `$500` affiliation payment as a
one-time Stripe discount; the annual subscription then renews at the normal rate.

Stripe is the default onboarding payment path. When the office has actually
received cash, check, ACH, Zelle, or wire payment, an administrator may use the
pending-agent console to verify an offline payment. The amount must equal the
signed plan fee and the record captures method, receipt date, reference, and
verifying administrator. Both channels use the same order settlement, onboarding
gate, and 10% sponsor-reward ledger; there is no unaudited "skip payment" switch.

**Agent onboarding eSign**

```bash
ESIGN_API_URL=https://esign.kevv.ai
ESIGN_APPLICATION_KEY=...       # dedicated HR-only Portal credential; never expose client-side
ESIGN_ONBOARDING_HOMIX_REALTY_TEMPLATE_ID=...
ESIGN_ONBOARDING_HOMIX_REALTY_TEMPLATE_VERSION_ID=... # exact reviewed and published version
ESIGN_ONBOARDING_HOMIX_REALTY_TEMPLATE_SCHEMA_HASH=... # immutable hash returned by eSign
ESIGN_ONBOARDING_HOMIX_REALTY_COUNTERSIGNER_NAME=...   # required only when the template has a countersigner role
ESIGN_ONBOARDING_HOMIX_REALTY_COUNTERSIGNER_EMAIL=...
ESIGN_ONBOARDING_HOMIX_LIVING_TEMPLATE_ID=...
ESIGN_ONBOARDING_HOMIX_LIVING_TEMPLATE_VERSION_ID=...
ESIGN_ONBOARDING_HOMIX_LIVING_TEMPLATE_SCHEMA_HASH=...
ESIGN_ONBOARDING_HOMIX_LIVING_COUNTERSIGNER_NAME=...
ESIGN_ONBOARDING_HOMIX_LIVING_COUNTERSIGNER_EMAIL=...
ESIGN_TEAM_LEADER_HOMIX_REALTY_TEMPLATE_ID=...
ESIGN_TEAM_LEADER_HOMIX_REALTY_TEMPLATE_VERSION_ID=...
ESIGN_TEAM_LEADER_HOMIX_REALTY_TEMPLATE_SCHEMA_HASH=...
ESIGN_TEAM_LEADER_HOMIX_REALTY_COUNTERSIGNER_NAME=...
ESIGN_TEAM_LEADER_HOMIX_REALTY_COUNTERSIGNER_EMAIL=...
ESIGN_TEAM_LEADER_HOMIX_LIVING_TEMPLATE_ID=...
ESIGN_TEAM_LEADER_HOMIX_LIVING_TEMPLATE_VERSION_ID=...
ESIGN_TEAM_LEADER_HOMIX_LIVING_TEMPLATE_SCHEMA_HASH=...
ESIGN_TEAM_LEADER_HOMIX_LIVING_COUNTERSIGNER_NAME=...
ESIGN_TEAM_LEADER_HOMIX_LIVING_COUNTERSIGNER_EMAIL=...
ONBOARDING_V2_ENFORCED=0         # switch to 1 only after the rollout smoke test
```

Homix Realty Inc. and Homix Living Inc. use separate template pins so Portal can
never send one legal entity's agreement to the other entity's agent. Unknown
licensed-company values fail closed. Each onboarding template must be a published
New York HR template, require no approval step, contain exactly one agent signer
role, and expose every required Portal merge field as one read-only field. Portal
pins the reviewed version and schema hash, creates an HR transaction and envelope,
fills the agent/legal/team/plan fields, sends the envelope, and verifies its
evidence package before payment. See
[docs/ONBOARDING_CONTRACTS.md](docs/ONBOARDING_CONTRACTS.md) for the PDF and field
handoff checklist.
Do not reuse an administrator-wide eSign credential: grant only
`templates:read`, `transactions:write`, and `envelopes:read/write/send`.

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

`npm test` runs the plain-`tsx` assertion suites under `src/lib/__tests__/`,
including compensation, plan payments, onboarding, visibility, commerce,
reporting, renewals, training, and document storage. CI
(`.github/workflows/ci.yml`) runs against a throwaway
Postgres service, including typecheck, lint, schema seed, tests, and build.

## Deploy (Vercel)

- Set the env vars above in the Vercel project.
- Crons are declared in `vercel.json` (`/api/cron/workspace-retention`,
  `/api/cron/renewal-reminders`, both daily). Vercel sends `CRON_SECRET`
  automatically; the routes reject anything without it.
- The Stripe webhook must point at `https://<domain>/api/stripe/webhook`.
- **Schema rollouts**: apply additive checked-in migrations before deploying
  code that reads new tables or columns. The protected rollout endpoint runs
  the same idempotent DDL and is suitable for a schema-first deployment or a
  backwards-compatible expansion:

  ```bash
  curl -X POST https://agents.homixny.com/api/admin/ensure-schema \
    -H "Authorization: Bearer $CRON_SECRET"
  ```

  For lifecycle migrations, follow [docs/DATABASE.md](docs/DATABASE.md).

### Compensation and onboarding v3.1 rollout

Keep this producer-before-consumer order so existing agents continue to work
while the new workflow is being configured:

1. Complete the eSign production release gates (retention, monitoring, backup/recovery, network isolation, and counsel/broker acceptance), then deploy the eSign API version that enforces `expectedTemplateVersionId` and `expectedTemplateSchemaHash`. Do not use the development smoke credential for Portal.
2. Publish one reviewed New York HR onboarding template per legal entity. Record each template ID, exact active version ID, and immutable schema hash; changing any of them requires a new Portal rollout review.
3. Issue a dedicated production eSign `HR` credential with only `templates:read`, `transactions:read`, `transactions:write`, `envelopes:read`, `envelopes:write`, `envelopes:send`, and `evidence:read`.
4. Apply the checked-in additive migrations, then deploy Portal code with `ONBOARDING_V2_ENFORCED=0`. Existing approval behavior remains available while configuration is verified; do not deploy code that reads a new table before its migration exists in production.
5. Configure the production `ESIGN_*` pins and credential, and confirm the Stripe annual-plan prices, checkout return URL, and signed webhook are active.
6. Run one synthetic invited-agent smoke test through profile, agreement creation, signing, verified evidence, Stripe payment, webhook settlement, sponsor reward, admin review, and activation.
7. Run a second synthetic test through the administrator-verified offline-payment path and confirm the order, sponsor reward, finance total, receipt evidence, and approval gate match the Stripe path.
8. Set `ONBOARDING_V2_ENFORCED=1`. From this point, admin approval fails closed until required agreement and payment steps are complete.

Do not enable the flag before steps 6 and 7 pass. The flag deliberately separates
deployment from enforcement so a missing eSign template, credential, or Stripe
price cannot strand all pending agents.
