# Shared Supabase database operations

Homix Deals and Homix Web share one Supabase Postgres project with strict
schema ownership:

- `portal.*` — internal accounts, deals, invoices, finance, training.
- `public.*` — website advisor profiles and inquiries.

The Portal is the source of truth for advisor identity. Homix Web owns the
public projection and accepts writes only from authenticated Portal
server-to-server APIs.

## Connection

Production `DATABASE_URL` must use the Supabase transaction pooler. Prepared
statements are disabled for the administrative postgres-js client. Application
queries use a Vercel-managed `pg.Pool` so idle connections are released before
a Fluid Compute instance is suspended. Local development defaults to Postgres
on port `5499`.

## Agent lifecycle rollout

The lifecycle migration is deliberately expand/contract:

1. Apply `db/migrations/20260723-agent-lifecycle-phase-a.sql`.
2. Deploy Homix Web and Homix Deals from their lifecycle branches.
3. Verify:
   - unknown Google login becomes `pending`;
   - admin-created/approved account becomes `active`;
   - an administrator links an existing public profile during approval, or approval creates a minimal profile automatically;
   - the agent can switch `visible` ↔ `agent_hidden`;
   - admin hiding uses `admin_hidden`;
   - deactivation sets `inactive` and `admin_hidden`.
4. Apply `db/migrations/20260723-agent-lifecycle-phase-b.sql`.

## Automated News

`db/migrations/20260730-automated-news.sql` is an additive shared-database
migration. Apply it before deploying the Homix Web `/news` routes or the Portal
Share Center `news` tab. It creates private News pipeline tables, seeds RSS
sources, installs the daily-run claim function, and extends
`public.share_links.content_kind` to accept `news`.

The same canonical SQL is mirrored in the website repository as
`supabase/automated-news.sql` for Supabase SQL Editor use. No public RLS policy
is added; only the server-side service role may read or write News pipeline
state.

The deployed Portal can perform the same operations with its own protected
database connection. `phase=expand` is idempotent; contract additionally
requires an explicit confirmation:

```bash
curl -X POST "https://agents.homixny.com/api/admin/ensure-schema?phase=expand" \
  -H "Authorization: Bearer $LIFECYCLE_MIGRATION_SECRET"

curl -X POST "https://agents.homixny.com/api/admin/ensure-schema?phase=contract&confirm=drop-legacy-columns" \
  -H "Authorization: Bearer $LIFECYCLE_MIGRATION_SECRET"
```

`LIFECYCLE_MIGRATION_SECRET` is a temporary production-only rollout credential.
Remove it from Vercel immediately after the contract verification.

Phase B removes the obsolete `is_active`, `approval_status`, `visible`, and
`edit_token` columns. Do not apply it until both Vercel deployments are on the
new code.

## Schema checks

`src/db/ensure-schema.ts` is idempotent but deliberately does not run at
application boot. Schema changes must be applied before deploying code that
depends on them, or invoked explicitly with:

```bash
curl -X POST https://agents.homixny.com/api/admin/ensure-schema \
  -H "Authorization: Bearer $CRON_SECRET"
```

The retired Turso database and `TURSO_*` environment variables are no longer
used by code, CI, local development, or deployment.

## Existing public roster reconciliation

Portal approval grants internal access and ensures the agent has a public
profile. Existing website profiles must be linked explicitly because public
contact details, nicknames, and Portal login emails are not reliable identity
keys; when no profile is selected, approval creates a minimal visible profile.

Administrators reconcile those records from `/agents` under "Website roster":

1. For a pending login, select the matching existing website profile before
   approving it. Leave the selection empty only when the person has no existing
   profile; approval then creates and links one automatically.
2. Existing active accounts can also be linked from the website-roster view: find a public
   profile without the `已关联` badge, select the matching Portal agent, and
   click `关联`.
3. The old `/roster` URL redirects to `/agents?view=public`; public-profile edit
   URLs remain compatible with existing bookmarks.

The operation is admin-only and auditable. It copies Portal-owned identity
fields after linking, and database uniqueness prevents one Portal account from
being attached to multiple public profiles. Never infer links from fuzzy name
matching.
