# Poster facts and signatures

## Findings

- The website BBO provider maps `lotSizeSquareFeet` to `lotSqft`, but Portal's listing contract, importer, input validation and poster facts omitted lot area. Added `lotArea` (square feet) through personal and office flows, including company Open House snapshots and their material-data fingerprint.
- The website cost mapper accepts explicit annual tax fields. The current BBO `api/listing_dto.go` summary/detail response and `properties_core` schema do not expose annual tax. Fixing a prompt cannot recover that data. BBO needs source-field ingestion, historical backfill and API output before website/Portal can automatically show it. Missing taxes remain absent, not zero; existing manual and reviewed-source tax entry remains available.
- Read-only production spot check: 45-23 Utopia Parkway returned interior 1,700 sq ft, lot 3,000 sq ft and no annual tax. Two condo/co-op samples returned neither lot area nor annual tax. No values were inferred.
- The Chinese prompt explicitly translated professional titles and included brokerage in the personal signature; both behaviors are removed. Original English titles are preserved, and the signature has only name/title/phone/email. Official logo and company footer remain.

## Generation policy

Company Open House automatic copy chooses 2–4 source-supported features, never more than five, and fewer when facts are insufficient. Structured price, beds/baths, interior area, lot area and verified costs are mandatory when supplied, separate from optional feature count. No duplicate facts, inferred dimensions, invented financial amounts or unknown-tax-as-zero claims.

This changes newly built generation prompts. Existing artwork and already-submitted generation snapshots are not rewritten. Actual image output remains model-generated and must be reviewed; these checks verify payloads and instructions, not guaranteed pixel-level fidelity.

## Validation

- 54 content tests passed, including MLS lot area through input validation into image-model facts, distinct interior/lot areas, missing tax omission, flexible highlight instructions, and exact English titles/four-field signatures in both languages.
- TypeScript and targeted ESLint passed.
- No paid image generation was submitted during verification.
