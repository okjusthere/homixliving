# Refactor Plan - Google-Only Auth + Practical Schema Simplification

> Audience: autonomous coding agent (Codex). Read this entire file before writing code. Implement in the order below. Keep the system simple: this is an internal Homix Living rental brokerage tool, not a public SaaS product.

---

## 1. Background

Homix Living needs an internal tool for brokers to record rental deals, generate OP invoices, and send those invoices to rental buildings. Expected usage is small: roughly 50-100 internal users.

The previous refactor plan went too far by introducing an N-agent `deal_agents` model and deleting `is_active`. That is no longer desired.

Final product direction:

1. **Google OAuth only.** Remove Resend magic-link auth. Resend remains only for invoice email.
2. **Keep `agents.is_active`.** Internal users must be approved or explicitly activated before they can use the app.
3. **Keep `agents.is_admin`.** Admin status is simple and enough for now. No finance role in this refactor.
4. **Keep primary/co-agent deal model.** A deal supports one primary agent and one optional co-agent. If a real-world case has a third person, write it in `notes` and handle commission manually.
5. **Remove unused or redundant tables.** Auth.js adapter tables, `referrers`, and `deal_invoices` can be dropped because the app has not been deployed to production with real data.

---

## 2. Non-Goals

Do **not** implement these in this refactor:

- No `deal_agents` table.
- No N-agent commission rewrite.
- No team-leader visibility model.
- No leader override commission.
- No finance role.
- No public signup experience.
- No migration preserving fake deal/invoice/agent data.

The goal is to make the existing business model reliable, not to redesign brokerage operations.

---

## 3. Permission Model

### 3.1 Login

- Google OAuth only.
- Magic link is removed:
  - Remove Resend provider from Auth.js.
  - Remove `/login/check-email`.
  - Remove email input from `/login`.
  - Keep `RESEND_API_KEY` for invoice sending only.

### 3.2 Agent creation

On first Google sign-in:

- Normalize Google email to lowercase.
- Look up `agents.email` case-insensitively.
- If an agent row exists, reuse it.
- If no row exists:
  - Create an `agents` row.
  - `email` = normalized Google email.
  - `name` = Google name or local part of email.
  - `split_pct` = 50.
  - `is_admin` = whether email is in `ADMIN_EMAILS`.
  - `is_active` = true only if email is in `ADMIN_EMAILS`; otherwise false.

This preserves the current internal approval flow while still allowing admins to see new sign-in attempts.

### 3.3 Admin status

- `ADMIN_EMAILS` is the source of truth for `is_admin`.
- On every sign-in/session refresh, sync `agents.is_admin` to the env var.
- If an email is added to `ADMIN_EMAILS`, it becomes admin and active on next sign-in.
- If an email is removed from `ADMIN_EMAILS`, it loses admin on next sign-in.
- Removing admin status should **not** automatically deactivate the agent. `is_active` is a separate access flag.
- `is_admin` is not editable through UI or API.

### 3.4 Active status

- `is_active=false` means the user can sign in but cannot use the app.
- Inactive users land on `/pending`.
- Inactive users may call only auth routes and pending-safe routes.
- Admins can approve/revoke agents by toggling `is_active`.
- API routes must enforce active status server-side. A client-side redirect is not enough.

### 3.5 Regular agent permissions

Regular active agents:

- Can see their own deals:
  - `deals.primary_agent_id = session.user.agentId`, or
  - `deals.co_agent_id = session.user.agentId`.
- Can create deals only for themselves as primary or co-agent unless admin.
- Can edit/delete only deals where they are primary or co-agent.
- Can view invoices linked to their own deals.
- Can self-edit basic profile fields:
  - `name`
  - `phone`
  - `license_number`
- Cannot self-edit:
  - `email`
  - `split_pct`
  - `team_id`
  - `is_admin`
  - `is_active`

### 3.6 Admin permissions

Admins:

