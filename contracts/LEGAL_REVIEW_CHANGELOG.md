# Contract source crosswalk and legal-review notes

These artifacts are candidates for company counsel review. They are not
production eSign templates and must not be published until counsel approves the
two editable masters, the Realty appendix, and the four entity releases.

## Supplied source packages

| Source | Pages | SHA-256 |
| --- | ---: | --- |
| `Agent enrolls package (8).pdf` (Realty) | 22 | `5d640cbf6c30df8ac4c371533ae6b3dece0046521659f8e5a7f95685cc2cab33` |
| `Agent Enrolls Package (9).pdf` (Living) | 20 | `7e8713490ebf5cb916dbc94af91184b5420e2e8df7c3c81ec80b2f321b64c39d` |

The Living source copied several Realty-only facts, including the Realty office
address, LIBOR duties, OneKey costs, Realty work-product references, and Realty
transaction language. Those references were not treated as intentional Living
terms. The complete common legal structure was extracted into one Agent master,
then company facts and the Realty-only appendix were applied during generation.

A normalized token comparison of the numbered bodies found 99.81% similarity
between the two ICA copies and 98.68% similarity between the two NDA copies.
The remaining mechanical differences are PDF word splitting, entity names,
addresses, and minor extraction artifacts; no Living-only numbered ICA or NDA
section was identified. The Realty copy is therefore the mechanically extracted
baseline for shared clauses, while both supplied package hashes remain recorded
above for legal review.

## Retained structure

| Original component | Candidate treatment |
| --- | --- |
| Commission Agreement | Retained as a separately acknowledged part and updated to Solo, Solo Pro, and Team Member. |
| Commission Reporting Guideline | Retained and expanded to reflect Portal transaction files, frozen facts, and auditable ledgers. |
| ICA Sections I-XV | All sections retained in the common Agent master; entity, company boundary, Team, Sponsor, and Portal language updated. |
| ICA execution | Retained as a separate Agent and company countersignature point. |
| NDA Sections I-XXIV | All numbered sections retained, including non-circumvention, non-solicitation, remedies, and the liquidated-damages business term for counsel review. |
| NDA execution | Retained as a separate Agent and company countersignature point. |
| LIBOR application and disclosure | Realty-only appendices: the static official LIBOR Rev 10/25 application plus a versioned two-page Company fee disclosure. The application page is verified byte-for-byte at the PDF content-stream level during generation. |

## Removed or replaced material

| Original material | Reason and replacement |
| --- | --- |
| Plan B / 92-8 / $1,588 | Superseded by the approved three-plan structure. |
| Standalone Holding plan | Non-producing status is handled under Solo; no fourth plan is offered. |
| Old Rental-only split | Replaced by the selected frozen plan and transaction calculation order. |
| Credit-card authorization, card number, CVV, and card copy | Removed. Payment uses secure checkout or administrator-verified offline evidence. |
| Social Security Number contract field | Removed from PDF, merge fields, and ordinary Portal records. |
| Agent merchandise receipt | Removed from legal onboarding; commerce remains a separate operational workflow. |
| Living LIBOR/OneKey pages and Realty references | Removed because Homix Living Inc. does not require the Realty membership workflow. |
| Stale third-party fee representations | Reframed as operational guidance: current association/MLS invoices and rules control, payment-card data stays outside the contract, and any verified Company advance is recorded in Portal before a commission offset. |

## Fidelity controls

- `contracts/source/agent-affiliation-baseline.json` records the supplied source
  package hash and the complete common legal paragraph baseline.
- Every generated Agent agreement is checked for the opening and closing
  fingerprints of each applicable ICA and NDA paragraph. Missing source language
  stops generation.
- Entity substitution and the redlines listed above are the only intended changes;
  the Living release removes Realty-only membership content rather than replacing
  the common ICA or NDA body.
- Final PDFs are static and may not contain AcroForm fields, annotations,
  JavaScript, or document actions.
- Converter timestamps are removed during finalization, so identical source files
  regenerate to identical PDF hashes suitable for immutable eSign version pins.

## Explicit counsel decisions required

1. Approve, narrow, or remove NDA Section V's five-year non-circumvention term.
2. Approve, narrow, or remove NDA Section XIX's three-year non-solicitation term.
3. Approve, revise, or remove NDA Section XX's `$100,000` / `$10,000` liquidated-damages language.
4. Confirm the ICA's work-product ownership scope, E&O allocation, indemnity, fee offset, and post-termination transaction treatment.
5. Confirm the three-plan economics, cap rules, Sponsor Reward description, Team Split order, and Solo Pro transaction-fee thresholds.
6. Approve the new Team Leader Agreement, including Team compensation versioning, data access, suspension, dissolution, and successor provisions.
7. Confirm Realty's then-current LIBOR/OneKey application, fees, training, consent, and member-data requirements before every publication.

Any counsel-approved wording change requires a new immutable candidate version,
updated page-aware field manifest, regenerated hashes, Portal template pins, and
all six onboarding smoke tests before `ONBOARDING_V2_ENFORCED=1`.
