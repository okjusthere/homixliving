# Portal agreement recovery and reconciliation

Date: 2026-09-11

## Fixed behavior

- Pending applicants can explicitly replace declined, voided or expired onboarding agreements. Team Leader applicants have the same recovery action, subject to the existing ownership, approval, company and plan checks.
- Each replacement archives the old envelope, template and signing metadata in `onboarding_events`. A stable attempt identity and expiry recover lost create/send responses without creating duplicate agreements.
- Paid fees, sponsor attribution and accepted team routing remain attached to the applicant. Old signatures are cleared for the replacement; team terms must be accepted again through the new agreement.
- Expired but still-open eSign envelopes are voided before replacement. Completed contracts and finalization failures cannot be replaced by this action; a finalization failure retains signatures for document recovery.
- Synchronization checks the envelope identity and row version before writing, so a delayed response from a previous agreement cannot overwrite the replacement.
- The cron processes ordered pages of 25 with five concurrent requests and a persistent cursor. It finishes the current cycle within its time budget or resumes from the saved position next run. Individual failures do not block later pages, and new arrivals do not extend an existing cycle indefinitely. The existing daily schedule remains unchanged.

No database migration or additional production secret is required.

## Verification

| Check | Result |
| --- | --- |
| Full `npm test` | Passed |
| TypeScript typecheck | Passed |
| Full ESLint | No errors; one warning in generated workflow output |
| Default `npm run build` (Turbopack) | Passed |
| `npm run test:agreement-recovery:db` against isolated PostgreSQL | Passed |
| Four concurrent restart requests per terminal state | One replacement per attempt |
| Lost create response / lost send response | Existing remote agreement recovered; no duplicate |
| Old unchanged / completed synchronization response | Cannot replace the current envelope or its status |
| Team approval, sponsor attribution and Team Leader ownership | Preserved and enforced |
| 103 original agreements plus one later arrival | All 104 visited; tail completion reconciled despite an error on the first record |
| Concurrent page claims and cursor wraparound | Disjoint pages within the cycle; failed records retried next cycle |
| Local production Portal UI + real native eSign API | Replacement button created and sent a new agreement |

The database test replaces only the authentication identity source through an explicit test loader. It runs the real route handlers, guards, transactions and synchronization logic. Its eSign double rejects every outbound origin except the synthetic test origin. CI provisions a separate empty database for this test after seeding the schema.

The browser smoke used a synthetic pending account, simulated paid status, local storage and a local email outbox. The previous envelope `1e6e8848-042e-4c99-9921-175e53115ecc` remained `VOIDED`; clicking the recovery action created `4060f875-8540-4345-a513-0d256d8ec5d5` in `SENT`. The paid flag was retained, the old signature timestamp was cleared and both attempt events remained available. The page then showed the new agreement as sent.

This verifies Portal recovery with the actual native eSign service. It does not claim a new production contract was signed, a production email was sent, or a real payment was charged. The earlier eSign signing/PDF checks are separate from this Portal recovery smoke.