- See all deals and invoices.
- Manage agents, buildings, teams, and settings.
- Approve or revoke `is_active`.
- Can edit agent business fields:
  - `licensed_company`
  - `split_pct`
  - `team_id`
  - `joined_at`
  - `notes`
- Cannot edit `email` or `is_admin` through UI/API.

---

## 4. Final Schema

### 4.1 Tables to keep

| Table | Purpose |
|---|---|
| `buildings` | Rental building catalog. Preserve rows if present. |
| `agents` | Auth identity plus broker profile. |
| `teams` | Optional grouping for brokers. Keep existing simple model. |
| `deals` | Rental deals. Keep primary/co-agent columns. |
| `invoices` | OP invoices. `deal_id` is the single deal link. |
| `invoice_send_log` | Email send audit trail. |
| `settings` | Company/payment/email configuration. |

### 4.2 Tables to drop

Drop these tables and do not recreate them:

| Table | Reason |
|---|---|
| `users` | Auth.js adapter table. Not needed after removing the adapter. |
| `accounts` | Auth.js adapter table. Not needed for JWT-only Google auth. |
| `sessions` | Auth.js adapter table. JWT sessions only. |
| `verificationTokens` | Magic-link table. Magic link is removed. |
| `referrers` | Replaced by inline deal fields. |
| `deal_invoices` | Redundant because `invoices.deal_id` is the link. |

### 4.3 `agents`

Final shape:

```sql
CREATE TABLE agents (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  phone TEXT,
  license_number TEXT,
  licensed_company TEXT,
  split_pct REAL NOT NULL DEFAULT 50,
  team_id INTEGER REFERENCES teams(id) ON DELETE SET NULL,
  is_active INTEGER NOT NULL DEFAULT 0,
  is_admin INTEGER NOT NULL DEFAULT 0,
  joined_at TEXT,
  notes TEXT,
  created_at TEXT,
  updated_at TEXT
);
```

Changes from current schema:

- Drop `user_id`.
- Keep `is_active`.
- Keep `is_admin`.
- Add `UNIQUE` on `email`.

### 4.4 `deals`

Keep the current primary/co-agent model:

- `primary_agent_id`
- `primary_agent_share_pct`
- `co_agent_id`
- `co_agent_share_pct`

Rules:

- Every deal must have one primary agent.
- Co-agent is optional.
- If co-agent exists, primary share + co-agent share must equal 100.
- If co-agent does not exist, primary share is 100 and co-agent fields are null.
- No third agent support in schema. Use `notes` for unusual cases.

Drop only:

- `referrer_id`

Keep inline referrer fields:

- `referrer_name`
- `referrer_type`
- `referrer_amount`
- `referrer_payment_info`

### 4.5 `invoices`

Keep `invoices.deal_id`.

Remove all code that uses `deal_invoices`.

Business rule:

- One deal normally has one OP invoice.
- `create-invoice` should check whether an invoice already exists for the deal and return the existing invoice or a clear 409 instead of silently creating duplicates.

Optional DB hardening:

```sql
CREATE UNIQUE INDEX IF NOT EXISTS idx_invoices_deal_id_unique
ON invoices(deal_id)
WHERE deal_id IS NOT NULL;
```

This is optional for MVP if route-level duplicate protection is implemented.

### 4.6 `invoice_send_log`

Drop `sent_by_user_id` because `users` is removed.

Keep `sent_by_email` as an audit snapshot.

```sql
CREATE TABLE invoice_send_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  invoice_id INTEGER NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  sent_by_email TEXT,
  to_recipients TEXT NOT NULL,
  cc_recipients TEXT,
  reply_to TEXT,
  subject TEXT NOT NULL,
  status TEXT NOT NULL,
  error_message TEXT,
  sent_at TEXT NOT NULL
);
```

---

## 5. Auth Refactor

### 5.1 `src/auth.ts`

Rewrite Auth.js to:

- Use only Google provider.
- Remove `DrizzleAdapter`.
- Remove Resend provider.
- Remove `events.createUser`.
- Use JWT session strategy from `auth.config.ts`.
- Upsert/read `agents` by email inside the JWT callback.

