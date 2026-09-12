# Onboarding contract handoff

## Daily onboarding operations

Administrators use `/admin/agents?view=onboarding` and the always-visible **Manage onboarding / 处理入职** action. The panel shows profile, agent signature, team consent, verified payment and Portal access separately, with contract PDFs and recipient-specific reminder actions. Company countersign tasks remain visible after account activation. The row filter labelled offline approval means a receipt has already been verified, not that an unpaid applicant is ready for approval.

- Online: profile → agent signature → Stripe payment → automatic activation.
- Offline: profile → agent signature → administrator verifies the receipt → administrator approves and activates.
- A disabled approval action explains the remaining requirements. Editing a pending person's account status cannot bypass onboarding. Approval rechecks the agent and settled order under a lock; repeated clicks cannot issue duplicate activation notifications.

The applicant's `/pending` page provides **Continue signing** and **Resend signing email**. Continue opens the existing agreement in another tab, retaining the onboarding page for payment. Resend preserves saved work but replaces older invitation links. An expired or terminated agreement uses the existing restart flow, retaining prior evidence and payment records. A finalization failure does not require another signature.

`ESIGN_PUBLIC_URL` is the allowed origin of returned signing URLs, normally `https://esign.kevv.ai`; it defaults to `ESIGN_API_URL` when omitted. The eSign release must provide the source-application recipient access and envelope document endpoints before the Portal release. Old envelopes retain their pinned template version when new templates are published.

Original contract PDFs are labelled as unsigned originals; completed PDFs come from verified evidence. An administrator can inspect and send reminders but cannot obtain another person's signing session. Signing requests, reminder requests and successful sends are audited without bearer URLs.

Regression commands: `npm run test:onboarding-workflow`, `npm run test:signing-access:db` (dedicated local database `homix_signing_access`), and `npm run test:agreement-recovery:db`. These tests never contact production signing or email services.

`ONBOARDING_V2_ENFORCED` is the production rollback switch. Keep it at `0`
while preparing templates or payment configuration, and set it to `1` only
after Homix approves the cutover and the production smoke suite passes.

## Team consent implemented in Portal

Team recruiting links and administrator invitations with a locked Team are
pre-approved routes. A direct applicant or a personally referred applicant who
selects a Team creates a `team_join_request` instead. The Team Leader must accept
that request before Portal binds the Team, freezes the current compensation
version, or permits eSign preparation. Declining returns the applicant to plan
selection and never changes Sponsor attribution.

The Portal decision is an operational approval record, not a substitute for a
legal agreement. Team Member affiliation and Team Leader responsibilities use
separate pinned templates. Each envelope has one agent/leader signer and exactly
one company countersigner; a Team Leader is never silently added as a recipient
to a Team Member agreement.

## Two masters and eight approved release artifacts

The business-supplied, previously reviewed enrollment packages are the legal
baseline. Homix approved the regenerated documents for production publication
on 2026-08-26. The Agent
master preserves the original Commission Agreement structure, Commission
Reporting Guideline, all 15 ICA sections, all 24 NDA sections, and their separate
execution points. It is not the earlier abbreviated rewrite. Living and Realty
share that complete 18-page Agent body. Entity name, address, version, and
countersigner are applied from `contracts/entities.yml`. The Realty Agent release
then appends the static official LIBOR Rev 10/25 application and the versioned
two-page Realty fee disclosure. The machine-readable source baseline and
paragraph fingerprints are stored in
`contracts/source/agent-affiliation-baseline.json`; generation fails if an
applicable source ICA or NDA paragraph is omitted.
The Team Leader master is a new approved internal agreement; it was not present
in the supplied enrollment packages. The canonical sources are:

- `contracts/source/Agent_Affiliation_Agreement.docx`
- `contracts/source/Team_Leader_Agreement.docx`
- `contracts/source/agent-affiliation-baseline.json`
- `contracts/appendices/LIBOR_REALTOR_Application_Rev_10-25.pdf`
- `contracts/appendices/Realty_LIBOR_OneKey_Fee_Disclosures_v1.md`
- `contracts/entities.yml`
- `contracts/field-manifests.yml`

Run `scripts/generate-realty-fee-disclosure.py` first, then run
`scripts/generate-onboarding-contracts.py --author-masters` to regenerate
the two masters, eight release DOCX files, eight PDFs, hashes, and the release
index. Agent releases are immutable by legal entity and plan; Team Leader
releases are immutable by legal entity:

- `output/pdf/Homix_Realty_Solo_Agent_Affiliation_Agreement_v4.2-candidate.pdf`
- `output/pdf/Homix_Realty_Solo_Pro_Agent_Affiliation_Agreement_v4.2-candidate.pdf`
- `output/pdf/Homix_Realty_Team_Member_Agent_Affiliation_Agreement_v4.2-candidate.pdf`
- `output/pdf/Homix_Living_Solo_Agent_Affiliation_Agreement_v4.2-candidate.pdf`
- `output/pdf/Homix_Living_Solo_Pro_Agent_Affiliation_Agreement_v4.2-candidate.pdf`
- `output/pdf/Homix_Living_Team_Member_Agent_Affiliation_Agreement_v4.2-candidate.pdf`
- `output/pdf/Homix_Realty_Team_Leader_Agreement_v2.2-candidate.pdf`
- `output/pdf/Homix_Living_Team_Leader_Agreement_v2.2-candidate.pdf`

