# Onboarding contract handoff

`ONBOARDING_V2_ENFORCED` stays `0` until all four entity-specific templates,
both payment paths, and all six onboarding scenarios pass. A missing contract
or template pin must not block the existing approval flow during preparation.

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

## Two masters and four release candidates

The business-supplied, previously reviewed enrollment packages were used as
legal source material, but these new documents remain **legal-review candidates**.
Counsel must approve the two editable masters and the Realty appendix before any
production publication. The canonical sources are:

- `contracts/source/Agent_Affiliation_Agreement.docx`
- `contracts/source/Team_Leader_Agreement.docx`
- `contracts/entities.yml`
- `contracts/field-manifests.yml`

Run `scripts/generate-onboarding-contracts.py --author-masters` to regenerate
the two masters, four entity DOCX files, four PDFs, hashes, and the release
index. The generated release candidates are:

- `output/pdf/Homix_Realty_Agent_Affiliation_Agreement_v4.0-candidate.pdf`
- `output/pdf/Homix_Living_Agent_Affiliation_Agreement_v4.0-candidate.pdf`
- `output/pdf/Homix_Realty_Team_Leader_Agreement_v2.0-candidate.pdf`
- `output/pdf/Homix_Living_Team_Leader_Agreement_v2.0-candidate.pdf`

The generator fails closed on wrong page counts, cross-entity names, a missing
legal address, Living LIBOR/OneKey/MLS language, interactive form fields,
annotations, JavaScript, or document actions. Generated PDFs are release
candidates, not checked-in production signatures.

Each Agent agreement offers only Solo, Solo Pro, and Team Member. A
non-producing agent remains on Solo; non-producing is an operating status, not
a fourth compensation plan. Legacy Holding is normalized to Solo. Team Leader
is a role that requires completed Agent onboarding, Solo Pro, and a separate
same-entity Team Leader Agreement.

The production matrix is four immutable templates:

| Purpose | Homix Realty Inc. | Homix Living Inc. |
| --- | --- | --- |
| Agent affiliation / Team Member | Candidate generated; final company review required | Candidate generated; final company review required |
| Team Leader agreement | Candidate generated; final company review required | Candidate generated; final company review required |

The confirmed company countersigner for both entities is Si Zhang, Broker,
`sunnyz@homixny.com`. Countersigning is required and occurs manually after the
administrator's compliance approval. Portal and eSign may not auto-apply the
company signature.

Before production publication, Si Zhang or company counsel must approve the new
compensation schedule, Team Leader terms, edition/effective date, and the
continued use of the retained legal pages. Portal and eSign can place fields,
but they cannot provide that legal approval.

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

- Agent page 2: plan checkbox, plan signature/date, read-only plan.
- Agent page 5: ICA signature/date and company countersignature/date.
- Agent page 7: separate NDA signature/date.
- Realty Agent page 8: LIBOR acknowledgement, required membership details,
  initials, signature, and date.
- Team Leader page 2: configuration checkbox/initials and read-only `solo_pro`.
- Team Leader page 4: Team Leader signature/date and company
  countersignature/date.

Living templates have seven Agent pages and no Realty appendix fields. Realty
templates have eight Agent pages. Both Team Leader templates have four pages.
Missing any required signature or acknowledgement blocks completion.

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
`20260825-team-join-approval.sql`, `20260825-team-leader-applications.sql`,
`20260825-holding-to-solo.sql`, then
`20260825-licensed-company-boundaries.sql`. Assign a licensed company to every
legacy Team before enabling company-bound workflows. Do not enable the
enforcement flag as part of a migration or deployment.

The six required agreement smokes are Realty Solo, Living Solo, Realty Team
Member, Living Team Member, Realty Team Leader, and Living Team Leader. Run
online payment and administrator-verified offline payment where applicable.
Verify that SSN, full bank account details, and payment-card data never enter
merge fields, ordinary database columns, application logs, or evidence text.

Any PDF edit creates a new template version and schema hash. Review and repin it;
never silently replace a published agreement under an existing pin.