JWT callback requirements:

1. Normalize email to lowercase.
2. Upsert agent by `email`.
3. Strictly sync `is_admin` from `ADMIN_EMAILS`.
4. Keep `is_active` from the database, except admin emails should be forced active.
5. Put these on token:
   - `agentId`
   - `email`
   - `name`
   - `isAdmin`
   - `isActive`
6. Refresh these values from `agents` on every session read. Do not trust a 30-day JWT as the source of truth for approval/revocation.

### 5.2 `src/auth.config.ts`

Keep:

```ts
session: {
  strategy: "jwt",
  maxAge: 30 * 24 * 60 * 60,
}
```

Remove:

```ts
verifyRequest: "/login/check-email"
```

Public paths:

- `/login`
- `/pending`
- `/api/auth`
- `/_next`
- `/favicon`

The proxy/auth guard must ensure:

- Not signed in -> `/login`.
- Signed in but inactive and not admin -> `/pending`.
- Active or admin -> app access.

If Auth.js `authorized` callback is awkward for redirecting inactive users to `/pending`, implement this in `src/proxy.ts` with a small wrapper around `auth`.

### 5.3 `src/types/next-auth.d.ts`

Session user should include:

```ts
id?: string;
agentId: number | null;
isAdmin: boolean;
isActive: boolean;
```

JWT should include:

```ts
agentId?: number | null;
isAdmin?: boolean;
isActive?: boolean;
```

Do not rely on `userId` after removing the adapter tables.

### 5.4 Login UI

`src/app/login/page.tsx`:

- Remove magic-link email form.
- Remove provider-fetching complexity if desired.
- Show one Google button.
- Keep a simple error state if OAuth returns an error.

Delete:

- `src/app/login/check-email/`

Keep:

- `src/app/pending/`

---

## 6. Authorization Helpers

Add `src/lib/authz.ts`.

Required helpers:

```ts
requireSession()
requireActiveAgent()
requireAdmin()
canViewDeal(session, dealId)
canEditDeal(session, dealId)
dealsVisibleToSession(session)
```

Deal visibility:

- Admin sees all.
- Regular agent sees a deal if they are primary or co-agent.

SQL condition for regular agents:

```sql
primary_agent_id = :agentId OR co_agent_id = :agentId
```

No team-leader visibility in this refactor.

Apply helpers consistently to:

- `/api/deals`
- `/api/deals/[id]`
- `/api/deals/[id]/breakdown`
- `/api/deals/[id]/create-invoice`
- `/api/invoices`
- `/api/invoices/[id]`
- `/api/invoices/[id]/send`
- `/api/invoices/[id]/mark-paid`
- `/api/reports/monthly`
- `/api/agents`
- `/api/settings`
- `/api/buildings`
- `/api/teams`

---

## 7. File-by-File Changes

### 7.1 Schema and seed

Files:

- `src/db/schema.ts`
- `src/db/seed.ts`

Changes:

- Delete Auth.js adapter table declarations.
- Delete `referrers`.
- Delete `dealInvoices`.
- Remove `agents.userId`.
- Keep `agents.isActive`.
- Keep `agents.isAdmin`.
- Add unique email to `agents`.
- Remove `deals.referrerId`.
- Keep primary/co-agent columns.
- Remove `invoiceSendLog.sentByUserId`.

Seed:

- Do not recreate dropped tables.
- Keep building seed.
- Keep settings seed.
- Demo agents should match the new `agents` schema if `SEED_DEMO=1` is still supported.

### 7.2 Agents UI and API

Keep:

- `/agents`
- `/agents/[id]`
- `/api/agents`
- `/api/agents/[id]`
- `/api/agents/[id]/approve`

Rules:

- Admin can create agents manually.
- First Google sign-in can also create a pending agent.
- Admin can approve/revoke by changing `is_active`.
- Agent email is read-only once set.
- `is_admin` is env-driven and not editable.
- Non-admin can self-edit only name/phone/license number.