The generator fails closed on wrong page counts, cross-entity names, a missing
legal address, Living LIBOR/OneKey/MLS language, interactive form fields,
annotations, JavaScript, or document actions. Generated PDFs are approved source
artifacts, not completed production signatures.

Each Agent agreement offers only Solo, Solo Pro, and Team Member. A
non-producing agent remains on Solo; non-producing is an operating status, not
a fourth compensation plan. No Holding plan is offered. Team Leader is a role
that requires completed Agent onboarding, Solo Pro, and a separate same-entity
Team Leader Agreement.

The production matrix is eleven immutable templates:

| Purpose | Homix Realty Inc. | Homix Living Inc. |
| --- | --- | --- |
| Solo Agent | New-LIBOR and existing-member releases | One release |
| Solo Pro Agent | New-LIBOR and existing-member releases | One release |
| Team Member Agent | New-LIBOR and existing-member releases | One release |
| Team Leader agreement | Approved and published | Approved and published |

Realty candidates must choose `apply_new` or `existing_member` before agreement
preparation. Existing LIBOR members use the release without the application
fields. New applicants use the release with the official application and
read-only Homix Realty office values. Living never contains LIBOR fields.

The confirmed company countersigner for both entities is Si Zhang, Broker,
using the shared signing mailbox `hr@homixny.com`. Countersigning is required
and remains a manual company compliance action. It no longer blocks the Agent's
payment or online Portal activation after the Agent has signed. Portal and eSign
may not auto-apply the company signature.

The business approval covers the compensation schedule, shared Agent and Team
Leader terms, Realty appendix, and current edition/effective date. A later PDF
edit requires a new review and immutable template version.

Do not upload a real agreement to development. Production templates and completed
records belong only in the approved production eSign environment.

## Company-first and Team boundary

The candidate chooses the licensed company before plan or Team and accepts the
LIBOR/OneKey disclosure. A Team recruiting link locks the company and does not
offer another company choice. Portal must enforce:

`Team Leader.companyId = Team.companyId = Team Member.companyId`

A company change is not an ordinary profile edit. It requires Team, plan,
template, MLS disclosure, payment, and signing-state revalidation. A legal Team
cannot span the two brokerages; shared branding requires separate entity Teams
under a non-legal internal group. The Team Leader must be Active, fully
onboarded with that company, and on Solo Pro before agreement preparation.

## Template policy

Create a separate template for each legal entity, even when the current wording
is similar. Every template must use:

- business domain `HR`
- jurisdiction `NY`
- `approvalRequired=false`
- exactly one `signer` role for the agent
- exactly one `countersigner` role for the company
- no approver, viewer, or copy roles

Do not validate a template by role or merge-key counts alone. Every field must
use the stable `fieldKey`, page, type, role, required flag, and fixed/read-only
value in `contracts/field-manifests.yml`. Portal rejects a published version
whose exact manifest does not match:

- Agent page 2: plan checkbox, Agent signature/date, company countersignature/date,
  and read-only plan.
- Agent page 3: reporting checkbox, Agent signature/date, and company
  countersignature/date.
- Agent page 4: ICA address and effective date.
- Agent page 12: ICA signature/date and company countersignature/date.
- Agent page 18: separate NDA signature/date and company countersignature/date.
- Realty Agent page 19: all required fields on the official LIBOR application,
  including application signature/date.
- Realty Agent page 21: fee acknowledgement/initials, Agent signature/date, and
  company countersignature/date. Page 20 is disclosure text and has no eSign field.
- Team Leader page 2: configuration checkbox/initials and read-only `solo_pro`.
- Team Leader page 7: execution acknowledgement, Team Leader signature/date,
  and company countersignature/date.

Living templates have 18 Agent pages and no Realty appendix fields. Realty
templates have 21 Agent pages. Both Team Leader templates have seven pages.
All signer and countersigner execution dates use the eSign `signed_date` field,
which fills the current date with one click. Missing any required signature,
date, acknowledgement, or required membership field blocks completion.

Production signing stays at `https://esign.kevv.ai`. Synthetic recipients may
only use `okjusthere@gmail.com`, `kertweller@gmail.com`,
`wellerkert@gmail.com`, and `eric.wei@homixny.com` until cutover.

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
| `compensation_plan` | `solo_pro` (fixed and read-only) |
| `team_name` | Admin-approved team name |
| `expected_member_count` | Submitted application |
| `team_positioning` | Submitted application |
| `team_split_pct` | Admin-published v1 standard Team Split |
| `team_sourced_split_pct` | Admin-published v1 team-sourced Split |
| `team_cap_usd` | Admin-published v1 cap, or `No cap` |
| `team_terms_effective_from` | v1 effective date |

