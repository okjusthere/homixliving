# Homix Portal Stripe Saved Payment Upgrade Plan

Status: Implemented and verified locally in Stripe test mode on 2026-09-09; production rollout remains pending
Scope: Implementation, local verification, and Stripe hosted-Checkout sandbox verification are complete. Production deployment is not included in this document.
Decision: Use one Stripe Customer per agent, let the agent explicitly save a payment method, and require confirmation for every optional one-time purchase. Keep automatic charging for subscriptions or separately authorized off-session charges only.

## 1. Goal

Improve repeat purchases in the agent portal so that:

- An agent can choose to save a card during the first Stripe Checkout.
- A returning agent can select the saved card without entering the card number again.
- Every optional one-time service still shows the product and final amount and requires an explicit Pay confirmation.
- Recurring products continue to use Stripe subscriptions.
- Agents can update or remove payment methods through the existing Stripe Customer Portal.
- Homix never stores card numbers, CVCs, or raw payment credentials.

## 2. What already exists

The existing commerce foundation should be extended, not replaced:

- `src/app/api/checkout/route.ts` already authenticates the agent, validates products, creates the local order, creates a Stripe Checkout Session, and stores returned Stripe IDs.
- `src/db/schema.ts` already stores Stripe Customer IDs on individual commerce orders.
- `src/app/api/stripe/webhook/route.ts` already verifies Stripe signatures, claims events atomically, reconciles Checkout and subscription events, and protects fulfillment from duplicate webhook delivery.
- `src/app/api/stripe/customer-portal/route.ts` already creates Customer Portal sessions, but currently discovers the Customer ID through the latest matching order.
- `src/app/pay/pay-client.tsx` already prevents repeated submits in one browser tab and redirects the user to hosted Stripe Checkout.
- `src/components/homix/billing-portal-button.tsx` already provides a reusable billing-management entry point.

## 3. Current problem

The current model treats the Stripe Customer ID as order data instead of account data:

```text
Agent A
  ├── Order 101 -> Stripe Customer cus_aaa
  ├── Order 102 -> no Stripe Customer
  └── Order 103 -> Stripe Customer cus_bbb
```

Checkout sends `customer_email`, not an existing `customer`. Stripe therefore cannot reliably associate a new Checkout Session with the agent's previously saved payment methods. The Customer Portal also depends on whichever order happens to be returned first.

Target model:

```text
Agent A -> stripe_customer_id: cus_aaa
  ├── Order 101 -> cus_aaa
  ├── Order 102 -> cus_aaa
  └── Order 103 -> cus_aaa

cus_aaa
  ├── saved payment methods
  ├── subscriptions
  └── invoices and payment history
```

## 4. Product rules

| Purchase type | Stripe mode | Saved-card behavior | Confirmation |
|---|---|---|---|
| Optional one-time service | `payment` | Agent may save and reuse a card | Required for every purchase |
| Membership or recurring service | `subscription` | Stripe saves the subscription payment method | Initial purchase required; renewals automatic |
| Future variable charge | Invoice or separately designed off-session flow | Only after explicit mandate/consent | Defined by the signed authorization |

This upgrade does not introduce blanket permission for Homix administrators to charge an agent's saved card.

## 5. Data model

Add an optional `stripe_customer_id` column to `portal.agents`:

```text
portal.agents.stripe_customer_id TEXT NULL
```

Add a partial unique index for non-null values. One Stripe Customer must not be assigned to two portal agents.

Keep `commerce_orders.stripe_customer_id`. It remains a historical snapshot that supports reconciliation and audit reporting. The account-level field becomes the source of truth for new Checkout and Customer Portal sessions.

Update both schema definitions used by this repository:

- Drizzle schema in `src/db/schema.ts`.
- Idempotent production schema bootstrap in `src/db/ensure-schema.ts`.

### Legacy backfill rule

For an agent without an account-level Stripe Customer ID:

1. Prefer the Customer ID attached to the agent's active or canceling subscription.
2. Otherwise use the Customer ID from the most recently paid Stripe order.
3. Otherwise leave the field null; create a Customer when the next Checkout starts.
4. If multiple active subscriptions point to different Customer IDs, do not guess. Report the agent for manual reconciliation and keep the current billing behavior until resolved.

