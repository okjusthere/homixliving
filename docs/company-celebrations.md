# Company celebrations

Administrators manage birthdays and work anniversaries in **Administration → Agents**. These tools and their drafts are restricted to active administrators; they do not appear in agents' personal poster studio.

- Birthday records contain month/day only. Birth years from imported Excel dates are discarded.
- Work anniversaries use the HR-confirmed joining date. Account creation dates are never substituted. Celebrations start after one complete year.
- Both views include today, next seven days, current month, missing dates and all active agents. Disabled/inactive agents are excluded from automatic preparation.
- February 29 is observed on February 28 in non-leap years. Calendar calculations use America/New_York, including DST and year rollover.

## HR import

Upload `.xlsx` (first worksheet) or UTF-8 `.csv`, up to 2 MB / 1,000 rows. Use the account's primary email or `agent_id`; names are not identity keys. If both identifiers are supplied, they must match. Unknown, ambiguous and duplicate accounts are flagged. Preview does not write to the database. Confirmation imports valid rows, revalidates active accounts and rejects stale profile revisions atomically.

Birthday columns: `email,birthday_month,birthday_day`, or `email,birthday` with MM/DD or a native Excel date. Anniversary columns: `email,joined_on` with YYYY-MM-DD or a native Excel date. A template is available in each import panel. Clearing a date is an explicit edit, never an effect of an empty import cell.

No real dates are seeded. HR can import the roster after release.

## Preparation and review

The current Vercel Hobby plan supports daily scheduling. The production cron `/api/cron/celebrations` runs daily at 12:15 UTC (07:15/08:15 in New York, depending on daylight saving) and authenticates with the existing `CRON_SECRET`. Defaults are seven days ahead, Chinese, and ten company generations per New York calendar day. Administrators can pause new automatic preparation, change the lead time/language/limit, or check now. Already queued work continues when automatic preparation is paused.

Each agent, occasion and calendar year has one durable event. A company transaction lock serializes budgeting and creation; explicit regeneration compares the previous generation ID. Birthday and anniversary revisions are independent. Changes to eligibility cancel queued work, and the provider claim checks current eligibility again before spending. Uncertain provider outcomes require administrator review; the scheduler never repeats them automatically.

The service uses the existing portrait/profile, official logo, Azure image workflow, template versions and private image storage. It selects the most recently created published template of the matching occasion that supports 1024×1280. Two initial company templates are included. Publish changes in Administration → Poster management. Changing a template affects subsequent preparations; regenerating an existing draft is explicit and uses one company generation.

Images are company greetings to the colleague, with the company as sender. Birthday age, contact details and marketing footers are excluded. Missing portraits or configuration appear as blocked tasks. Administrators review names, likeness and copy, download the image, and mark it celebrated. The mark is reversible. Previous generations remain in administrator history.

This feature does not send messages, email, or publish images. Email Service remains independent. Company work is excluded from personal projects, assets, generation lists and quotas.

## Release and verification

Apply `db/migrations/20260912043944_agent_birthdays.sql` after the existing content-center and language-pair migrations and before deploying the new application. The migration adds private RLS-enabled profile/event tables, internal-only flags on content resources, two templates and settings; it does not populate personal dates.

- `npm run test:celebrations`: calendar, import/XLSX, company copy and personal API validation.
- `npm run test:celebrations:db`: dedicated disposable local `homix_celebration_test` database, including concurrency, revisions, budget, visibility and uncertain results. External provider requests are rejected by this test.
- CI creates the dedicated database automatically. Existing content tests continue to cover provider requests and image persistence.

Prefer a forward fix for rollback after internal drafts exist: old application versions do not enforce the new internal-only flags. Pausing automation stops new automatic jobs but does not remove existing drafts or restore old access behavior.