Solo, Solo Pro, and Team Member always use separate immutable releases. Portal
selects the exact legal entity, plan, and (for Realty) LIBOR route before envelope
creation. Do not hide materially different terms with conditional merge values.

## Signing, payment, and activation milestones

The Agent signature and the company countersignature are separate milestones:

1. The candidate completes every required Agent field, acknowledgement,
   signature, and signed-date field. Portal records `agreement_agent_signed_at`
   and immediately permits the signed plan payment.
2. A verified Stripe webhook settles the online onboarding order, records the
   $20 license-transfer fee, accrues any Sponsor reward, and activates Portal
   access. The browser success URL never activates an account.
3. A verified offline payment remains `pending` after finance records it. An
   administrator reviews the receipt/reference and performs the only manual
   onboarding approval path.
4. `hr@homixny.com` countersigns as Si Zhang. When eSign seals the final PDF and
   evidence package, Portal records `agreement_countersigned_at` and
   `agreement_completed_at`. A bounded daily reconciliation recovers envelopes
   completed after the Agent already entered Portal.

An online Agent does not wait for company countersign to use Portal, but the
agreement remains legally incomplete until eSign reaches `COMPLETED`. Declined,
voided, expired, or failed envelopes cannot start a new payment.

## Publish and pin

Production status on 2026-09-10:

- all eight approved PDFs were regenerated with the HR signing mailbox and
  published as eleven new immutable production templates (six Realty Agent
  routes, three Living Agent plans, and two Team Leader releases)
- `npm run esign:verify-production` validates every live version, hash, page,
  role, and field against the Portal manifest
- Vercel Production has the dedicated HR application credential, all eleven
  new template pins, and `hr@homixny.com` for all four Agent and Team Leader
  countersigner routes
- `ONBOARDING_V2_ENFORCED=1` is deployed in Production following explicit Homix
  cutover approval; setting it back to `0` disables automatic online activation
  and restores the legacy administrator approval gate
- the production database stores `Si Zhang, Broker` with the shared HR signing
  mailbox for both licensed companies
- the rollback-only production smoke passes Solo, Team Member with the Team
  Leader as Sponsor, Team Member with a different Sponsor, default 10% Team
  Split with no Team Cap, and administrator-verified offline payment

The `esign.kevv.ai` production domain is healthy. Production acceptance proved
signer routing, countersigning, sealed-PDF finalization, and evidence retrieval.
The 2026-09-10 rollback-only smoke also passed online activation, offline pending
approval, Team Split, and Sponsor reward scenarios before Homix approved the
business cutover.

1. Upload the approved PDF to the matching production eSign workspace.
2. Add recipient roles and fields, then publish the immutable version.
3. Record the template ID, published version ID, and schema hash.
4. Configure the matching plan- and LIBOR-specific
   `ESIGN_ONBOARDING_HOMIX_REALTY_*` or
   `ESIGN_ONBOARDING_HOMIX_LIVING_*` variables in Vercel Production.
   Configure Team Leader pins separately under
   `ESIGN_TEAM_LEADER_HOMIX_REALTY_*` and
   `ESIGN_TEAM_LEADER_HOMIX_LIVING_*`.
5. Use a dedicated production `HR` application credential; never use the
   development smoke credential.
6. Run synthetic online-payment and administrator-verified offline-payment tests.
7. Review evidence, receipts, sponsor rewards, team split, and final activation.
8. Set `ONBOARDING_V2_ENFORCED=1` only after the business explicitly approves cutover.

Deploy the additive migrations in this order before deploying code that reads
the new lifecycle: `20260825-team-leader-applications.sql`,
`20260825-licensed-company-boundaries.sql`,
`20260825-team-join-approval.sql`,
`20260825-team-leader-workspace.sql`, then
`20260825-holding-to-solo.sql`. Apply
`20260903-countersigner-email.sql` before validating the HR countersigner route,
then `20260910-onboarding-auto-activation.sql` before deploying the split
signature/payment milestone code. Apply
`20260910-stripe-customer-billing.sql` before code reads the canonical Agent
Stripe Customer ID.
Assign a licensed company to every
legacy Team before enabling company-bound workflows. Treat the enforcement
flag as an explicit business cutover step and verify its value before rebuilding
Production.

The six required agreement smokes are Realty Solo, Living Solo, Realty Team
Member, Living Team Member, Realty Team Leader, and Living Team Leader. Run
online payment and administrator-verified offline payment where applicable.
Verify that SSN, full bank account details, and payment-card data never enter
merge fields, ordinary database columns, application logs, or evidence text.

Any PDF edit creates a new template version and schema hash. Review and repin it;
never silently replace a published agreement under an existing pin.
