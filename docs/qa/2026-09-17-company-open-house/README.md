# Company Open House posters — September 17, 2026

## Behavior

- Admin batch import uses each listing's own unexpired MLS sessions by default. An explicit checkbox enables common schedule replacement; absent dates stay incomplete drafts.
- New `/admin/marketing/posters?tab=open-houses` tab lists only company properties with valid upcoming MLS Open Houses. No agent/theme/highlight confirmation steps are required.
- Listing Agent is resolved by exact MLS identity through `public.agents.mls_id` and `portal_agent_id`. Missing or ambiguous mappings, missing portraits/photos, invalid copy and suspicious source schedules show an actionable row message. Other properties remain eligible.
- One click snapshots the current trusted catalog into durable, private jobs. Duplicate administrators/requests use a unique content fingerprint. Workflows prepare assets and enqueue ordinary office generations; closing the page does not stop submitted workflows. Preparation failures can be retried without creating another paid image.
- Default is one Chinese 4:5 Homix Classic poster per property with all supplied sessions. Substitute hosts continue to use ordinary poster production.
- Only office Open House inputs may use `highlightsMode=image_model`. The image prompt receives source description and structured costs, aims for five supported points, prioritizes real annual property tax, and forbids made-up amounts, inferred billing periods, zero defaults and unsupported claims. The existing personal review flow remains mandatory.

## Validation

- Content unit suite: 52 tests, including distinct schedules, multiple sessions, expired/no-event filtering, exact/ambiguous identity, invalid copy isolation and tax/prompt boundaries.
- Isolated `homix_office_test`: 50 assertions, including admin-only API, CSRF rejection, concurrent insert deduplication, duplicate workflow delivery, revoked-role checks, automatic-mode isolation from personal generation and real subject ownership.
- TypeScript and targeted ESLint pass. Production Next.js build passes.
- Browser, synthetic local fixtures: click-once queues two eligible properties; third blocked property stays visible; repeated submit disabled; refresh retains queued status. Existing bulk import saves Sep 19 1–3 PM and Sep 20 2–4 PM and displays both in the editor. Extraction error dialog closes while preserving draft. 390px viewport has no horizontal overflow.
- Read-only production catalog: 18 upcoming properties, all Listing Agents mapped. One source schedule starts at 03:00; it is flagged for MLS correction, never changed to 15:00. No structured annual property tax was returned in this sample; missing tax is omitted.
- No bulk paid generation or external messages were sent during verification. Prompt constraints are tested; generated artwork still needs ordinary visual review.

## Release

Apply `db/migrations/20260917-company-open-house.sql` before publishing the app. It adds only the private durable preparation table, fingerprint uniqueness and pending index. Existing content recovery also recovers undispatched preparation jobs. Do not remove the table while pending workflows reference it.
