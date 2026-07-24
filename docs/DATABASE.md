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
statements are disabled in `src/db/index.ts`. Local development defaults to
Postgres on port `5499`.

## Agent lifecycle rollout

The lifecycle migration is deliberately expand/contract:

1. Apply `db/migrations/20260723-agent-lifecycle-phase-a.sql`.
2. Deploy Homix Web and Homix Deals from their lifecycle branches.
3. Verify:
   - unknown Google login becomes `pending`;
   - admin-created/approved account becomes `active`;
   - its public profile is created `visible`;
   - the agent can switch `visible` ↔ `agent_hidden`;
   - admin hiding uses `admin_hidden`;
   - deactivation sets `inactive` and `admin_hidden`.
4. Apply `db/migrations/20260723-agent-lifecycle-phase-b.sql`.

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

`src/db/ensure-schema.ts` is idempotent and runs at application boot. It may
also be invoked with:

```bash
curl -X POST https://agents.homixny.com/api/admin/ensure-schema \
  -H "Authorization: Bearer $CRON_SECRET"
```

The retired Turso database and `TURSO_*` environment variables are no longer
used by code, CI, local development, or deployment.