The migration must never overwrite a non-null account-level Customer ID.

## 6. Server-side design

Create one small commerce helper responsible for resolving the canonical Customer. Keep Stripe-specific logic out of the page component.

Suggested responsibility:

```text
resolveStripeCustomer(agent)
  ├── agent already has stripe_customer_id
  │     └── return it
  ├── legacy order has an eligible customer ID
  │     ├── attach it to the agent if still null
  │     └── return it
  └── no customer exists
        ├── stripe.customers.create(..., idempotency key)
        ├── attach it to the agent if still null
        └── return the canonical stored ID
```

The Stripe Customer should include:

- Agent email and legal/display name.
- Metadata containing the portal agent ID and application identifier.
- A deterministic Stripe idempotency key derived from the agent ID so concurrent Checkout requests do not create multiple Customers.

After resolution, Checkout Session creation changes from `customer_email` to `customer`.

For both one-time and subscription Checkout Sessions, enable Stripe's optional saved-payment-method control:

```text
saved_payment_method_options.payment_method_save = enabled
saved_payment_method_options.payment_method_remove = enabled
```

This lets Stripe collect the agent's consent and mark eligible methods for display during later Checkout Sessions. Do not enable automatic off-session charging for optional services in this change.

### Checkout request flow

```text
Agent clicks Pay
      |
      v
POST /api/checkout
      |
      +--> authenticate and reload agent from DB
      +--> validate product and purchasing eligibility
      +--> create pending local order
      +--> resolve/create canonical Stripe Customer
      +--> create Checkout Session with customer=cus_xxx
      +--> save session/customer/payment IDs on order
      +--> return Stripe-hosted Checkout URL
                          |
                          v
              Agent selects saved card or adds a card
                          |
                          v
                    Agent confirms amount
                          |
                          v
                 Existing webhook fulfillment
```

### Failure and concurrency behavior

- Stripe Customer creation failure: mark the pending order failed and show the existing recoverable Checkout error.
- Two tabs start Checkout simultaneously: use the same deterministic Stripe idempotency key and a conditional database update so both requests converge on one Customer.
- Legacy webhook arrives after a new canonical Customer is stored: never overwrite the canonical value; log a mismatch for investigation.
- Checkout Session creation failure after Customer creation: retain the Customer binding and allow retry with the same Customer.
- Invalid or deleted Stripe Customer: return a clear billing-profile error and log the agent/customer IDs. Do not silently create another Customer until the mismatch is reviewed, because active subscriptions may belong to the original Customer.
- A saved card requires authentication: Stripe Checkout handles the interactive authentication; the user stays in the normal Checkout recovery path.
- Card declined or expired: Stripe Checkout lets the user select or enter another method.

## 7. Webhook hardening

Keep the current order settlement and event-claim design. Add only defensive synchronization:

- On `checkout.session.completed`, read `agentId` from trusted server-written metadata.
- If the agent has no `stripe_customer_id`, populate it from `session.customer`.
- If it matches the stored value, continue normally.
- If it conflicts with the stored value, do not overwrite it. Log a structured warning containing the event ID, agent ID, stored Customer ID, and received Customer ID.
- Do not treat Customer synchronization failure as permission to fulfill an unpaid order.

No new webhook event types are required for the core saved-card feature.

### Shared-account isolation

Homix may share its Stripe account with other applications, so every newly
created Customer, Product, Price, Checkout Session, PaymentIntent, Subscription,
and coupon carries `app=homixliving` metadata. The webhook accepts the six
supported event types only when that app marker is present. For objects created
before this marker existed, it accepts the event only when the Stripe object can
be matched to a local Homix order. Foreign and unsupported events return a 2xx
ignored response before the event is claimed or any billing state is changed.

## 8. Customer Portal update

Change `POST /api/stripe/customer-portal` to use `agents.stripe_customer_id` directly after authentication.

Temporary compatibility behavior during rollout:

