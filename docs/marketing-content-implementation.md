# Marketing and content center

Status: production email integration and private image storage are operational. The latest release adds separate Chinese/English images and reviewed AI selling-point extraction. Deployment and visual acceptance are recorded below.

## User workflow

- /marketing/email uses the existing service at https://marketing.homixny.com: MLS lookup, drafts, nearby Agent audiences, copy suggestions, preview, self-test eligibility, explicit publish/scheduling, statistics and campaign controls.
- /content supports Coming Soon, Just Listed, Open House, Under Contract, Offer Accepted and Just Sold; US and China holidays; saved Agent portraits; MLS/manual facts and photos; artwork previews and downloads.
- Output defaults to **two separate images**, one Simplified Chinese and one English. Either language can also be selected alone. Historical bilingual images remain visible as legacy items.
- Just Listed and Open House use a dedicated property-information panel. Annual property tax, monthly maintenance and HOA amounts retain explicit billing periods. Missing data is omitted, never inferred to be zero. Coming Soon is a short preview; other listing status and holiday posters remain brief.
- A text AI first identifies distinctive selling points from the original listing description, separately extracts explicit cost facts, and returns English/Chinese versions with exact source excerpts. This is feature selection rather than paragraph compression. Numeric and evidence checks reject unsupported output.
- Agents select up to four selling points, edit both versions, then confirm. Source-field changes clear the prior extraction and approval. Detailed posters with a description require this review before generation.
- The image prompt receives only approved localized points and financial facts, rather than raw MLS remarks. It requests separate non-overlapping text, photo and signature panels, exact supplied property photos and faithful portrait identity. Generated artwork still needs human visual review.
- /content/admin/templates manages versioned style prompts, publication, holidays/dates, quotas and uncertain-result review. The initial catalog has 28 templates, 31 holidays and 62 dates for 2026–2027.

## Architecture and production resources

| Resource | Configuration |
|---|---|
| Portal | https://agents.homixny.com, Vercel project homixliving |
| Existing Email Service | https://marketing.homixny.com |
| Text extraction | Existing Azure OpenAI provider, deployment gpt-5.6-terra |
| Image generation | Azure gpt-image-2, https://kevvrealtime-resource.services.ai.azure.com/openai/v1 |
| Private artwork bucket | homixliving-content; public access disabled |
| Recovery | Cloudflare Worker homixliving-content-recovery, every five minutes |
| Email apps | ca-homix-mkt-dev-web and ca-homix-mkt-dev-worker |

The content-specific Cloudflare token grants Object Read & Write only to homixliving-content. Its key pair is stored as Vercel Production Secrets R2_CONTENT_ACCESS_KEY_ID / R2_CONTENT_SECRET_ACCESS_KEY. A partial pair fails closed. Existing deal-document credentials are preserved. No secret values belong in this document or source control.

Portal /api/content/highlights authenticates the active Agent, checks request origin, validates listing input and calls Azure Responses directly with AZURE_TEXT_ENDPOINT, AZURE_TEXT_DEPLOYMENT and the sensitive AZURE_TEXT_API_KEY. It atomically reserves at most 20 attempts per Agent per rolling hour in content_audit. It does not depend on Email Service identity, company configuration or availability. Every integration endpoint retains request-bound HMAC, 90-second expiry, Agent identity and permission checks. Only the user-approved project path is excluded from Azure EasyAuth; the rest of the service keeps its original authentication.

Email campaigns preserve the MLS listing Agent and use a separate immutable Portal marketing identity. Brokerage supplies From display name; the verified sender address stays unchanged; the current Portal Agent supplies Reply-To and signature. Suppression, unsubscribe, pacing, allowlists, version checks and uncertain-delivery handling remain enforced.

Image jobs freeze input, brand, template and provider configuration. A two-image submission reserves two quota slots atomically and uses one batch ID; its English image waits until the Chinese image reaches a terminal state. Duplicate submissions are idempotent. The default limit is 10 image outputs per Agent per day with one active batch. Recovery dispatch uses an atomic claim; ambiguous provider outcomes require review and do not trigger an automatic paid retry.

