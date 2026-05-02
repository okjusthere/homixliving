# Refactor Plan - Google-Only Auth + N-Agent Deals + Lightweight Activation

> **Audience:** autonomous coding agent (Codex). Read this entire file before writing code. Implement as one cohesive PR. Where the existing codebase has a convention, follow it.

---

## 1. Background

Internal CRM-style tool for Homix Living's Rental business. Expected usage is small: fewer than 100 internal users, mostly rental agents plus admin/finance. The main workflow is simple:

1. Agents sign in.
2. Agents record Rental closed deals.
3. The system generates OP invoices.
4. The company emails those invoices to Rental buildings / owners.

The current implementation is over-engineered for this scope. It has three overlapping identity concepts (`users`, Auth.js `accounts`, and `agents`), two login methods, pending logic that is coupled to auth tables, and hardcoded primary/co-agent deal ownership that does not fit real Rental cases.

This refactor keeps the business-critical parts and removes the rest.

**Keep:**

- Google OAuth login.
- A single `agents` table as both login roster and business broker profile.
- `agents.is_active` as a lightweight enable/disable switch.
- `agents.is_admin` synced from `ADMIN_EMAILS`.
- `/pending` as the fallback for unknown or deactivated users.
- Admin pre-creation / import of active agents so Rental brokers can sign in and use the app immediately.
- N-agent deal participation through a `deal_agents` junction table.
- Team-leader read visibility.
- Existing buildings, settings, invoice-send audit, renewal/referrer free-text fields.

**Remove:**

- Magic link login.
- Auth.js adapter tables: `users`, `accounts`, `sessions`, `verificationTokens`.
- `agents.user_id`.
- `referrers`.
- `deal_invoices`.

The important product decision is this:

> `is_active` is not a heavy approval workflow. It is the company roster switch. If an admin pre-adds an agent with `is_active = true`, that agent can sign in with Google and start working immediately. If an unknown Google user signs in, the system creates an inactive pending agent row and blocks app access until admin activates it.

That gives the team both safety and "out of box" onboarding without keeping the old `users/accounts/agents` complexity.

---

## 2. Final Permission Model

### 2.1 Authentication

- Google OAuth only.
- No password login.
- No Resend magic link.
- No Auth.js Drizzle adapter.
- No DB sessions. Auth.js uses JWT cookies.
- Google email is the stable identity key.

### 2.2 Agent lifecycle

The `agents` table is the only user/business table.

On every Google sign-in:

1. Normalize Google email to lowercase.
2. Check whether email is in `ADMIN_EMAILS`.
3. Look up `agents.email`.
4. Apply this decision table:

| Case | Action | Result |
|---|---|---|
| Email is in `ADMIN_EMAILS`, no agent row | Create agent with `is_admin = true`, `is_active = true` | Admin enters app immediately |
| Email is in `ADMIN_EMAILS`, row exists | Force `is_admin = true`, force `is_active = true` | Admin enters app immediately |
| Email is not admin, active row exists | Sync `is_admin = false`, preserve `is_active = true` | Agent enters app immediately |
| Email is not admin, inactive row exists | Sync `is_admin = false`, preserve `is_active = false` | Redirect to `/pending` |
| Email is not admin, no row exists | Create row with `is_admin = false`, `is_active = false` | Redirect to `/pending` |

This supports two onboarding paths:

- **Normal internal onboarding:** admin pre-creates or imports agents with `is_active = true`; agents sign in with Google and land directly in the app.
- **Fallback onboarding:** unknown users can still sign in, but they are inactive and blocked on `/pending` until admin activates them.

### 2.3 `is_active`

`is_active` is retained.

It means "this Google email is currently allowed to use the app." It does **not** need a complex state machine such as `pending / approved / rejected`.

- `is_active = true`: user can access protected app pages and APIs.
- `is_active = false`: user can sign in, but can only access `/pending`, `/login`, and auth routes.
- Admins are always active because `ADMIN_EMAILS` is the break-glass source of truth.
- Deactivating a regular agent is how Homix disables access without deleting historical deal records.

No separate `status` column is needed.

### 2.4 `is_admin`

`is_admin` stays on `agents` for easy authorization checks, but it is env-driven.

- Source of truth: `ADMIN_EMAILS`.
- On every sign-in / JWT refresh, sync `agents.is_admin` to whether email is in `ADMIN_EMAILS`.
- Admin UI and APIs must not allow editing `is_admin`.
- Removing an email from `ADMIN_EMAILS` demotes that user on next session refresh.
- Demotion should not automatically deactivate the agent; `is_active` remains the roster switch.

### 2.5 Regular agent permissions

Active non-admin agents can:

- Read their own deals and invoices.
- Create deals for themselves and any selected co-agents.
- Edit/delete deals where they personally appear in `deal_agents`.
- Update their own contact profile fields: `name`, `phone`, `license_number`.
- Read buildings, teams, and settings needed for forms.

Active non-admin agents cannot:

- Access inactive accounts.
- Edit another agent's profile.
- Change `email`.
- Change `is_admin`.
- Change `is_active`.
- Manage buildings, teams, or settings.
- Edit/delete a deal only because they are a team leader.

### 2.6 Team-leader read access

An agent who is `teams.leader_agent_id` can read deals where any member of that team appears in `deal_agents`.

This is read-only visibility. It does not grant edit/delete permission unless the leader is also personally on that deal.

### 2.7 Admin permissions

Admins can:

- See all agents, deals, invoices, buildings, teams, settings.
- Create/import agents.
- Activate/deactivate regular agents.
- Edit admin-owned fields on agents: `licensed_company`, `split_pct`, `team_id`, `joined_at`, `notes`, contact fields.
- Manage buildings, teams, and settings.
- Send invoices.

Admins cannot:

- Edit `is_admin` through UI/API.
- Change agent email after creation, except by deleting/recreating if there are no dependent deals.

---

## 3. Final Schema

### 3.1 Tables to keep

| Table | Purpose | Notes |
|---|---|---|
| `buildings` | Rental building directory | Preserve data. |
| `agents` | Login roster + broker profile | Email is unique identity key. |
| `teams` | Optional broker grouping | Keep leader visibility. |
| `deals` | Rental closed deals | Remove primary/co-agent columns. |
| `deal_agents` | N-agent deal participation | New junction table. |
| `invoices` | OP invoices | `deal_id` is the deal link. |
| `invoice_send_log` | Email audit trail | Keep email snapshot fields. |
| `settings` | Company invoice/email config | Preserve data. |

### 3.2 Tables to drop

| Table | Why |
|---|---|
| `users` | Auth.js adapter identity table. JWT-only Google auth does not need it. |
| `accounts` | OAuth linkage table from adapter. Not needed without adapter. |
| `sessions` | DB sessions. JWT cookie sessions are enough. |
| `verificationTokens` | Magic link tokens. Magic link is removed. |
| `referrers` | Free-text referrer fields on `deals` are enough. |
| `deal_invoices` | Redundant with `invoices.deal_id`. |

### 3.3 `agents`

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
  is_admin INTEGER NOT NULL DEFAULT 0,
  is_active INTEGER NOT NULL DEFAULT 0,
  joined_at TEXT,
  notes TEXT,
  created_at TEXT,
  updated_at TEXT
);
```

Removed from the old schema:

- `user_id`

Kept intentionally:

- `is_active`

Rules:

- `email` is lowercase and unique.
- `email` is locked after creation.
- `is_admin` is synced from `ADMIN_EMAILS`.
- `is_active` is editable only by admin.
- Self-edit fields: `name`, `phone`, `license_number`.
- Admin-only fields: `licensed_company`, `split_pct`, `team_id`, `joined_at`, `notes`, `is_active`.

### 3.4 `teams`

```sql
CREATE TABLE teams (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  notes TEXT,
  leader_agent_id INTEGER REFERENCES agents(id) ON DELETE SET NULL
);
```

Keep `leader_agent_id` because leader read visibility is a real business need.

Deferred:

- `leader_override_pct`
- Automatic leader commission injection

Those can be added later without changing the `deal_agents` structure.

### 3.5 `deal_agents`

```sql
CREATE TABLE deal_agents (
  deal_id INTEGER NOT NULL REFERENCES deals(id) ON DELETE CASCADE,
  agent_id INTEGER NOT NULL REFERENCES agents(id) ON DELETE RESTRICT,
  share_pct REAL NOT NULL,
  is_primary INTEGER NOT NULL DEFAULT 0,
  created_at TEXT,
  PRIMARY KEY (deal_id, agent_id)
);

CREATE INDEX idx_deal_agents_agent ON deal_agents(agent_id);
```

This replaces:

- `deals.primary_agent_id`
- `deals.primary_agent_share_pct`
- `deals.co_agent_id`
- `deals.co_agent_share_pct`

Validation invariants:

- Every deal has at least one agent row.
- Exactly one row per deal has `is_primary = true`.
- `SUM(share_pct) = 100` with tolerance of `0.01`.
- Agent ids must exist and must be active when creating/updating a deal.
- `ON DELETE RESTRICT` prevents deleting an agent who appears on a historical deal.

### 3.6 `deals`

Drop:

- `primary_agent_id`
- `primary_agent_share_pct`
- `co_agent_id`
- `co_agent_share_pct`
- `referrer_id`

Keep:

- Building/unit/tenant/lease/commission fields.
- `licensed_company` snapshot.
- Free-text `referrer_name`.
- Free-text `referrer_payment_info`.
- Renewal tracking fields.
- Status/source/date/notes/timestamps.

`licensed_company` is snapshotted from the primary agent at deal creation. Do not recompute it on later agent profile edits.

### 3.7 `invoices`

No structural change required.

- `invoices.deal_id` is the only deal link.
- One invoice belongs to zero or one deal.
- Invoice contact fields are populated from the primary agent in `deal_agents`.

### 3.8 `invoice_send_log`

Drop:

- `sent_by_user_id`

Keep:

- `sent_by_email`
- recipient snapshots
- reply-to
- subject
- status/error
- sent timestamp

Reason: `users` is removed, and the email snapshot is enough for the audit trail.

---

## 4. Auth Implementation

### 4.1 Remove adapter and magic link

In `src/auth.ts`:

- Remove `DrizzleAdapter`.
- Remove `Resend` provider.
- Remove `events.createUser`.
- Remove any adapter-specific `users` assumptions.
- Keep only Google provider.

In auth env/docs:

- Remove `AUTH_EMAIL_FROM`.
- Keep Google OAuth env vars.
- Keep `AUTH_SECRET`.
- Keep `ADMIN_EMAILS`.

### 4.2 JWT callback behavior

Pseudo-code:

```ts
const adminEmails = (process.env.ADMIN_EMAILS ?? "")
  .split(",")
  .map((email) => email.trim().toLowerCase())
  .filter(Boolean);