1. Read the account-level Customer ID.
2. If missing, run the same legacy resolution logic used by Checkout.
3. Create the Customer Portal session with the resolved Customer.

Once production backfill is verified, the order-query fallback can be removed in a later cleanup.

Expose the existing `BillingPortalButton` on `/pay` near the secure billing message so agents can manage saved cards without returning to the dashboard. Keep the homepage entry point.

## 9. UI copy

Add concise bilingual copy controlled by the existing locale system:

- English: `Save your card securely with Stripe for faster future purchases.`
- Chinese: `可选择由 Stripe 安全保存付款方式，之后采购无需重新输入卡号。`
- Payment confirmation must continue to show the selected service and total price.
- Do not say that Homix stores the card.
- Do not imply that saving a card authorizes arbitrary future charges.

Stripe Checkout remains hosted, so this change should not add custom card inputs or increase the portal's PCI scope.

## 10. Expected files

Primary implementation should remain within these areas:

1. `src/db/schema.ts` — add the account-level Customer ID.
2. `src/db/ensure-schema.ts` — additive column, partial unique index, and safe legacy backfill.
3. `src/lib/commerce/stripe-customer.ts` — canonical Customer resolution and conflict rules.
4. `src/app/api/checkout/route.ts` — reuse Customer and enable saved payment methods.
5. `src/app/api/stripe/customer-portal/route.ts` — use the canonical account billing profile.
6. `src/app/api/stripe/webhook/route.ts` — defensive Customer synchronization and mismatch logging.
7. `src/app/pay/page.tsx` and/or `src/app/pay/pay-client.tsx` — pass billing-profile state and show clear saved-card copy.
8. Focused test files and `package.json` only if a new test command is required.

If implementation grows materially beyond these modules, stop and re-evaluate scope before adding abstractions.

## 11. Test plan

### Unit tests

Customer resolution:

- Returns the account-level Customer ID without calling Stripe.
- Adopts the Customer from an active subscription when the account field is null.
- Falls back to the latest paid order when no subscription Customer exists.
- Creates one Stripe Customer when no reusable Customer exists.
- Uses the deterministic idempotency key.
- Does not overwrite a value written by a concurrent request.
- Detects conflicting legacy active-subscription Customers.
- Rejects malformed Customer IDs rather than passing them to Stripe.

Checkout Session options:

- Sends `customer` and does not send `customer_email` when a canonical Customer exists.
- Enables saving and removing eligible payment methods.
- Preserves subscription metadata, discounts, promotion-code rules, automatic tax, success URL, and cancel URL.
- Preserves one-time product metadata and descriptions.
- Does not enable optional-service off-session charging.

Customer Portal:

- Uses the authenticated agent's Customer ID.
- Resolves a legacy Customer when the new field is null.
- Returns a clear error for a missing or invalid Stripe billing profile.
- Never accepts a Customer ID from request input.

Webhook synchronization:

- Backfills only a null account-level Customer ID.
- Leaves a matching value unchanged.
- Does not overwrite a conflicting value.
- Preserves duplicate-event protection and existing fulfillment behavior.

### Integration and end-to-end tests

```text
FIRST PURCHASE [E2E]
  New agent -> Checkout -> enter card -> opt in to save -> successful order

RETURN PURCHASE [E2E, critical acceptance path]
  Same agent -> Checkout -> saved card appears -> confirm -> successful order

DECLINE SAVE [E2E]
  Agent declines saving -> purchase succeeds -> card is not offered as saved later

SUBSCRIPTION [E2E]
  Start subscription -> Customer is bound -> Customer Portal opens -> subscription visible

FAILURE RECOVERY [integration]
  Stripe failure -> no fulfillment -> retry reuses canonical Customer

CONCURRENCY [integration]
  Two Checkout requests -> one canonical Stripe Customer -> two distinct orders/sessions
```

Use Stripe test mode and Stripe test cards only. Never run a test purchase against live mode.

### Required verification commands

Run in this order:

1. Focused commerce and Stripe-customer tests.
2. `npm test`.
3. `npx tsc --noEmit`.
4. `npm run lint`.
5. `npm run build`.
6. Stripe test-mode manual pass for first purchase, return purchase, card removal, card decline, and subscription management.