Private assets enforce Agent ownership and use expiring downloads. References are restricted by HTTPS origin, validated, normalized and stored privately. Azure image sizes are 1024x1024, 1024x1280 and 1152x2048 with one high-quality PNG per request.

## Database and rollout

Applied Portal migrations:
- 20260910-content-center.sql: content tables, indexes and RLS.
- 20260911-content-language-pairs.sql: additive batch/predecessor columns and indexes.

Applied Email migration: 20260910180000_homix_portal_integration. AI extraction and fee mapping need no further Email schema migration.

Admin Homix (Agent 1158) was assigned Homix Realty Inc. through a guarded, audited backfill, as explicitly selected by the user. Role, team and lifecycle data were preserved.

Recovery Worker version: 095da6b0-07ff-4767-a458-9f1d77a99d87. It has no public HTTP handler and uses a dedicated recovery secret; the signed recovery endpoint returned 200.

Both Email apps must run the same immutable image. Infrastructure workflows must preserve USE_HOMIX_PORTAL_INTEGRATION=true, the signing secret reference and company map. Before rollback, stop new image dispatch; preserve artwork, additive schema and audit records. Never use a production email publish request as a health check.

## Verification

- Portal domain/provider/storage/prompt tests: 8 passed; TypeScript and scoped lint passed.
- Local PostgreSQL checks passed for migrations, ownership, RLS, publication uniqueness, provider claims and atomic/idempotent language-pair submission, quota and sequential dispatch.
- Email unit tests: 78 passed across 15 files; API regression: 9 passed. TypeScript and production build passed.
- Earlier Email PostgreSQL integration: 45 passed; concurrent Portal account provisioning and disabled-user checks: 2 passed.
- Production email acceptance: MLS search, draft/save, company sender/Agent signature preview and nearby audience calculation passed for 555 Flushing Avenue Unit 7L (KEY425702536): 119 eligible recipients, zero suppressed. **Zero real emails sent.** Self-test/publish remain subject to the existing allowlist.
- Production private storage: saved portrait import, MLS photo import, generated image storage, authenticated preview and PNG download passed.
- Production pre-revision image job c1810ac1-eb88-4b6e-9f58-9a59a0662031 succeeded (Azure request 59015403-f7f8-4420-a9ec-fd98a23e19fa). Its visual issues prompted the separate-language, reference-fidelity and layout changes; it is not evidence of final visual acceptance.
- The acceptance account's saved portrait is an older recruitment poster containing a cartoon mascot. The app preserves the chosen saved asset; real marketing should use the Agent's intended headshot.

## Current deployment and final acceptance

Portal deployment: dpl_FknPyQSYkPwHkEzbFt9uBBwG9SjP, https://homixliving-658grlb6h-erics-projects-9449aac9.vercel.app, aliased to https://agents.homixny.com. Production build passed with 9 Workflow steps and 1 workflow. This includes explicit approved-copy boundaries, Chinese professional-title mapping and a source-revision check that discards extraction responses if the listing changed while the request was pending.

Email release: ACR cjh succeeded; both apps use sha256:7417eb2091164725ac2518f3bd85cc7152c167c0547beb69883a786e8663ca7d. New revisions: web --0000021, worker --0000019. Health endpoint returned 200. Immediate prior image: sha256:ceb4c27271a8c45f15bddb7119c6a587a71efe958319e1418d3c32a753236ba5.

Real signed UI extraction succeeded on the MLS description. Selected reviewed points: newly renovated condition, huge private deck and laundry room. Cost facts: property tax as low as $8,000/year and management fee $375/month. The source's ambiguous P kitchen item was deselected during review. The model also proposed an unselected deposit item with an imprecise Chinese translation; review remains necessary for semantic meaning beyond source/number matching.

