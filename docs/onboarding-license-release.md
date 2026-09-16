# License release and DOS verification

Scope: Portal intake data and activation eligibility only. No new eSign fields,
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
- Pending accounts cannot activate without current DOS proof (Stripe, manual
  approval, waiver, existing-staff recognition). Signing and payment remain allowed.
  If Stripe was paid first, use the same paid order after DOS confirmation; do not
  create another receipt or charge. Company countersign remains a separate task.
- Existing active accounts are not deactivated or assigned fabricated confirmation.

## Rollout

Apply `db/migrations/20260916-onboarding-license-release.sql` **before** the new
application build. It adds two nullable JSONB columns only; it does not backfill
account status, signing or payments. The schema bootstrap includes both columns.
The previous application can run with the extra columns, but rolling it back also
removes the new DOS activation gate. Do not drop populated records during rollback.

No production statuses or DOS confirmations are changed by this feature's tests.

## Verification

`npm run test:onboarding-license` checks validation, identity binding and gates.
`npm run test:onboarding-license:db` runs only against a local database named
`homix_onboarding_integration`, with an explicitly supplied `DATABASE_URL`.
It tests authorization, origin checks, declaration updates after signing,
confirmation auditing/retries/revocation, waiver/recognition gates, paid Stripe
approval without duplicate collection, and existing-account preservation.
Existing onboarding administrator/completion/Stripe race suites also apply.

Local verification on 2026-09-16: TypeScript, production build, full `npm test`,
new license unit/integration suite and existing onboarding admin/completion/
activation/Stripe-race integration suites passed. ESLint had no errors (one
existing generated workflow-file warning). Browser rendering and release option
switching were inspected with synthetic accounts; browser submission on isolated
loopback aliases was rejected because Next's development request URL normalizes
to `localhost`. Successful persistence/authorization was verified through the
route/database integration tests, not claimed as a complete browser E2E pass.
Temporary QA origin configuration and diagnostics were removed. Production
migration and deployment have not been performed by this change.