## 12. Deployment plan

Use an additive rollout:

### Phase 1: Schema

- Deploy the nullable account column and index.
- Run the deterministic legacy backfill.
- Produce a report of agents with zero, one, or multiple historical Stripe Customers.
- Manually review agents with conflicting active-subscription Customers.

### Phase 2: Read path

- Update Customer Portal and Checkout to resolve the account-level Customer.
- Keep the legacy order fallback enabled.
- Confirm existing subscriptions still open in Customer Portal.

### Phase 3: Saved-card option

- Enable Stripe's save/remove payment-method controls.
- Verify test-mode first and repeat purchases on desktop and mobile.
- Deploy and monitor Checkout Session creation failures and Customer mismatch logs.

### Phase 4: Cleanup

- After the production population is verified, remove the Customer Portal's direct latest-order lookup.
- Keep order-level Customer IDs permanently as transaction snapshots.

## 13. Monitoring

Track after deployment:

- Checkout Session creation success rate.
- Count of new Stripe Customers per agent; expected steady state is one.
- Customer-ID mismatch warnings.
- Repeat-purchase completion rate.
- Customer Portal error rate.
- Payment authentication and decline rates.
- Webhook failures and duplicate-event counts.

No card details or sensitive payment payloads may be written to application logs.

## 14. Rollback

The schema change is additive and should remain in place during rollback.

If repeat Checkout fails after deployment:

1. Revert Checkout Session creation to the previous `customer_email` behavior.
2. Leave `agents.stripe_customer_id` populated for a later corrected rollout.
3. Revert Customer Portal to its legacy order lookup if necessary.
4. Do not delete Stripe Customers or detach payment methods automatically.
5. Existing orders, subscriptions, invoices, and webhook processing remain intact.

## 15. Acceptance criteria

The change is complete only when all of the following are true:

- A test-mode agent can opt to save a card during Checkout.
- The same agent sees the eligible saved card on a later Checkout.
- A one-time service is never charged until the agent confirms that purchase.
- An agent who declines saving can still complete the current purchase.
- Customer Portal opens from both the dashboard and payment page.
- Existing active subscriptions remain visible and manageable.
- Concurrent Checkout requests cannot bind different Customers to one agent.
- Webhook retries do not duplicate fulfillment or rewards.
- No raw card data enters the Homix database, logs, or application forms.
- Mobile Checkout and the `/pay` return flow are usable at 375px width.
- Full tests, type checking, linting, build, and Stripe test-mode verification pass.

## 16. Not in scope

- Automatic administrator-initiated charges for optional services. This needs separate authorization language, dispute handling, and payment recovery design.
- A custom embedded card form. Hosted Stripe Checkout already solves card collection and authentication with lower compliance burden.
- Usage-based billing or metering.
- Migrating or merging historical Stripe Customers through the Stripe API. Conflicts will be reported for deliberate manual handling.
- Changing product prices, commissions, referral rewards, subscription terms, or fulfillment rules.
- Production deployment. Deployment starts only after implementation review and test-mode verification.

## 17. Recommended implementation order

Sequential implementation is preferred because the schema, Checkout, Customer Portal, and webhook all depend on the same canonical Customer rule:

```text
Schema + backfill
      -> Customer resolver + tests
      -> Checkout reuse + tests
      -> Customer Portal reuse + tests
      -> Webhook defense + tests
      -> Pay-page copy and billing link
      -> full verification
      -> staged deployment
```

This is intentionally one coherent change rather than separate parallel workstreams; splitting the shared billing identity logic across worktrees would increase merge and behavior-conflict risk.

## 18. Local implementation record

Implemented:

- Canonical account-level Stripe Customer with a partial unique index.
- Safe legacy backfill with active-subscription priority and conflict avoidance.
- Deterministic Customer creation and concurrency-safe account claiming.
- Checkout Customer reuse with Stripe-hosted save/remove controls.
- Customer Portal resolution through the authenticated agent account.
- Webhook backfill, mismatch detection, and non-blocking reconciliation logs.
- Shared-Stripe-account isolation with `app=homixliving` metadata and a
  foreign-event 2xx ignore path; legacy subscriptions remain compatible through
  local-order matching.