A Chinese/English pair was submitted at 2026-09-11T01:58:16Z. Chinese job 09b6beec-bdb0-4151-819d-77165ba2173d started while English job f24fa5ea-20f4-4237-bc60-861b3a71fbbe remained queued. Both jobs completed successfully and previews were exported from the authenticated UI. The selected selling points, costs and periods were present in both separate-language images. The first Chinese image added an unapproved move-in claim and retained an English professional title; a stricter approved-copy boundary and explicit Chinese title mapping were subsequently deployed and verified. The English image had accurate copy; its portrait frame partly crossed the photo edge, so generation still needs visual review.

## Exclusions

No automatic social publishing, bulk holiday scheduling, layered graphics editor or billing changes. Existing docs/audits/ content is outside this feature.


Final Chinese visual acceptance: job 8d0f1fd4-1c52-456d-98de-43e2d8f6a648 completed at 2026-09-11T02:09:59Z, Azure request 60b6c610-d6be-4161-9958-9f980158ca49. Authenticated preview and page-asset export passed. The inspected image has a separate headline/photo/facts/signature layout, the three approved selling points, annual tax with its “as low as” qualifier, monthly management fee, and a Chinese professional title. It does not include the earlier unapproved move-in tagline. The original single property photo is recognizable without invented additional rooms. English job f24fa5ea-20f4-4237-bc60-861b3a71fbbe completed with Azure request 8be09421-4758-4360-b226-0055bc594ce5.

These sample checks verify the implemented workflow and inspected artwork, not a guarantee that every future AI image will reproduce every word or reference perfectly. Agents should continue reviewing the downloadable output. The test account's saved asset remains the recruitment mascot poster rather than a real Agent headshot. Local feature-test Docker container was stopped after verification.


## Independent service integration (September 2026)

- Email Service provisions an internal User on first signed Portal request, keyed by portalAgentId. emailNormalized stores the non-email principal key portal-agent:<id>; email remains the current signed contact address. No native account registration, email lookup or manual association is required. Existing Portal IDs/campaign ownership survive contact-email changes. Native login rejects Portal principals; same-email native administrators keep their original account and permissions. An older manually linked native administrator is detached from the Portal mapping while retaining its native login and historical foreign keys.
- Campaign ownership remains sourceApplication + portalOwnerAgentId. Trusted Portal admin claims govern Portal admin access; a matching native email never grants privileges. Self-test still checks the actual contact email and the existing delivery allowlist.
- Content Studio defaults to Homix listings, with refresh, pagination and an All MLS search for MLS numbers, addresses or ZIP codes. /api/content/listings authenticates the Portal Agent and calls the website's private /api/portal/listings using the existing website shared secret. The website uses the same singleton listings provider and Homix office filters as Share Center. Curated overview cards cannot enter the picker.
- Selection fetches complete current listing detail, imports up to four chosen photos, and fills remarks, structured tax/maintenance/HOA, status and New York open-house time. Missing fees/periods stay absent. Just Sold uses only explicit closePrice. Manual entry remains available. Transient feed failures are shown separately from empty results.
- Chinese and English posters remain separate images using Azure gpt-image-2. Reviewed selling points, source evidence, language pairs and private R2 storage are unchanged.
- No database migration or end-user authorization step is required for this release. Azure text credentials stay on the Portal server; website and Email Service secrets never enter browser requests.

### Release acceptance — 2026-09-10 (New York)

