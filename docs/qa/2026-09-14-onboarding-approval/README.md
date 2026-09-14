# Onboarding approval simplification

## Administrator flow

Use **Confirm fee & activate** for an ordinary pending applicant whose profile,
agent contract requirement and applicable team terms are ready. Choose either
an actual receipt (new or already recorded) or an approved full/partial waiver.
The server performs settlement and activation in one transaction, with stable
retry keys. Recording a receipt alone remains available before signing and for
amounts that need financial reconciliation; it does not activate an account.

Unresolved initial Stripe checkouts block a second manual payment/waiver. The
server reserves checkout creation under the same account locks as approval,
checks Stripe closure with bounded read-only requests, and fails closed when
creation or payment is unknown. A late real payment is retained for finance
review without replacing a waiver or awarding a duplicate referral reward.
The admin sees a persistent reconciliation task and an in-app notification;
no automatic expiration or refund is performed. A one-term waiver does not
waive subsequent legitimate renewal cycles.

A fee waiver is stored separately in `portal.agents.onboarding_fee_adjustment`.
It is bound to the company, plan, term and original quoted amount. A full waiver
sets `payment_status=not_required`; it creates no receipt, paid order or sponsor
reward. Partial-waiver rewards use only actual eligible money received. Waivers
do not imply that anyone signed a contract.

Active access and outstanding work are separate. Company countersignature,
unmatched receipts and exceptional access records can still need follow-up after
activation. Failed website publication is retained in
`portal.agents.onboarding_website_sync` and appears as a retryable task. Replaying
a completed approval must not republish a profile that was subsequently hidden.

## Signing data

New signing preparations use saved server-side identity and routing facts,
including pending and manually entered profiles. Portal ID is system supplied;
legal identity/business fields remain read-only. Solo has no mandatory sponsor
or team. The LIBOR legal-name field uses the same legal-name merge value; known
cell phone is prefilled, while missing cell phone remains editable and required.
Home phone, secondary practice, prior board name and existing NRDS number are
optional when not applicable. Existing LIBOR members do not receive the new
membership input fields. Missing residence and full date-of-birth data are not
inferred from unrelated profile data.

Template changes are published as new package versions. Existing signing
requests, signatures and completed files are not rewritten.

The native sequential signing engine automatically invites the configured
company signer after the owner finishes. Read-only production evidence confirmed
the initial company email and link view preceded a later manual reminder. The
Portal therefore labels manual reminders explicitly; a reminder command's
success is not represented as proof of inbox delivery. No native-engine patch
or periodic reminder campaign was needed.

## Verification

- TypeScript, ESLint and production build.
- Full `npm test`, including name/identity, workflow, fee, field geometry and
  UI money/reference/date regression tests.
- Dedicated local PostgreSQL integration: full and partial waivers, no fake
  revenue/rewards, transaction rollback, RBAC, agent/receipt ownership, contract
  and team gates, receipt reuse, concurrency and idempotency.
- Website failure/retry integration with mocked network and a local database.
- Stripe creation/approval races, unknown creation outcomes, expired-session
  verification, late payments, repeated events and later legitimate renewals,
  using synthetic records and mocked Stripe only.
- Real browser execution against a local production build: an isolated synthetic
  applicant was activated through full waiver, without creating a receipt/order.
- Production correction of an explicitly authorized test-payment case was
  backed up privately, transactionally applied and rechecked. Real signatures
  and active access were preserved. No production applicant was used for QA.

Production credentials, signing links, personal data, backup rows and detailed
delivery evidence stay in ignored local artifacts, never in this public repo.