const isAdminEmail = (email: string) =>
  adminEmails.includes(email.toLowerCase());

async function upsertAgentFromGoogle(user: {
  email?: string | null;
  name?: string | null;
}) {
  if (!user.email) throw new Error("Google account has no email");

  const email = user.email.trim().toLowerCase();
  const admin = isAdminEmail(email);
  const now = new Date().toISOString();

  // Atomic upsert. agents.email is UNIQUE, so concurrent first-time sign-ins
  // for the same email (rare but real — e.g. two browser tabs hitting the
  // OAuth callback at once) would otherwise crash with a UNIQUE-constraint
  // exception and break sign-in. `onConflictDoNothing` makes the second
  // insert a no-op; the SELECT below picks up whichever row got created.
  await db
    .insert(agents)
    .values({
      email,
      name: user.name || email.split("@")[0],
      isAdmin: admin,
      isActive: admin,           // admin auto-active; non-admin starts inactive → /pending
      splitPct: 50,
      joinedAt: now.slice(0, 10),
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoNothing({ target: agents.email });

  // Case-insensitive read so a future email-casing variation can't miss the row.
  const [existing] = await db
    .select()
    .from(agents)
    .where(sql`lower(${agents.email}) = ${email}`)
    .limit(1);

  if (!existing) {
    throw new Error(`Failed to upsert agent for ${email}`);
  }

  // Strict admin sync from ADMIN_EMAILS (env var = single source of truth).
  // Promoting an admin also forces is_active = true so admins can never be
  // locked out by a bad roster edit.
  // DEMOTING admin does NOT auto-deactivate the agent — is_active is a
  // separate roster switch (§2.3). The previous admin keeps their app access
  // as a regular agent until admin explicitly deactivates them.
  const needsAdminFlip = Boolean(existing.isAdmin) !== admin;
  const needsActiveForce = admin && !existing.isActive;
  const needsNameFill = !existing.name && Boolean(user.name);

  if (needsAdminFlip || needsActiveForce || needsNameFill) {
    const [updated] = await db
      .update(agents)
      .set({
        isAdmin: admin,
        ...(needsActiveForce ? { isActive: true } : {}),
        ...(needsNameFill ? { name: user.name! } : {}),
        updatedAt: now,
      })
      .where(eq(agents.id, existing.id))
      .returning();
    return updated || existing;
  }

  return existing;
}
```

Required imports for this helper: `eq`, `sql` from `drizzle-orm`.

Token fields:

```ts
token.agentId = agent.id;
token.email = agent.email;
token.name = agent.name;
token.isAdmin = Boolean(agent.isAdmin);
token.isActive = Boolean(agent.isActive);
```

Session fields:

```ts
session.user.id = String(token.agentId);
session.user.agentId = token.agentId;
session.user.email = token.email;
session.user.name = token.name;
session.user.isAdmin = token.isAdmin;
session.user.isActive = token.isActive;
```

### 4.3 Active-user guard

All protected pages and APIs must require:

- Signed in
- `session.user.isActive === true` OR `session.user.isAdmin === true`

Inactive signed-in users:

- Can access `/pending`.
- Can access `/login`.
- Can access Auth.js routes.
- Cannot access app routes.
- Cannot call protected APIs.

If the framework's `authorized` callback cannot redirect reliably, keep it simple:

- Let auth validate sign-in.
- Add a server-side guard helper for app pages and route handlers.
- Use middleware/proxy only for coarse redirects.

Suggested helper:

```ts
export async function requireActiveAgent() {
  const session = await auth();

  if (!session?.user?.email) {
    redirect("/login");
  }

  if (!session.user.isAdmin && !session.user.isActive) {
    redirect("/pending");
  }

  return session;
}
```

Suggested API helper:

```ts
export async function requireActiveAgentApi() {
  const session = await auth();

  if (!session?.user?.email) {
    return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }

  if (!session.user.isAdmin && !session.user.isActive) {
    return { error: NextResponse.json({ error: "Inactive account" }, { status: 403 }) };
  }

  return { session };
}
```

Do not rely only on client redirects for access control.

### 4.4 Login page

Keep:

- Google sign-in button.
- Clear error state for OAuth failures.

Remove:

- Magic link email form.
- `/login/check-email`.
- Resend-specific copy.

### 4.5 Pending page

Keep `/pending`.

It should say the account is waiting for Homix activation. It should not expose internal implementation details.

Behavior:

- If signed out, redirect to `/login`.
- If active/admin, redirect to app home.
- If inactive, render pending message and sign-out action.

---

## 5. Route and UI Changes

### 5.1 Agents page

Keep an admin-only agent management page.

It should support:

- Active agents list.
- Pending/inactive agents list.
- Create agent.
- Activate/deactivate agent.
- Edit broker profile fields.
- Assign team.

Why this matters:

- The easiest onboarding path is admin pre-creates active agents, then agents sign in with Google.
- Unknown users still land in pending, and admin can activate them.

Do not expose `is_admin` as an editable field.

### 5.2 Agent create API

Keep `POST /api/agents`.

Rules:

- Admin-only.
- Creates a broker roster row.
- Requires valid unique email.
- Normalizes email to lowercase.
- Allows `is_active` at creation; default should be `true` for admin-created agents.
- Must not accept `is_admin`.

Suggested create fields:

- `name`
- `email`
- `phone`
- `licenseNumber`
- `licensedCompany`
- `splitPct`
- `teamId`
- `joinedAt`
- `notes`
- `isActive`

### 5.3 Agent update API

Rules:

- Self can update only `name`, `phone`, `licenseNumber`.
- Admin can update broker/admin-owned profile fields and `isActive`.
- Nobody can update `email` through normal edit.
- Nobody can update `isAdmin` through API.

Keep an explicit approve/activate route if it already exists:

- `POST /api/agents/[id]/approve`

It can simply set `is_active = true`.

Also support deactivation through update/delete-style admin action:

- Prefer `PATCH /api/agents/[id]` with `{ isActive: false }`.

### 5.4 Deals UI

Replace hardcoded primary/co-agent form controls with a repeatable agents editor.

Required behavior:

- At least one agent.
- Exactly one primary agent.
- Add/remove agent rows.
- Select active agents only.
- Each row has `sharePct`.
- Total must equal 100 before submit.
- Default for new deal: current user as primary with 100%.

For two-agent deals this should feel as simple as the current primary/co-agent UI.

For three-agent Rental deals, the UI should not require notes hacks.

### 5.5 Deals API

All deal create/update payloads should use:

```ts
agents: Array<{
  agentId: number;
  sharePct: number;
  isPrimary: boolean;
}>
```

Validation:

- Active user required.
- Agents array required.
- Every agent id exists.
- Every agent must be active unless admin is editing old data intentionally.
- Exactly one primary.
- Share total is 100.
- Non-admin creator must include themselves in the agent list.
- Non-admin update/delete requires the current user to personally appear in `deal_agents`.

Transactional shape — **must** be atomic so a `deals` row never exists without its `deal_agents`. Use `db.batch()`:

```ts
// Drizzle/libSQL — db.batch() runs all statements atomically.
// If any one fails, the whole batch rolls back.
const result = await db.batch([
  db.insert(deals).values({ /* ...no agent columns... */ }).returning(),
  ...payload.agents.map((a) =>
    db.insert(dealAgents).values({
      dealId: sql`(SELECT id FROM deals ORDER BY id DESC LIMIT 1)`,
      agentId: a.agentId,
      sharePct: a.sharePct,
      isPrimary: a.isPrimary ? 1 : 0,
      createdAt: new Date().toISOString(),
    })
  ),
]);
```

Update flow (when editing an existing deal): wrap inside the same batch:

```ts
await db.batch([
  db.update(deals).set({ /* ... */ }).where(eq(deals.id, dealId)),
  db.delete(dealAgents).where(eq(dealAgents.dealId, dealId)),
  ...payload.agents.map((a) =>
    db.insert(dealAgents).values({ dealId, ...a }),
  ),
]);
```

If the libSQL client version doesn't expose `db.batch()`, fall back to `db.transaction(async (trx) => { ... })`.

**Do NOT** use plain sequential awaits with manual try/catch rollback. The rollback step itself can fail and orphan rows — this is a known footgun, not a "minor" tradeoff.

Recompute invoice fields only if an invoice is being generated immediately afterward (separate flow, not inside this transaction).

### 5.6 Deal visibility helper (`src/lib/visibility.ts`)

The visibility OR-expression appears in 5+ places (deals list, single deal GET, breakdown, write checks, team MTD aggregation, agent-detail report). **Hand-copying it across endpoints is how data leaks.** Centralize in one module, three exports.

**Business rule:**
- Admin sees all.
- Active non-admin agent sees deals where they personally appear in `deal_agents`.
- Active non-admin agent who is `teams.leader_agent_id` for some team **also** sees deals where any of that team's members appears in `deal_agents` (read-only).
- Inactive agents and `agentId == null` see nothing (the `requireActiveAgent` guard from §4.3 should already block them, this is defense-in-depth).

**Module shape:**

```ts
import { sql, and, eq } from "drizzle-orm";
import { db } from "@/db";
import { agents, dealAgents, deals, teams } from "@/db/schema";

type AccessSession = {
  user: {
    agentId: number | null;
    isAdmin: boolean;
    isActive: boolean;
  };
};

/**
 * SQL fragment for `WHERE` clauses on deal-list queries.
 * Returns `undefined` for admins (no filter — sees all).
 * Otherwise returns the 2-clause OR (self + team-leader read).
 *
 * Usage:
 *   const filter = dealsVisibleToSql(session);
 *   const rows = filter
 *     ? await db.select().from(deals).where(filter)
 *     : await db.select().from(deals);
 */
export function dealsVisibleToSql(session: AccessSession) {
  if (session.user.isAdmin) return undefined;
  if (!session.user.isActive) return sql`1 = 0`; // inactive → see nothing
  const me = session.user.agentId;
  if (me == null) return sql`1 = 0`;
  return sql`(
    ${deals.id} IN (
      SELECT ${dealAgents.dealId} FROM ${dealAgents}
      WHERE ${dealAgents.agentId} = ${me}
    )
    OR ${deals.id} IN (
      SELECT ${dealAgents.dealId}
      FROM ${dealAgents}
      JOIN ${agents} ON ${agents.id} = ${dealAgents.agentId}
      JOIN ${teams}  ON ${teams.id} = ${agents.teamId}
      WHERE ${teams.leaderAgentId} = ${me}
    )
  )`;
}

/**
 * Boolean check for reading a single deal (GET / breakdown / etc).
 * Admin → true. Self in deal_agents → true. Team-leader of any agent on
 * the deal → true. Otherwise false.
 */
export async function canViewDeal(
  session: AccessSession,
  dealId: number,
): Promise<boolean> {
  if (session.user.isAdmin) return true;
  if (!session.user.isActive) return false;
  const me = session.user.agentId;
  if (me == null) return false;

  const selfRow = await db
    .select({ id: dealAgents.dealId })
    .from(dealAgents)
    .where(and(eq(dealAgents.dealId, dealId), eq(dealAgents.agentId, me)))
    .get();
  if (selfRow) return true;

  const leaderRow = await db
    .select({ id: dealAgents.dealId })
    .from(dealAgents)
    .innerJoin(agents, eq(agents.id, dealAgents.agentId))
    .innerJoin(teams,  eq(teams.id,  agents.teamId))
    .where(and(eq(dealAgents.dealId, dealId), eq(teams.leaderAgentId, me)))
    .get();
  return !!leaderRow;
}

/**
 * Boolean check for mutating a single deal (PUT / DELETE).
 * Stricter than canViewDeal: team-leader read access does NOT grant write.
 * Admin → true. Self in deal_agents → true. Otherwise false.
 */
export async function canEditDeal(
  session: AccessSession,
  dealId: number,
): Promise<boolean> {
  if (session.user.isAdmin) return true;
  if (!session.user.isActive) return false;
  const me = session.user.agentId;
  if (me == null) return false;
  const row = await db
    .select({ id: dealAgents.dealId })
    .from(dealAgents)
    .where(and(eq(dealAgents.dealId, dealId), eq(dealAgents.agentId, me)))
    .get();
  return !!row;
}
```

**Use this helper in (no inline SQL duplicates allowed):**
- `/api/deals` (list) → `dealsVisibleToSql`
- `/api/deals/[id]` GET → `canViewDeal`
- `/api/deals/[id]` PUT/DELETE → `canEditDeal`
- `/api/deals/[id]/breakdown` → `canViewDeal` (see §5.6b)
- `/api/deals/[id]/create-invoice` → `canEditDeal`
- Dashboard / monthly report / per-agent report → `dealsVisibleToSql`

**Tests** (`src/lib/__tests__/visibility.test.ts`, recommended):
1. Admin sees a deal they're not on.
2. Active non-admin agent in `deal_agents` → `canView` + `canEdit` both true.
3. Active non-admin team leader (member on deal but leader not personally on deal) → `canView` true, `canEdit` false.
4. Active non-admin not on deal and not leading any team containing a member on deal → both false.
5. Inactive agent (or `agentId === null`) → both false even if there's a `deal_agents` row.

### 5.6b `/api/deals/[id]/breakdown` (visibility gap)

The deal detail page fetches commission breakdown from this separate endpoint. **Without an auth check it leaks deal financials to any logged-in user.**

- Add `await canViewDeal(session, dealId)` at the top. 403 if false.
- Read agents from `deal_agents` (no more `primaryAgentId` / `coAgentId`) and call `computeCommission` with the N-agent array.

### 5.7 Invoice generation

Primary agent is:

```sql
SELECT agents.*
FROM deal_agents
JOIN agents ON agents.id = deal_agents.agent_id
WHERE deal_agents.deal_id = ?
  AND deal_agents.is_primary = 1
LIMIT 1
```

Invoice agent contact fields should come from this primary agent.

Commission allocation should use all `deal_agents` rows.

### 5.8 Reports and dashboard — junction-aware rewrite

Every file below currently uses the old `primaryAgentId` / `coAgentId` columns. Each must be rewritten to read from `deal_agents`. **Naming them explicitly because Codex's first pass missed the JSX one (`deal-breakdown.tsx`) and the upcoming-renewals route.**

| File | What it does | Change |
|---|---|---|
| `src/app/page.tsx` | Dashboard MTD aggregates per logged-in agent | Use `dealsVisibleToSql(session)` from §5.6 for filtering; sum takes from `deal_agents` |
| `src/app/api/reports/monthly/route.ts` | Monthly company report | Sum agent takes by joining `deal_agents`; admin-only |
| `src/app/api/deals/[id]/breakdown/route.ts` | Per-deal commission breakdown | Auth via `canViewDeal` (§5.6b); read agents from `deal_agents`; pass N-agent array to `computeCommission` |
| `src/components/homix/deal-breakdown.tsx` | Renders breakdown UI | Iterate over `agents[]` from props (was hardcoded primary + co) |
| `src/app/api/deals/upcoming-renewals/route.ts` | Upcoming-renewals filtered to logged-in agent | Use `dealsVisibleToSql(session)` from §5.6 |
| `src/app/api/teams/route.ts` | Per-team MTD aggregation | Use `deal_agents` to find member-deals (already covered, restated for completeness) |
| `src/app/api/agents/[id]/report/route.ts` | Per-agent report | "Deals where this agent appears" = `dealId IN (SELECT deal_id FROM deal_agents WHERE agent_id = :id)` |
| `src/lib/reporting.ts` | Helpers (`getAgentTakeForDeal`, `dealInMonth`, etc.) | Rewrite to take `(deal, dealAgents[], agents[])` instead of primary/co IDs |
| `src/lib/aging.ts` | Aging buckets — operates on invoices, not deals | **Likely no change** — verify it doesn't reach into `primaryAgentId` |
| `src/lib/renewals.ts` | Upcoming-renewals filter | **Likely no change** — verify no agent FK references |

Commission math:

- Agent take = `deal.total_commission × deal_agents.share_pct/100 × agent.split_pct/100`
- Company pool from agent = `gross_share - agent_take`
- Deal participants render as a list, not primary/co only.
- Agent filters match any `deal_agents.agent_id`.

Also drop any helpers that reference `referrers`, `dealInvoices`, `users`, `accounts`, `sessions`.

### 5.9 Referrers

Remove:

- `/referrers`
- `/api/referrers`
- `src/db/queries/referrers.ts`
- any navigation entry for referrers

Keep on deals:

- `referrer_name`
- `referrer_payment_info`

### 5.10 Magic link cleanup

Remove:

- Resend provider from auth.
- Magic link form.
- `/login/check-email`.
- `verificationTokens` schema.
- `AUTH_EMAIL_FROM` docs.

This does not affect invoice email sending. Invoice email can still use Resend/Postmark/etc. independently.

---

## 6. File-by-File Implementation Notes

### 6.1 `src/db/schema.ts`

Update schema to:

- Remove Auth.js tables.
- Remove `agents.userId`.
- Keep `agents.isActive`.
- Add unique index/constraint on `agents.email`.
- Add `dealAgents`.
- Remove old primary/co-agent fields from `deals`.
- Remove `referrerId` from `deals`.
- Remove `dealInvoices`.
- Remove `invoiceSendLog.sentByUserId`.

### 6.2 Seed scripts

Update seeds to:

- Seed admin agent rows with `is_active = true`.
- Seed regular known Rental agents with `is_active = true`.
- Never seed `users/accounts/sessions/verificationTokens`.
- Never seed `referrers`.
- Seed deal participants through `deal_agents`.

### 6.3 `src/auth.ts`

Rewrite as described in §4.

Important:

- No adapter.
- Google only.
- Upsert agent by email in JWT callback.
- Preserve inactive state for non-admin existing users.
- Auto-activate admins.
- Include `agentId`, `isAdmin`, and `isActive` in token/session.

### 6.4 `src/auth.config.ts` / proxy / middleware

Keep public paths:

- `/login`
- `/pending`
- `/api/auth`

Protected paths require an active/admin session.

Read the installed Next.js docs under `node_modules/next/dist/docs/` before changing middleware/proxy because this repo uses a newer Next.js version with changed conventions.

### 6.5 Type declarations

Update Auth.js types so `session.user` includes:

- `agentId`
- `isAdmin`
- `isActive`

Do not remove `isActive` from types.

### 6.6 App shell

Do not rely only on a client `useEffect` redirect for inactive users.

Acceptable:

- Keep a small client-side UX redirect as polish.
- Enforce active access on the server for pages/APIs.

### 6.7 Agents routes/pages

Keep:

- `src/app/(app)/agents`
- `src/app/api/agents`
- `src/app/api/agents/[id]`
- `src/app/api/agents/[id]/approve` if currently present

Remove only stale logic tied to `users.user_id` or magic-link approval.

### 6.8 Pending route

Keep:

- `src/app/pending`

Make it work with the simplified `agents.is_active` model.

### 6.9 Delete routes/files

Delete:

- `src/app/login/check-email`
- `src/app/(app)/referrers`
- `src/app/api/referrers`
- `src/db/queries/referrers.ts`
- Auth.js adapter table definitions/usages
- magic-link-only code

Do not delete:

- `/pending`
- `/api/agents`
- `/api/agents/[id]/approve`

---

## 7. Migration Strategy

Project is not in production with real deal/invoice data. Prefer a clean destructive migration over complex backfill. Two things to preserve:

- `buildings` (369 rental building rows already loaded)
- `settings` (admin has manually configured cc_email, from_email, payment info, addresses)

Everything else is fake test data and can be wiped.

### Step 1 — User runs in Turso SQL Console (https://app.turso.tech)

**DROP order matters.** Child tables (with FKs pointing to parents) must drop first, otherwise SQLite refuses with `FOREIGN KEY constraint failed`. The order below is a valid topological sort against the current schema.

```sql
-- ── Phase A: tables that reference others (children) ────────────────────────
DROP TABLE IF EXISTS invoice_send_log;   -- → invoices, → users (FK gone after this)
DROP TABLE IF EXISTS deal_invoices;      -- → deals, → invoices
DROP TABLE IF EXISTS deal_agents;        -- → deals, → agents (in case a previous run created it)
DROP TABLE IF EXISTS invoices;           -- → buildings, → deals
DROP TABLE IF EXISTS deals;              -- → buildings, → agents (primary/co), → referrers
DROP TABLE IF EXISTS referrers;          -- standalone
DROP TABLE IF EXISTS accounts;           -- → users
DROP TABLE IF EXISTS sessions;           -- → users
DROP TABLE IF EXISTS verificationTokens; -- standalone

-- ── Phase B: parent tables (now safe) ───────────────────────────────────────
DROP TABLE IF EXISTS agents;             -- → users (FK), → teams (FK)
DROP TABLE IF EXISTS teams;              -- → agents (leader_agent_id FK)
DROP TABLE IF EXISTS users;              -- root

-- buildings and settings are NOT dropped:
--   • buildings: 369 rows survive untouched.
--   • settings:  admin-configured rows survive. Schema unchanged (key/value pair).
--                The seed will `onConflictDoNothing` for default keys,
--                preserving existing values.
```

> ⚠️ `agents.user_id` and `teams.leader_agent_id` have a near-circular FK relationship through `agents`. SQLite tolerates the order above because we drop `agents` (child of `teams.leader_agent_id`) before `teams`. If Turso ever rejects, run `PRAGMA foreign_keys = OFF;` first, do the DROPs, then `PRAGMA foreign_keys = ON;`.

### Step 2 — User runs `db:seed` locally with prod credentials

```bash
TURSO_DATABASE_URL='libsql://homixlivingsyestem-okjusthere.aws-us-east-1.turso.io' \
TURSO_AUTH_TOKEN='<production-token>' \
npm run db:seed
```

Expected output:
```
Creating tables...
Buildings table already populated (369 rows) — skipping building insert.
Inserting settings...
Skipping demo agents/teams/referrers (set SEED_DEMO=1 to include).
Seed completed!
```

### Step 3 — Sign in via Google with admin email

`agents` row auto-created with `is_admin = 1`, `is_active = 1` (per §2.2 decision table). User lands on `/`.

### For local/dev DB

Same flow, but `TURSO_DATABASE_URL='file:local.db'` (no auth token). After `db:seed` you'll have a fresh schema. If you need demo deals, set `SEED_DEMO=1` and they'll be inserted with `deal_agents` participants.

Because Turso production is not live with real deals/invoices yet, avoid spending time on historical backfill.

---

## 8. Environment

Required:

```env
AUTH_SECRET=
AUTH_GOOGLE_ID=
AUTH_GOOGLE_SECRET=
ADMIN_EMAILS=owner@homixny.com,finance@homixny.com
DATABASE_URL=
DATABASE_AUTH_TOKEN=
```

Remove:

```env
AUTH_EMAIL_FROM=
```

Invoice email environment remains separate. The invoice sender domain, such as `invoice.homixny.com`, does not block Google OAuth. It only matters for sending invoice emails or magic links. Since magic link is removed, it is irrelevant to login.

Deferred:

```env
ALLOWED_EMAIL_DOMAIN=homixny.com
```

Do not add domain whitelist in this refactor unless explicitly requested. The `is_active` roster switch already blocks unknown users from app access.

---

## 9. Acceptance Checklist

Auth:

- [ ] Google sign-in works without Auth.js adapter tables.
- [ ] Magic link UI is gone.
- [ ] Resend provider is gone from auth.
- [ ] `/login/check-email` returns 404.
- [ ] First admin sign-in creates an active admin agent.
- [ ] Existing admin sign-in forces `is_admin = true` and `is_active = true`.
- [ ] Removing an email from `ADMIN_EMAILS` demotes admin on next session refresh.
- [ ] Pre-created active regular agent can sign in and enter the app immediately.
- [ ] Unknown regular Google user creates inactive pending agent row.
- [ ] Inactive user is redirected to `/pending`.
- [ ] Inactive user receives 403 from protected APIs.
- [ ] `/pending` still exists and works.

Agents:

- [ ] `agents.email` is unique and lowercase.
- [ ] `agents.user_id` is gone.
- [ ] `agents.is_active` is kept.
- [ ] Admin can create an active agent for out-of-box onboarding.
- [ ] Admin can activate a pending agent.
- [ ] Admin can deactivate a regular agent.
- [ ] `is_admin` is not editable in UI/API.
- [ ] Regular agent can self-edit only contact fields.
- [ ] `POST /api/agents` is admin-only and works.
- [ ] `/api/agents/[id]/approve` works if retained.

Schema:

- [ ] `users`, `accounts`, `sessions`, `verificationTokens` are removed.
- [ ] `referrers` is removed.
- [ ] `deal_invoices` is removed.
- [ ] `deal_agents` exists with composite primary key.
- [ ] Old primary/co-agent deal columns are removed.
- [ ] `invoice_send_log.sent_by_user_id` is removed.
- [ ] `buildings` and `settings` are preserved or re-seeded.

Deals:

- [ ] Deal create supports one agent.
- [ ] Deal create supports two agents.
- [ ] Deal create supports three or more agents.
- [ ] Exactly one primary agent is required.
- [ ] Share total must equal 100.
- [ ] Non-admin cannot create a deal without themselves in the agent list.
- [ ] Non-admin can edit only deals where they are personally in `deal_agents`.
- [ ] Team leader can read team members' deals but cannot edit unless personally included.

Invoices/reports:

- [ ] Invoice primary-agent fields come from `deal_agents.is_primary`.
- [ ] Invoice send log records `sent_by_email`, not `sent_by_user_id`.
- [ ] Dashboard/report/commission math uses `deal_agents`.
- [ ] Agent filters match any participant, not only old primary/co columns.

Cleanup:

- [ ] `/referrers` returns 404.
- [ ] `/api/referrers` returns 404.
- [ ] No code imports Auth.js adapter schema.
- [ ] No code references `users`, `accounts`, `sessions`, or `verificationTokens`.
- [ ] No code references `agents.userId`.
- [ ] No code assumes only primary/co-agent participants.
- [ ] `npm run build` passes.

Engineering rigor (verify before merging the PR):

- [ ] **Visibility helper is the single source of truth.** `src/lib/visibility.ts` exports `dealsVisibleToSql`, `canViewDeal`, `canEditDeal`. No deal-related route hand-writes the OR-expression. Grep for `leader_agent_id` and `deal_agents.agent_id` in routes — only the helper module should match.
- [ ] **JWT upsert is atomic.** The auth.ts callback uses `onConflictDoNothing` (or equivalent), not plain SELECT-then-INSERT. Two concurrent first-time sign-ins for the same email don't crash with a UNIQUE-constraint exception.
- [ ] **Deal create/update is transactional.** Code uses `db.batch()` (or `db.transaction()`). No path can leave a `deals` row without its `deal_agents` rows, even if the second insert fails.
- [ ] **`/api/deals/[id]/breakdown` returns 403** when called by a non-admin who isn't on the deal and isn't a team leader of someone on the deal. (Don't leak commission financials to any logged-in user.)
- [ ] **Migration DROPs run cleanly** in the order specified in §7 — no `FOREIGN KEY constraint failed` from Turso.
- [ ] `buildings` row count is unchanged after migration (still 369). `settings` rows preserved (admin's cc_email, from_email, etc. still there).

---

## 10. Implementation Order

Implement in this order:

1. Read this file end to end.
2. Read relevant Next.js docs in `node_modules/next/dist/docs/` before touching proxy/middleware/routes.
3. Update schema and generated types.
4. Rewrite auth to Google-only JWT without adapter.
5. Keep and fix `is_active` / `/pending` guard.
6. Update agents API/page for roster onboarding.
7. Add `deal_agents` data model and helpers.
8. Update deal create/update/list/detail.
9. Update invoices.
10. Update dashboard/reports/commission math.
11. Delete referrers and magic-link routes.
12. Update seeds and env docs.
13. Run `npm run build`.
14. Verify every item in §9.

---

## 11. Notes for Future Work

Do not implement these in this refactor:

- Domain whitelist.
- Finance role separate from admin.
- Leader override commission automation.
- Full audit log for profile edits.
- Bulk CSV import UI for agents.
- Granular RBAC.

The current `is_admin + is_active` model is enough for Homix's near-term internal use.

---

## 12. Suggested Commit Message

```text
refactor auth roster and support multi-agent deals

- remove Auth.js adapter and magic-link login
- use agents.email as the single identity key
- keep is_active as a lightweight roster access switch
- support admin pre-created active agents for immediate onboarding
- add deal_agents for N-agent Rental deals
- remove referrers and redundant deal_invoices
- update invoice/reporting logic around primary deal participant
```
