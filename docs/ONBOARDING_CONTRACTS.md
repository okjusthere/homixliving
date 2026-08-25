# Onboarding contract handoff

`ONBOARDING_V2_ENFORCED` stays `0` until both legal-entity templates and both
payment smoke tests pass. A missing contract or template pin must not block the
existing approval flow during preparation.

## Team consent implemented in Portal

Team recruiting links and administrator invitations with a locked Team are
pre-approved routes. A direct applicant or a personally referred applicant who
selects a Team creates a `team_join_request` instead. The Team Leader must accept
that request before Portal binds the Team, freezes the current compensation
version, or permits eSign preparation. Declining returns the applicant to plan
selection and never changes Sponsor attribution.

The Portal decision is an operational approval record, not a substitute for a
legal agreement. Team Member affiliation and Team Leader responsibilities use
separate pinned templates. Each envelope has one agent/leader signer and an
optional company countersigner; a Team Leader is never silently added as a
recipient to a Team Member agreement.

## What the business must provide

Provide a final, broker/counsel-approved PDF for every legal entity that hires or
affiliates agents:

- Homix Realty Inc.
- Homix Living Inc., if it uses a separate affiliation agreement

For each entity that supports teams, also provide a separate Team Leader
agreement. The production matrix is therefore up to four immutable templates:

| Purpose | Homix Realty Inc. | Homix Living Inc. |
| --- | --- | --- |
| Agent affiliation / Team Member | Required | Required when Living onboards agents |
| Team Leader agreement | Required before team applications can recruit | Required before Living teams can recruit |

Prefer a native-text, non-password-protected PDF. The business owner must confirm
the agreement edition/effective date, governing entity, required company signer,
company signer name/title/email, and whether Solo and Team members use the same
legal form. Portal and eSign can place fields, but they cannot decide legal terms
or infer which company is bound by a document.

Do not upload a real agreement to development. Production templates and completed
records belong only in the approved production eSign environment.

## Template policy

Create a separate template for each legal entity, even when the current wording
is similar. Every template must use:

- business domain `HR`
- jurisdiction `NY`
- `approvalRequired=false`
- exactly one `signer` role for the agent
- zero or one `countersigner` role for the company
- no approver, viewer, or copy roles

The PDF must contain a required agent `signature` field and a required
`signed_date` field assigned to the agent role. Add a company signature and signed
date only when the approved agreement requires countersigning. Required
acknowledgements may use agent-owned checkbox or initials fields.

## Read-only Portal merge fields

Place each required merge key exactly once as a read-only field. Portal supplies
these values; the signer must not be able to alter them.

| Merge key | Source |
| --- | --- |
| `agent_id` | Portal agent ID |
| `agent_name` | Legal name, falling back to roster name |
| `agent_email` | Login/contact email |
| `agent_phone` | Onboarding profile |
| `license_number` | Onboarding profile |
| `licensed_company` | Canonical selected legal entity |
| `compensation_plan` | Locked Portal plan |
| `split_pct` | Company split for the locked plan |
| `sponsor_name` | Referring agent, when present |
| `affiliation_term_months` | Locked affiliation term |

Team-member templates also require:

| Merge key | Source |
| --- | --- |
| `team_name` | Selected team |
| `team_split_pct` | Frozen team split terms |
| `team_sourced_split_pct` | Frozen team-sourced split terms |
| `team_cap_usd` | Frozen team cap, or `No cap` |
| `team_terms_effective_from` | Accepted terms effective date |

Team Leader templates use the same recipient-role policy and require these
read-only merge fields exactly once:

| Merge key | Source |
| --- | --- |
| `agent_id` | Team Leader's Portal agent ID |
| `agent_name` | Legal name, falling back to roster name |
| `agent_email` | Login/contact email |
| `agent_phone` | Portal profile |
| `license_number` | Portal profile |
| `licensed_company` | Canonical contracting entity frozen on the Team Leader application |
| `compensation_plan` | `team_leader` |
| `team_name` | Admin-approved team name |
| `expected_member_count` | Submitted application |
| `team_positioning` | Submitted application |
| `team_split_pct` | Admin-published v1 standard Team Split |
| `team_sourced_split_pct` | Admin-published v1 team-sourced Split |
| `team_cap_usd` | Admin-published v1 cap, or `No cap` |
| `team_terms_effective_from` | v1 effective date |

If the legal PDF has different language or fields for Solo and Team plans, publish
separate legal templates and extend Portal's plan-to-template selection before
activation. Do not hide materially different terms with conditional merge values.

## Publish and pin

1. Upload the approved PDF to the matching production eSign workspace.
2. Add recipient roles and fields, then publish the immutable version.
3. Record the template ID, published version ID, and schema hash.
4. Configure the matching `ESIGN_ONBOARDING_HOMIX_REALTY_*` or
   `ESIGN_ONBOARDING_HOMIX_LIVING_*` variables in Vercel Production.
   Configure Team Leader pins separately under
   `ESIGN_TEAM_LEADER_HOMIX_REALTY_*` and
   `ESIGN_TEAM_LEADER_HOMIX_LIVING_*`.
5. Use a dedicated production `HR` application credential; never use the
   development smoke credential.
6. Run synthetic online-payment and administrator-verified offline-payment tests.
7. Review evidence, receipts, sponsor rewards, team split, and final activation.
8. Keep `ONBOARDING_V2_ENFORCED=0` until the business explicitly approves cutover.

Deploy the additive migrations in this order before deploying code that reads
the new lifecycle: `20260825-team-leader-workspace.sql`,
`20260825-team-join-approval.sql`, then
`20260825-team-leader-applications.sql`. Do not enable the enforcement flag as
part of a migration or deployment.

Any PDF edit creates a new template version and schema hash. Review and repin it;
never silently replace a published agreement under an existing pin.