- Bilingual saved-card copy and billing-management entry on `/pay`.
- Read-only `npm run stripe:customers:audit` reporting command.
- Unit tests for Customer selection, validation, creation, Checkout options, and webhook synchronization.
- Checkout Session regression tests covering one-time and subscription metadata, discounts, promotion-code rules, automatic tax, saved-card controls, and return URLs.
- PostgreSQL integration tests for backfill priority, conflicts, non-overwrite behavior, and uniqueness.
- A safe `npm run stripe:test:configure` command that accepts only a CLI test
  key, creates/reuses app-tagged test products and prices, creates a dedicated
  Billing Portal configuration, and writes secrets only to gitignored
  `.env.local` without printing them.
- A repeatable `npm run stripe:test:smoke -- ...` hosted-Checkout verifier with
  ownership-checked cleanup of synthetic test data.

Local verification completed:

- `npm test` passed, including the new database integration suite.
- `npx tsc --noEmit` passed.
- `npm run lint` passed.
- `npm run build` passed with Next.js 16.2.3.
- A disposable PostgreSQL instance confirmed the real column and unique index are created.
- `npm run stripe:customers:audit` completed successfully against the disposable database.
- Stripe test mode is configured locally for Homix Group
  (`acct_1TDzEnGSMHTGWqFW`) with eight app-tagged Prices and a dedicated Billing
  Portal configuration.
- First purchase completed with optional card saving; Stripe attached exactly
  one saved card to the synthetic Customer.
- A second one-time Checkout for the same Customer visibly offered
  `Visa •••• 4242` and completed without re-entering card details.
- A monthly subscription reused the same card and appeared in Billing Portal
  with its invoice history and next billing date.
- Payment-method removal was verified by attaching and detaching a second
  synthetic test card (`before=2`, `after=1`).
- The decline test card left Checkout open/unpaid and displayed Stripe's
  recoverable decline message.
- A separate first purchase completed with the save option left off and left
  the Customer with zero saved cards.
- Stripe hosted Checkout rendered correctly at a 375×812 mobile viewport.
- All synthetic smoke Customers and their test subscriptions were deleted after
  verification.

### Stripe inventory and rollout gaps

- Test mode has no persistent webhook endpoint. Local/manual Checkout validation
  is complete, but webhook delivery in test mode should use `stripe listen`
  during future full-stack E2E runs.
- Live mode already has one dedicated endpoint at
  `https://agents.homixny.com/api/stripe/webhook`, enabled for exactly the six
  handled event types.
- Existing live Homix Products and Prices predate the new isolation marker: they
  have `homix_product_key`/`source=homixliving` but no `app` metadata. Do not
  retag them casually; new Checkout and Subscription metadata provides the
  primary isolation boundary, while local-order matching preserves legacy event
  handling.
- Production schema expansion, the read-only Customer conflict audit,
  application deployment, and post-deploy monitoring remain explicitly outside
  this local implementation.

### Production deploy and event-replay sequence

1. Back up the production database and deploy the additive
   `agents.stripe_customer_id` column plus partial unique index.
2. Run `npm run stripe:customers:audit` against production and stop if any
   active-subscription conflict is reported.
3. Confirm production uses its live `STRIPE_SECRET_KEY`, existing live Price
   IDs, dedicated live webhook signing secret, and Billing Portal configuration;
   never copy the local test key into Vercel production.
4. Deploy the application code. The existing live endpoint already has the
   minimal six-event subscription and does not need to be broadened.
5. Send a single controlled live Checkout, then verify the new Session and
   Subscription carry `app=homixliving`, the local order settles once, and the
   authenticated agent opens Billing Portal through the canonical Customer.
6. If an event needs replaying, resend only the specific Homix event after the
   new deployment is healthy; confirm the duplicate-event claim prevents double
   fulfillment.
7. Monitor Checkout errors, Customer mismatches, webhook failures, and Customer
   counts per agent before widening rollout.
