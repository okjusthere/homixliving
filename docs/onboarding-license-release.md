# License release and DOS verification

Scope: Portal intake data and administrator follow-up. No new eSign fields,
no document/template changes and no DOS automation.

## Flow

- Applicant setup requires the license number (prefilled when known) and one of
  `released`, `not_released`, `unknown`, `not_applicable`. The former brokerage is
  required unless not applicable; not applicable requires an explanation.
- Applicants who already submitted/signed may update their declaration separately
  on `/pending`. This does not alter the license, signing request or document hash.
- The administrator onboarding panel displays legal name, copyable license,
  target entity and declaration. Only an active administrator can confirm actual
  DOS affiliation. A submitted/pending DOS application is not confirmation.
- Confirmation binds legal name, license and company, plus the authenticated
  administrator ID and server timestamp. Identity/company changes invalidate it.
  Applicant declarations never substitute for this proof. An administrator may
  independently verify DOS even when the applicant's declaration is missing or
  outdated. Confirm/unconfirm actions are audited; retries preserve the verifier.
- Under the revised policy (2026-09-18), DOS proof is **not an activation gate**.
  A complete profile, agent signature and verified Stripe settlement activate a
  pending account automatically (applicable team approval/terms still apply).
  `not_released` or `unknown` declarations do not prevent this. Offline receipts,
  fee waivers and historical-staff recognition still need their existing admin
  verification, but do not require a DOS checkbox first.
- Missing/currently invalid DOS proof remains a task for pending **and active**
  non-admin accounts. Admins can confirm/unconfirm it after activation. This never
  changes account access, payment facts or signed documents. Independent admin
  accounts are excluded from license tasks. Company countersign remains separate.
- New verified Google emails can enter pending onboarding from ordinary login.
  Existing identities/aliases/legacy claims resolve before any new account is
  created. Signing in alone does not grant business access or publish a website
  profile. Never merge people merely because their Google display names match.
- Existing active accounts are not deactivated. Explicitly authorized historical
  backfills use `source: authorized_legacy_backfill`, a batch ID and authorization
  description, with `confirmedBy: null` (not an impersonated administrator).
  The admin UI labels this as historical confirmation, not a new live DOS lookup.
  This proof is valid only while the account is active and identity still matches;
  it is not valid proof for a pending/re-entering applicant. New manual confirmations
  continue to record the authenticated administrator ID and server timestamp.

## Rollout

Apply `db/migrations/20260916-onboarding-license-release.sql` **before** the new
application build. It adds two nullable JSONB columns only; it does not backfill
account status, signing or payments. The schema bootstrap includes both columns.
The 2026-09-18 policy update needs **no database migration or proof backfill**.
Rolling back to the 2026-09-16 build reinstates the old DOS activation gate; it
does not revoke accounts already activated. Do not drop populated records.

Payments already processed while the former gate was active are not replayed by
this code change. Administrators can approve those existing verified payments
without DOS confirmation and without collecting again; there is no bulk status
rewrite in this change.

No production statuses or DOS confirmations are changed by this feature's tests.

## Verification

`npm run test:onboarding-license` checks validation, identity binding, activation
without DOS and retained profile/signature/team restrictions.
`npm run test:onboarding-entry` also runs the isolated actual-auth-function
regression (mocked identity/database boundaries, not a live Google OAuth test).
`npm run test:onboarding-license:db` runs only against a local database named
`homix_onboarding_integration`, with an explicitly supplied `DATABASE_URL`.
It tests authorization, origin checks, declaration updates after signing,
confirmation auditing/retries/revocation, waiver and Stripe activation without
DOS, post-activation confirmation through the admin route, payment replay safety,
unchanged signing/access/payment facts, and existing-account preservation.
Existing onboarding administrator/completion/Stripe race suites also apply.

Local verification for the 2026-09-18 policy update: full `npm test`, TypeScript,
production build, license integration, administrator integration and all three
completion/activation/Stripe-race integration suites passed. The added regression
covers both $308 Solo and $3,670 Solo Pro settlement with a `not_released`
declaration and no DOS proof, followed by administrator-only DOS confirmation.
ESLint reports no errors (one pre-existing generated workflow-file warning).
Tests use an isolated local PostgreSQL database and synthetic provider inputs;
no real Google OAuth login, live payment, production account change or deployment
was performed as part of this verification.

Local verification on 2026-09-16: TypeScript, production build, full `npm test`,
new license unit/integration suite and existing onboarding admin/completion/
activation/Stripe-race integration suites passed. ESLint had no errors (one
existing generated workflow-file warning). Browser rendering and release option
switching were inspected with synthetic accounts; browser submission on isolated
loopback aliases was rejected because Next's development request URL normalizes
to `localhost`. Successful persistence/authorization was verified through the
route/database integration tests, not claimed as a complete browser E2E pass.
Temporary QA origin configuration and diagnostics were removed.

Production migration was applied on 2026-09-16 before rollout. Under explicit
user authorization, 50 existing active, non-admin accounts with complete legal
identity/license/company received a historical DOS confirmation. Seven incomplete
identities, four administrator accounts and one pending account were untouched.
The batch inserted 50 onboarding audit events. A transaction-level comparison
verified that no other agent fields changed except `updated_at`; signed documents,
payment facts and account status were preserved. Restricted local backups and
the exact reviewed target list are retained outside version control. This public
document deliberately contains no production identity list or private evidence.
Code deployment is verified separately after merge via CI and production smoke checks.