- Website main f12c91e: production listing API verified with Homix first-page cards, MLS 1048286, 2 Lee Place detail (34 photos, complete description) and ZIP 11355 results from other brokerages. Website CI and Vercel deployment succeeded.
- Email Service main 0eb7840: CI succeeded. Production web revision 0000022 and worker revision 0000020 both use immutable image sha256:747986f7af3acc557d35b02565bbf36aaca63fc0029d1b90dbeddbcd516b80c6. Signed Portal workspace opens and retains existing drafts; unsigned integration requests return 401 INVALID_PORTAL_TOKEN. No real emails sent.
- Portal initial release f36a42f: full test suite, typecheck, lint, build, GitHub CI and Vercel deployment succeeded. Browser acceptance verified default Homix cards, MLS-number and address searches for 2 Lee Place, selection from 34 photos and import of two photos with $1,490,000 / 5 beds / 4 baths / 2,838 sq ft and complete source remarks.
- Live Azure testing identified equivalent written-number conversions and ellipsized evidence as sources of rejected output. The follow-up accepts faithful English number equivalents, avoids reading the m in monthly as a million suffix, and explicitly requires contiguous verbatim excerpts. One bounded validation repair is allowed; unsupported numbers/evidence still fail closed. The corrected Azure run returned six validated bilingual selling-point records from the real listing. The image workflow still creates separate language images.
- Follow-up content regressions: 13 tests passed, including numeric equivalence, rejection of invented amounts/spliced evidence, and bounded repair. Missing structured tax/fees on the tested listing remained blank; the AI did not invent them.
- Email Service's separate Security workflow still fails npm audit (10 advisories: 1 low, 5 moderate, 4 high) and container scanning; CodeQL succeeds. This release does not change package.json, package-lock.json or the Dockerfile. The earlier release had the same failing security checks. This remains a separate dependency-maintenance issue.

### Studio validation and interaction fixes

- Root cause of the date-regex error: importing a listing without an upcoming Open House assigned an empty event object, which every theme validated. Import now leaves absent events undefined; shared client/server preprocessing ignores fields not used by the selected poster theme, including leftover listing/event data on holiday posters. Open House still requires a real date, valid timezone and an increasing time range.
- Required-field failures previously exposed raw Zod text without a field name. Submission now validates before calling the API and returns actionable bilingual field messages for missing addresses/photos/dates and unfinished selected highlights. Deselected and hidden optional copy does not block unrelated poster themes.
- A small Back to listings control preserves scope, search and page while dismissing detail selection, including cancellation of a pending detail fetch. Existing imported details remain intact until another listing is confirmed.
- Property photos support mouse drag/drop, a touch pointer handle, keyboard arrows and previous/next buttons. Array order is preserved in the job and reference-image sequence; the first image is the requested hero. Changing only photo order does not invalidate reviewed selling points.
- Errors in Studio, listing search/import, template administration and generation review open a native modal dialog with focus containment, Escape, a close button and a return-to-editing action. Network/non-JSON failures receive readable messages. Newly failed generation jobs notify once; identical background polling failures do not reopen after dismissal.
- Validation: 20 content regressions passed, full Portal suite and production build passed, and the isolated PostgreSQL language-pair submission test verified removal of hidden empty fields without any image-provider calls. Recent live job metadata showed successful image jobs; the two screenshot errors occur before a generation is created.

## Queue, actionable errors and email refinements (2026-09-11)

- Poster submissions append to the existing per-agent predecessor chain under the existing transaction lock. Concurrent submissions and Chinese/English pairs keep one ordered queue; daily quota and idempotency still apply. Recovery scans eligible queue heads before limiting its batch.
- Validation identifies the field, selected selling-point row and language plus the corrective action. Failed artwork explains provider authorization, rejected requests and uncertain results without exposing provider response bodies.
- Email preview now allows the exact existing Azure marketing-assets storage origin in CSP; the iframe remains sandboxed. This resolves images that appeared in delivered test emails but were blocked in Portal preview.
- Portal supports signed DELETE of draft campaigns, with an in-product confirmation. Email Service checks owner, DRAFT state and version atomically and retains audit/test history. Sender pacing details are shown directly from Email Service; limits were not changed.
- Search input and action align at their lower edge with matching minimum height.
- Validation: 21 content unit tests, real PostgreSQL concurrent queue/idempotency/language/quota tests, Portal typecheck and scoped lint. Email Service: 81 unit tests; 47 sandbox integration cases and the disabled-delivery case tested separately in its required mode.

