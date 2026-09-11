# Listing email campaign payments

The workbench menu uses four aligned columns. Payments lists **Listing Email Blast / Listing 邮件群发 — $22** and directs the agent to choose a listing campaign before paying. The legacy `transfer_fee` is retired from new sales; historical orders keep their original identity. Onboarding's separate $20 license transfer fee is unchanged.

Each campaign has one current order in `portal.listing_email_payments`. Checkout uses an app-tagged one-time $22 USD line item, saved customer identity, cards only, no discounts, and a one-hour expiration. Parameters and the order are committed before requesting Stripe; concurrent clicks and lost responses reuse the order's idempotency key. Only expired unpaid sessions can be replaced. Paid sessions remain bound to the same campaign for delivery retries.

`POST /api/marketing/email/campaigns/:id/checkout` checks active login, same-origin requests, and campaign ownership (including admins). `GET .../:id/payment` reads Stripe's expanded session, PaymentIntent and charge. `POST .../:id/publish` (immediate or scheduled) and `POST .../:id/resume` require the same verified $22 payment. The check includes app, SKU, order, campaign, agent, currency, amount, settlement and reversal state. An old transfer payment, another task's order, browser success flags, and an unsigned request cannot grant access. Failed Stripe checks fail closed. Existing queued deliveries remain governed by the email service; later refunds do not recall delivered mail or automatically cancel an already-running worker.

Checkout returns to the selected campaign. It never publishes automatically. Drafts, previews, audience preparation and self-tests can be prepared before payment; the existing successful-current-version test remains necessary before publishing. The downstream email service preserves its campaign state/version and send-job idempotency checks. Portal principals cannot use native email-service login; signed integration credentials stay server-side.

Apply `db/migrations/20260911-listing-email-payments.sql` before deploying. No new Stripe environment variable is required: the campaign checkout supplies the fixed line item directly, including its product name. Existing Homix checkout webhooks record its order normally. The new SKU is rejected by the general checkout route because a campaign binding is required.

Validation:
- `npm run test:listing-email-payment`: payment evidence, wrong owner/task/app/SKU, partial and full refunds, and catalog identity.
- With a **local throwaway Postgres** initialized by `npm run db:seed`, run `npm run test:listing-email-payment:db`: concurrent checkout reservation, expiration, lost-response recovery, per-task access, retries and reversals. Stripe and external fetches are mocked; no real charge or email is sent.
- `npm test`, `npm run lint`, `npx tsc --noEmit`, `npm run build`.