Do not delete the pending approval UI.

### 7.3 Referrers

Delete:

- `src/app/referrers/`
- `src/app/api/referrers/`
- `referrers` imports and response payloads.

Use only inline deal fields:

- `referrerName`
- `referrerType`
- `referrerAmount`
- `referrerPaymentInfo`

### 7.4 Deals

Files:

- `src/app/api/deals/route.ts`
- `src/app/api/deals/[id]/route.ts`
- `src/app/api/deals/[id]/breakdown/route.ts`
- `src/app/deals/new/page.tsx`
- `src/app/deals/[id]/page.tsx`

Keep request shape close to current:

```ts
{
  primaryAgentId,
  primaryAgentSharePct,
  coAgentId,
  coAgentSharePct,
  referrerName,
  referrerType,
  referrerAmount,
  referrerPaymentInfo,
  ...
}
```

Validation:

- primary agent required.
- co-agent optional.
- co-agent cannot equal primary agent.
- if co-agent exists, shares sum to 100.
- if no co-agent, primary share becomes 100 and co-agent fields become null.
- third-agent cases go in notes.

Authorization:

- Admin can create/edit/delete any deal.
- Non-admin can create a deal only if they are primary or co-agent.
- Non-admin can view/edit/delete only deals where they are primary or co-agent.

### 7.5 Invoices

Files:

- `src/app/api/invoices/route.ts`
- `src/app/api/invoices/[id]/route.ts`
- `src/app/api/invoices/[id]/pdf/route.ts`
- `src/app/api/invoices/[id]/send/route.ts`
- `src/app/api/invoices/[id]/mark-paid/route.ts`
- `src/app/api/deals/[id]/create-invoice/route.ts`

Changes:

- Remove all `dealInvoices` usage.
- Linked invoices are fetched by `invoices.deal_id`.
- Creating invoice from deal sets `invoices.deal_id`.
- Creating invoice from deal must not create duplicates.
- Invoice sender audit writes only `sent_by_email`.

Authorization:

- Admin can see/send/mark paid/delete all invoices.
- Regular agent can see invoices linked to their own deals.
- Decide whether regular agents may send invoices. If not, restrict send/mark-paid to admin for now.

Recommended MVP:

- Agents can draft/create invoice from their own deal.
- Admin sends and marks paid.

### 7.6 Reports and dashboard

Keep primary/co-agent reporting.

Update only where needed after removing `referrers` and `dealInvoices`.

Do not rewrite reports around `deal_agents`.

### 7.7 Settings

API:

- `GET`: active authenticated users may read.
- `PUT`: admin only.

UI:

- Admin can edit.
- Non-admin read-only or hidden.

---

## 8. Database Reset / Migration

The project is not deployed with real production data. A destructive reset of non-building data is acceptable.

Before running against any remote database, confirm there is no real data to preserve.

Recommended drop order:

```sql
DROP TABLE IF EXISTS invoice_send_log;
DROP TABLE IF EXISTS deal_invoices;
DROP TABLE IF EXISTS invoices;
DROP TABLE IF EXISTS deals;
DROP TABLE IF EXISTS referrers;
DROP TABLE IF EXISTS accounts;
DROP TABLE IF EXISTS sessions;
DROP TABLE IF EXISTS verificationTokens;
DROP TABLE IF EXISTS users;
DROP TABLE IF EXISTS agents;
DROP TABLE IF EXISTS teams;
```

Do not drop:

- `buildings` if the building catalog is already loaded and should be preserved.
- `settings` if payment/email settings have already been configured.

Then run:

```bash
npm run db:seed
```

Expected behavior:

- Tables are recreated from the simplified schema.
- Buildings are inserted only if empty.
- Settings are inserted with `onConflictDoNothing`.

---

## 9. Environment Variables

Keep:

- `TURSO_DATABASE_URL`
- `TURSO_AUTH_TOKEN`
- `AUTH_GOOGLE_ID`
- `AUTH_GOOGLE_SECRET`
- `AUTH_SECRET`
- `ADMIN_EMAILS`
- `RESEND_API_KEY`
- `FROM_EMAIL`
- `CC_EMAIL`

Remove from auth flow:

- `AUTH_EMAIL_FROM`

Reason: magic link auth is removed. Invoice email still uses Resend and `FROM_EMAIL`.

Google OAuth redirect URI must include:

```text
https://living.homixny.com/api/auth/callback/google
```

If using local dev:

```text
http://localhost:3000/api/auth/callback/google
```

---

## 10. Implementation Order

1. Schema + seed simplification.
2. Auth rewrite to Google-only while keeping `is_active`.
3. Login page simplification; delete check-email page.
4. Proxy/server guard for inactive users.
5. Add authz helpers for active/admin/deal ownership.
6. Agents API/UI: keep approval, lock email/isAdmin.
7. Remove referrers page/API/table usage.
8. Remove deal_invoices usage and route invoice linking through `invoices.deal_id`.
9. Harden deal APIs with primary/co-agent ownership checks.
10. Harden invoice APIs with invoice/deal ownership checks.
11. Harden settings/buildings/teams/reports APIs.
12. Run `npm run build`.
13. Run `npm run test`.

Do not proceed to the next numbered step if the build is broken, unless the current step is explicitly the one responsible for fixing the build.

---

## 11. Acceptance Criteria

- [ ] Login page shows one Google button.
- [ ] Magic-link email input is gone.
- [ ] `/login/check-email` returns 404.
- [ ] New non-admin Google user creates an agent row with `is_active=0`, `is_admin=0`.
- [ ] New admin Google user listed in `ADMIN_EMAILS` creates an agent row with `is_active=1`, `is_admin=1`.
- [ ] Inactive user lands on `/pending` and cannot call protected APIs.
- [ ] Admin can approve/revoke an agent through `is_active`.
- [ ] Removing an email from `ADMIN_EMAILS` demotes `is_admin` on next sign-in/session refresh.
- [ ] `is_admin` cannot be edited through UI or API.
- [ ] Agent email cannot be edited through UI or API.
- [ ] Regular agent can see only deals where they are primary or co-agent.
- [ ] Regular agent cannot edit another agent's deal.
- [ ] Admin sees all deals and invoices.
- [ ] Deal creation still supports primary agent plus optional co-agent.
- [ ] Deal creation rejects co-agent share totals that do not sum to 100.
- [ ] There is no `deal_agents` table and no N-agent UI.
- [ ] Third-person commission cases are handled manually in `notes`.
- [ ] `referrers` table/page/API are gone.
- [ ] Deal referrer info still works through inline fields.
- [ ] `deal_invoices` table is gone.
- [ ] Deal detail gets linked invoices from `invoices.deal_id`.
- [ ] Creating an invoice from a deal does not create duplicate invoices.
- [ ] `invoice_send_log.sent_by_user_id` is gone.
- [ ] Invoice send log still records `sent_by_email`.
- [ ] `users`, `accounts`, `sessions`, `verificationTokens` are gone after removing the Auth.js adapter.
- [ ] `npm run build` passes.
- [ ] `npm run test` passes.

---

## 12. Commit Message Template

```text
refactor: simplify auth and invoice schema

Use Google-only Auth.js JWT sessions and remove magic-link auth.
Identity now maps to agents by normalized email. Keep is_active for
internal approval and keep is_admin driven by ADMIN_EMAILS.

Keep the existing primary/co-agent deal model. Do not add deal_agents or
N-agent commission logic; third-person exceptions stay in deal notes.

Drop unused tables: users, accounts, sessions, verificationTokens,
referrers, and deal_invoices. Use invoices.deal_id as the only deal to
invoice link and inline referrer fields on deals.

Harden API authorization around active users, admin-only operations, and
primary/co-agent deal ownership.
```
