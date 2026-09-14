# Agent identity and display names

## Sources and consumers

| Field | Meaning | Consumers |
| --- | --- | --- |
| `portal.agents.legal_name` | Legal/licensed identity | New onboarding, Team Leader and buyer/seller agreement packages |
| `portal.agents.name` | Complete Preferred name | Portal, refreshed login session and newly generated poster branding |
| `public.agents.name` | Derived website label | Public directory and advisor page |
| `portal.agents.license_number` / `public.agents.license_number` | Licensed identity | Office verification and MLS linking |

The office has designated its MLS roster as the authority for legal names and
license numbers. This is an internal source-of-truth policy, not a claim that MLS
is a government agency. Preferred names remain an agent's chosen display name.

The website formatter keeps the legal name, appends the Preferred name in
parentheses, and removes an exactly repeated trailing surname from the
parentheses only. It handles compound surnames without guessing unrelated or
reversed names. Identical legal/preferred names appear once. Stored names and
poster names are not shortened by the website formatter.

## Editing and synchronization

- Initial pending onboarding collects both names explicitly. A Google profile
  name is a Preferred-name suggestion, never an implicit legal identity.
- My profile lets the agent edit the full Preferred name and preview the website
  label. A missing, unsigned legal name can be entered; established legal names
  and signed identities require office review.
- The administrator's editor shows Legal name, Preferred name / Portal value,
  current website value and expected website value. The website roster flags
  missing legal names and differences and offers an explicit synchronization retry.
- Website profile editing does not provide a competing name field. Profile
  saves, creation, approval and explicit linking send the derived website name.
- A website outage does not discard the canonical Portal save. The failure is
  reported and the administrator can retry. This is not an atomic cross-service
  transaction or a scheduled name-repair queue.
- Linked profile identity is resolved only by `portal_agent_id`, not a guessed
  name or a public contact email. This work does not merge accounts or create
  links automatically.

## Signed records

Server-side package creation binds owner recipient names and `agent_name` to
the stored Legal name, including packages with no owner signature role. Missing
legal identity blocks new preparation. Browser-supplied names cannot override it.
Existing request snapshots, signature evidence and historical PDFs are not
rewritten. A legacy signing-context fallback remains only to recognize old
snapshots; it is not used for new preparation.

Existing generated posters are immutable outputs. Regenerate to use a changed
Preferred name; this does not retroactively edit old images.

## Reviewed MLS correction

`scripts/reconcile-agent-names.ts` consumes a privately reviewed JSON plan and
defaults to a read-only dry-run. The CLI requires the configured BBO roster and
Supabase database, an explicit plan SHA256 and database fingerprint for apply,
and a new private receipt path.

The plan must be reviewed by exact existing MLS IDs, license numbers or verified
login email correspondence. Ambiguous/conflicting identities are excluded,
not matched by similar names. Full source names preserve middle names/initials
and compound surnames; explicitly recognized trailing designations are excluded.
Both missing and demonstrably incorrect legal identity values may be corrected.

Apply re-fetches source evidence, rejects changed rows and signed onboarding
references, locks target rows, and changes only names, licenses and update times.
Checksums protect every other agent column. Each change has a same-transaction
before/after/source audit entry; any failure rolls back the whole batch. A
replayed plan is rejected as stale. No account links, emails, statuses, financial
records or historical signing artifacts are migrated.

Keep roster exports, plans, receipts and before/after reports outside version
control (the ignored `tmp/` directory is one option). This repository is public.
After a successful apply, invalidate the website agent cache and verify actual
public names. Recovery requires a separately reviewed inverse plan based on the
current state; never blindly replay a backup over intervening edits.

## Regression checks

`npm test` includes name formatting, MLS identity matching, package API spoofing
and website/poster consumer tests. CI also runs real PostgreSQL name-edit and
onboarding integration tests plus guarded reconciliation tests in disposable
local databases. The latter cover dry-run, source mismatch, stale rows, signing
guards, atomic apply, protected fields, audit entries and replay rejection.