## Simplified selling-point review (2026-09-11)

- Compact selectable cards show the current interface language first. A 26px selection mark and full-width selection button replace the tiny checkbox. English/Chinese editing and exact source evidence expand on demand; editing does not toggle selection.
- Visible selection counts and a message on the attempted card explain the cap. Additional selection is refused without greying out the workflow. Existing over-limit input remains editable and gives a specific remedy. Coming Soon offers one selling point, matching its actual poster output; detailed posters allow four.
- The explicitly labelled “Confirm copy & create” action combines copy approval and generation. `copyReviewStep` keeps extraction separate from approval; only the confirm action marks extracted copy reviewed in the submitted snapshot. No separate confirm button is required. An explicit basic-details-only option skips AI, retaining structured costs and facts.
- A generation action beside the selection list shows output languages. Imported MLS source text is collapsed by default; brief status posters hide unused source/copy controls.
- Validation: 24 content tests, typecheck, scoped lint and production build passed. Local browser acceptance verified cap feedback, deselect/reselect, inline empty-translation errors, expand/collapse and a 350px-wide component layout.

### Poster branding and defaults (2026-09-11)

- New forms default to one Chinese poster. A second English version requires the user to choose the pair. Reusing a single-language work preserves its language; legacy bilingual works default to Chinese.
- Numeric tax/maintenance placeholders were removed. Empty amounts remain absent from model facts and must never be inferred as zero. Only confirmed entered/imported fees are used.
- Open House is labeled 公展 in Chinese UI, validation and generation instructions. New events default to 13:00–15:00 America/New_York; their date remains required. Imported actual MLS events and existing edited times take precedence.
- Every newly saved poster, including holidays and portrait-free output, receives the approved original `src/assets/content/homix-logo.webp`. The retryable save step fits the complete Azure result proportionally above a separate white brand footer and composites the logo there, retaining exact output dimensions without covering or cropping artwork. Prompt instructions prohibit invented logos. The official brand asset retains its original bilingual lettering.
- Branding is bundled into content/cron/workflow functions and checked before calling Azure. Save retries reuse the persisted provider result. Existing saved artwork is not rewritten; use again to create a branded version.
- Verified all three supported sizes with pixel tests for intact artwork, exact dimensions and visible logo pixels, plus a visual composite check. No additional image generation is needed for compositing verification.

### Multiple Open House sessions (2026-09-11)

- The content contract now uses `events[]` with per-session date, start/end, timezone and selection. Existing `event` submissions normalize to a one-item list, and old saved work remains reusable. An explicit empty list never falls back to the legacy session.
- MLS import keeps all valid future same-day sessions, sorted by start, deduplicated and converted to New York time with DST. It skips malformed, expired and overnight entries instead of allowing one invalid entry to hide later valid sessions.
- The compact session editor shows numbered cards and weekdays, selection and delete controls. Add another day advances the preceding calendar date while retaining hours/timezone; new schedules start at 13:00–15:00 with no guessed date.
- Validation names the actual card for invalid dates, timezone or time range, rejects duplicate selected sessions and requires one selected session. Deselected unfinished cards do not block generation. Non-Open-House and holiday inputs omit all event data.
- Both language prompts receive every selected session in date order with deterministic weekdays. Instructions require all selected sessions on the same poster; only identical hours and timezone may share a time line, while retaining every exact date. Unselected sessions never enter model facts.
- Validation: 30 content tests pass, including weekend import, malformed/duplicate/expired entries, DST/year rollover, legacy compatibility, second-row guidance, deselection and bilingual prompt coverage. Local browser acceptance at 360px covers adding Sunday, editing times with native controls, errors, deselection and deletion.
- Production acceptance also exposed the existing tall sticky sidebar hiding lower controls. Desktop settings now scroll independently within the viewport below navigation; mobile keeps ordinary page scrolling.
