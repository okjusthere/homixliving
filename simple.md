# Refactor Plan — Google-Only Auth + Schema Simplification

> **Audience:** autonomous coding agent (Codex). Read this entire file before writing code. Implement as one cohesive PR. Where the existing codebase has a convention, follow it.

---

## 1. Background

Internal CRM-style tool for a single NYC real-estate brokerage (~50 brokers max). Owner has decided the current implementation is over-engineered for the actual business. This refactor cuts everything that doesn't pull weight, but **keeps real business needs**: multi-agent collaboration, team leaders seeing team members' deals, etc.

The four targets to drop:

1. **Auth.js's mandatory 4 tables (`users`, `accounts`, `sessions`, `verificationTokens`)** are dead weight under JWT-only mode with a single OAuth provider. Drop them entirely by removing the Drizzle adapter.
2. **`agents.user_id` FK + `agents.is_active` flag** confuse "auth identity" with "broker record" and add a manual approval step the team doesn't want. Drop both.
3. **`referrers` table** is overkill for what is, in practice, ad-hoc external people. Inline `referrer_name` + `referrer_payment_info` already exist on `deals` (added in a previous PR). The table is unused.
4. **`deal_invoices` junction table** is redundant — `invoices.deal_id` already records the same link, and the business is 1:1 (one deal → one OP invoice).

Magic-link login (Resend / `verificationTokens` / `/login/check-email`) is also being removed in favor of Google-only. It introduced cookie/prefetch-token edge cases the team doesn't need.

The one **structural addition**: a `deal_agents` junction table replacing the hardcoded `primary_agent_id` / `co_agent_id` columns. Real-world deals occasionally have 3+ collaborating agents (mentor + 2 trainees, cross-team co-listings, etc.). The junction makes the data model match the business and pays off in the future when the team-leader override commission feature ships.

---

## 2. Permission Model (final)

- **Google OAuth only.** No magic link. No passwords.
- **Anyone with a Google account can sign in.** First sign-in auto-creates an `agents` row. Manual agent provisioning is removed entirely (`POST /api/agents` is deleted; the "Add Agent" button is gone).
- **`ADMIN_EMAILS` env var → admin.** Comma-separated list of emails. On every sign-in, **strictly sync** `agents.is_admin` to whether the email is in the env list. Adding an email promotes on next sign-in; removing it demotes on next sign-in. **`is_admin` is never editable through the UI or API** — env var is the single source of truth.
- **Regular agent permissions:**
  - **Read**: see only their own deals + invoices (deals where they appear in `deal_agents`).
  - **Write**: edit/delete only their own deals + invoices.
  - **Self-edit on `agents`**: can change their own `name`, `phone`, `license_number` (personal contact info — used as Reply-To on invoices etc.).
  - **Cannot self-edit**: `email` (locked to Google), `licensed_company` / `split_pct` / `team_id` (admin only), `is_admin` (env-driven).
  - Read access to buildings, teams, settings (for picking from in forms).
- **Team-leader read access**: an agent who is `teams.leader_agent_id` for a team additionally **sees** (read-only) all deals where any of that team's members appears in `deal_agents`. Leader cannot edit/delete those deals — write requires being personally on the deal.
- **Admin permissions:** see all deals/invoices; manage buildings/teams/settings; edit any agent's `licensed_company`, `split_pct`, `team_id`, `joined_at`, `notes` (per §3.3). Cannot change `email` (locked) or `is_admin` (env-driven).
- **No `is_active` / pending / approval flow.** If you can sign in, you have a row. Removing access = manually delete the agent row (and its deals will need to be reassigned first; see §3.5 ON DELETE RESTRICT).
- **Strangers (non-admin Google account)** can sign in; an `agents` row is created with `is_admin = 0`. They see only their own (empty) dashboard. This is acceptable for MVP — domain whitelist deferred (see §8).

---

## 3. Schema — Final State

### 3.1 Tables to keep

| Table | Purpose | Notes |
|---|---|---|
| `buildings` | 369 NYC student-rental buildings | **Data preserved through the migration.** Schema unchanged. |
| `agents` | Single identity-and-broker table | Email is the unique key, replaces both `users` and the old broker record |
| `teams` | Optional broker grouping (label only) | Simplified — see §3.4 |
| `deals` | Lease deals | Drop primary/co-agent columns (moved to `deal_agents`); keep referrer + renewal fields |
| `deal_agents` | **NEW.** Many-to-many: which agents collaborated on a deal, with their share % | Replaces the hardcoded primary + co-agent columns. See §3.5 |
| `invoices` | OP invoices | `deal_id` nullable FK is the single deal link; no more junction table |
| `invoice_send_log` | Audit trail of email sends | `sent_by_user_id` column dropped (FK to deleted `users`); `sent_by_email` snapshot retained — see §3.8 |
| `settings` | Company config (cc_email, from_email, addresses, payment info) | Admin-only writes (§5.14). **Schema unchanged. Existing rows preserved through migration — DO NOT DROP this table.** |

### 3.2 Tables to drop and never recreate

| Table | Why |
|---|---|
| `users` | Auth.js identity. JWT mode + no adapter doesn't need it. |
| `accounts` | OAuth provider linkage. Same. |
| `sessions` | DB sessions. We use JWT. |
| `verificationTokens` | Magic-link tokens. No magic link. |
| `referrers` | Inline `deals.referrer_name` + `deals.referrer_payment_info` covers it. |
| `deal_invoices` | `invoices.deal_id` covers the same relation; business is 1:1. |

### 3.3 `agents` schema (simplified)

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
  joined_at TEXT,
  notes TEXT,
  created_at TEXT,
  updated_at TEXT
);
```

**Removed from previous schema:** `user_id`, `is_active`.
**Added:** `UNIQUE` constraint on `email` (one agent per email; enforces the email-based join key).

**Note on `licensed_company`**: stays on `agents`. In this brokerage every agent works under the same licensed company, so in practice all rows have the same value — admin sets it consistently. Keeping it here (rather than moving to `settings`) avoids churn across forms / invoice path / deal-creation logic. Each `deals` row snapshots the primary agent's value at deal-creation time (see §3.6).

**Edit policy** (mirrors §2):
- Self-edit fields: `name`, `phone`, `license_number`.
- Admin-only fields: `licensed_company`, `split_pct`, `team_id`, `joined_at`, `notes`.
- Locked: `email` (Google-driven), `is_admin` (env-driven).

### 3.4 `teams` schema

```sql
CREATE TABLE teams (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  notes TEXT,
  leader_agent_id INTEGER REFERENCES agents(id) ON DELETE SET NULL
);
```

**Removed from previous schema:** `created_at`, `updated_at` — teams are simple groupings, no audit needs.

**Kept:** `leader_agent_id`. The leader concept is a real business need: the team leader **sees their team members' deals** (visibility expansion — see §3.5, §5.20) even if they're not personally on the deal. The leader has read access to team members' deals; edit/delete still require being personally in `deal_agents`.

**Deferred** (see §8): a `leader_override_pct` column to automate "leader takes a small cut of every team member's deal." Owner is still finalizing the commission math model. When ready, it will be one extra column on `teams` plus a server-side step at deal-creation time to inject a `deal_agents` row for the leader. No structural changes to `deal_agents` itself are anticipated.

### 3.5 `deal_agents` schema (NEW — multi-agent support)

Replaces the previous hardcoded `primaryAgentId` / `coAgentId` columns on `deals`. Supports any number of collaborating agents per deal (1, 2, 3, …) with explicit share percentages.

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

**Invariants** (enforced in API validation, not DB constraints):
- Every deal has **at least one** row in `deal_agents`.
- **Exactly one** row per deal has `is_primary = 1`. The primary agent is the one whose license + company is recorded on the deal/invoice.
- `SUM(share_pct)` for any one deal = `100`. (Floating-point tolerance: ±0.01 OK.)
- `agents.id` referenced must exist; `ON DELETE RESTRICT` prevents deleting an agent who's on any deal (admin must reassign first).

**Visibility rule** (single source of truth for "who can see this deal" — implemented as helpers in §5.20, NOT inline SQL):
- `agents.is_admin = 1` → sees all deals.
- Otherwise, see a deal if **any** of:
  1. Their `agent_id` appears in `deal_agents` for that deal (they personally worked on it), OR
  2. They are the `leader_agent_id` of any team that has at least one member appearing in `deal_agents` for that deal (team-leader read access to members' deals).

**Edit/delete permissions** are stricter: only admin OR a personal `deal_agents` row gives write access. Team-leader read access does NOT extend to write — leaders can see, not edit, their members' deals.

This collapses primary + co + future "support" / "trainee" / "shadow" roles into one consistent model.

### 3.6 `deals` schema (modified)

Drop these columns from the current `deals` schema:
- `primary_agent_id`
- `primary_agent_share_pct`
- `co_agent_id`
- `co_agent_share_pct`
- `referrer_id` (legacy FK; ad-hoc referrer info lives in `referrer_name` / `referrer_payment_info`)

Keep everything else exactly as is (building, unit, tenant, lease, totalCommission, **licensedCompany**, referrer free-text fields, status, source, dealDate, renewal tracking, notes, timestamps).

> Note on `licensed_company`: stays as a TEXT column on `deals`, snapshotted at deal-creation time from the **primary agent's** `agents.licensed_company` (see §3.3). It is **NOT** recomputed on PUT — it's an immutable historical record so existing invoices keep their licensed company even if the agent later changes companies.

### 3.7 `invoices` (no schema change, just documenting the design)

- `deal_id INTEGER REFERENCES deals(id) ON DELETE SET NULL` is the single source of truth for "which deal this invoice came from."
- One invoice → 0 or 1 deal. Never 1:N.
- Invoice fields like `agent_email`, `agent_name`, `agent_phone` are populated from the **primary** agent (the one with `is_primary = 1` in `deal_agents`).

### 3.8 `invoice_send_log` schema (modified)

**Drop the `sent_by_user_id` column.** It currently has `REFERENCES users(id)`, which is impossible after `users` is dropped. The existing `sent_by_email` column already snapshots who sent the invoice — that's enough for audit. Removing the FK column is simpler than refactoring it to point at `agents`.

```sql
CREATE TABLE invoice_send_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  invoice_id INTEGER NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  sent_by_email TEXT,            -- snapshot at send time; agents may be deleted later
  to_recipients TEXT NOT NULL,
  cc_recipients TEXT,
  reply_to TEXT,
  subject TEXT NOT NULL,
  status TEXT NOT NULL,
  error_message TEXT,
  sent_at TEXT NOT NULL
);
CREATE INDEX idx_invoice_send_log_invoice ON invoice_send_log(invoice_id);
```

The `/api/invoices/[id]/send` route must stop writing `sentByUserId`. Only `sentByEmail` (from `session.user.email`) is recorded.

### 3.9 No auth tables

After this refactor, no `auth_*` or `users` / `accounts` / `sessions` / `verificationTokens` tables exist. Identity flows entirely through:
1. The Auth.js JWT cookie (signed with `AUTH_SECRET`, contains `email + agentId + isAdmin + name`)
2. A lookup in `agents` by `email` on every JWT validation

---

## 4. `auth.ts` — Rewrite Without Adapter

**Drop:**
- The `DrizzleAdapter` import and the `adapter:` field in the NextAuth config
- The `Resend` provider import and its conditional inclusion
- The `events.createUser` handler (with no adapter, the event doesn't fire — replaced by inline upsert in jwt callback)
- `events` block entirely (nothing left in it)

**Final shape:**

```ts
import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import { db } from "@/db";
import { agents } from "@/db/schema";
import { eq, sql } from "drizzle-orm";
import { authConfig } from "./auth.config";

const adminEmails = (process.env.ADMIN_EMAILS || "")
  .split(",")
  .map((e) => e.trim().toLowerCase())
  .filter(Boolean);

const googleEnabled =
  !!process.env.AUTH_GOOGLE_ID && !!process.env.AUTH_GOOGLE_SECRET;

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  providers: googleEnabled
    ? [
        Google({
          clientId: process.env.AUTH_GOOGLE_ID!,
          clientSecret: process.env.AUTH_GOOGLE_SECRET!,
          allowDangerousEmailAccountLinking: true,
        }),
      ]
    : [],
  callbacks: {
    ...authConfig.callbacks,
    async jwt({ token, user }) {
      const candidateEmail =
        (typeof user?.email === "string" && user.email) ||
        (typeof token.email === "string" && token.email) ||
        "";
      const email = candidateEmail.trim().toLowerCase();
      if (!email) return token;

      const inAdminList = adminEmails.includes(email);
      const now = new Date().toISOString();

      // Upsert atomically. SELECT-then-INSERT can race when two OAuth callbacks
      // for the same email arrive concurrently (rare but real). agents.email is
      // UNIQUE so the second insert would throw and break sign-in.
      // Drizzle/libSQL `onConflictDoNothing()` lets the second caller fall back
      // to the SELECT branch cleanly.
      await db
        .insert(agents)
        .values({
          name: user?.name || email.split("@")[0],
          email,
          splitPct: 50,
          isAdmin: inAdminList,
          joinedAt: new Date().toISOString().slice(0, 10),
          createdAt: now,
          updatedAt: now,
        })
        .onConflictDoNothing({ target: agents.email });

      let agent = await db
        .select()
        .from(agents)
        .where(sql`lower(${agents.email}) = ${email}`)
        .get();

      if (agent && Boolean(agent.isAdmin) !== inAdminList) {
        // Strict sync: env var is single source of truth for is_admin.
        // Adding email to ADMIN_EMAILS promotes; removing it demotes.
        const [updated] = await db
          .update(agents)
          .set({ isAdmin: inAdminList, updatedAt: now })
          .where(eq(agents.id, agent.id))
          .returning();
        agent = updated || agent;
      }

      token.email = email;
      token.agentId = agent?.id ?? null;
      token.isAdmin = Boolean(agent?.isAdmin);
      token.name = agent?.name || token.name;
      return token;
    },
    async session({ session, token }) {
      session.user.email = (token.email as string) ?? session.user.email;
      session.user.agentId = (token.agentId as number | null) ?? null;
      session.user.isAdmin = Boolean(token.isAdmin);
      session.user.name = (token.name as string) || session.user.name;
      return session;
    },
  },
});
```

**Notes:**
- `session.strategy: "jwt"` already lives in `auth.config.ts`. Don't duplicate.
- The lookup uses `lower(agents.email) = ${email}` for case-insensitive match — Google may return `User@Example.com` casing one day, `user@example.com` another.
- `agents.email` is `UNIQUE` — duplicate inserts can't happen. The `onConflictDoNothing` then re-SELECT pattern handles concurrent first-time sign-ins cleanly.
- `allowDangerousEmailAccountLinking: true` is already in the current code; keep it (single-tenant brokerage where email is the source of truth).

---

## 5. File-by-File Code Changes

### 5.1 `src/db/schema.ts`

- **Delete** these table declarations: `users`, `accounts`, `sessions`, `verificationTokens`, `referrers`, `dealInvoices`.
- **Delete** these type exports: `User`, `Referrer`, `NewReferrer`, `DealInvoice`, `NewDealInvoice`.
- **Modify `agents`**: drop `userId` column, drop `isActive` column, add `.unique()` to the `email` column. **Keep `licensedCompany`** (per §3.3).
- **Modify `teams`**: drop `createdAt` and `updatedAt` columns. **Keep `leaderAgentId`** (per §3.4 — drives team-leader read visibility on deals).
- **Modify `invoices`**: keep `dealId` column (it's the single source of truth now). No other changes.
- **Modify `invoiceSendLog`**: drop the `sentByUserId` column (per §3.8). Keep `sentByEmail` and everything else.
- **Modify `deals`**: drop `primaryAgentId`, `primaryAgentSharePct`, `coAgentId`, `coAgentSharePct` columns. Drop `referrerId` column (legacy FK; ad-hoc referrers live as `referrerName` text now). Keep all other fields including `licensedCompany` (snapshotted from primary agent at deal creation).
- **Add `dealAgents`** table declaration matching §3.5. Use Drizzle's `primaryKey({ columns: [dealId, agentId] })` for the composite PK.
- **Add type exports**: `DealAgent`, `NewDealAgent`.

### 5.2 `src/db/seed.ts`

- **Delete `CREATE TABLE`** statements for: `users`, `accounts`, `sessions`, `verificationTokens`, `referrers`, `deal_invoices`.
- **Update `CREATE TABLE agents`**: match §3.3 exactly. Drop `user_id` and `is_active` columns. Add `email TEXT NOT NULL UNIQUE`. **Keep `licensed_company`**.
- **Update `CREATE TABLE teams`**: match §3.4 exactly. **Keep** `leader_agent_id INTEGER REFERENCES agents(id) ON DELETE SET NULL`. Drop `created_at` / `updated_at`.
- **Update `CREATE TABLE deals`**: drop `primary_agent_id`, `primary_agent_share_pct`, `co_agent_id`, `co_agent_share_pct`, `referrer_id` columns. Keep all other fields.
- **Update `CREATE TABLE invoice_send_log`**: drop the `sent_by_user_id` column (matches §3.8). Other columns unchanged.
- **Add `CREATE TABLE deal_agents`** matching §3.5 exactly, including the `idx_deal_agents_agent` index.
- **Delete the `addColumnIfMissing` ALTER TABLE block entirely.** With the new clean DB, all columns are in the `CREATE TABLE` statements. The migration story going forward is "drop and re-create via DROP TABLE / db:seed" rather than incremental ALTERs.
- **Delete the `referrers` insertion logic** and its `demoReferrers` constant.
- **Delete the demo `users` / `accounts` blocks** (if any exist — check current seed).
- **Delete the `demoTeams` / `demoAgents` blocks** if they reference removed columns. Simplify or remove. Demo seeding is gated behind `SEED_DEMO=1` and isn't run in production.
- Keep the `defaultSettings` insertion logic (still using `onConflictDoNothing`).
- Keep the buildings count check + idempotent insert.

### 5.3 `src/auth.config.ts`

- **Drop** `verifyRequest` from `pages`. Final shape:
  ```ts
  pages: {
    signIn: "/login",
    error: "/login",
  }
  ```
- Keep `trustHost: true`.
- Keep the `authorized` callback in the `callbacks` block.
- Update `PUBLIC_PATHS` in `authorized`: drop `/pending` if present. Keep `/login`, `/api/auth`, `/_next`, `/favicon`.

### 5.4 `src/auth.ts`

See §4 above for the rewrite.

### 5.5 `src/types/next-auth.d.ts`

- Drop `userId` from the type augmentations.
- Drop `isActive` from the type augmentations.
- Keep `agentId: number | null`, `isAdmin: boolean`, `email: string`, `name: string` on `session.user` and the JWT.

### 5.6 `src/app/login/page.tsx`

- **Delete** the magic-link form and all related state (`email`, `submittingEmail`, `handleEmailSubmit`).
- **Delete** the `/api/auth/providers` fetch + the `providers` state — Google is hardcoded.
- **Delete** `useSearchParams` and the entire `error` query-param banner. Old `AccessDenied` semantics came from the now-removed `is_active` flow; OAuth-cancellation just lands you back on `/login` with the form ready to retry, no message needed.
- **Delete** the `Suspense` wrapper — no `useSearchParams`, no async-during-render hooks, so the wrapper has nothing to suspend on.
- Convert `LoginPage` to a sync default export with no inner `LoginInner` split. Single function, simple JSX.
- Layout: brand mark, headline ("Welcome back."), one prominent **Continue with Google** button (centered, full-width). That's it.
- The Google button handler stays as `signIn("google", { redirect: true, redirectTo: "/" })`. If signIn throws synchronously (rare, e.g. network), `toast.error("Could not sign in with Google")` like the existing handler.

### 5.7 Delete entire directories

- `src/app/login/check-email/` — entire folder gone.
- `src/app/pending/` — entire folder gone.
- `src/app/referrers/` — entire folder gone.
- `src/app/api/agents/[id]/approve/` — entire folder gone.
- `src/app/api/referrers/` — entire folder gone.

### 5.8 `src/components/app-shell.tsx`

- **Delete** the `useEffect` that redirects users with `!session.user.isActive` to `/pending`. (No more inactive concept.)
- Update `NAV_FREE_PREFIXES`: drop `/pending`. Keep `/login`.

### 5.9 `src/components/nav.tsx`

- Drop any "Referrers" link if present.
- Keep the `Agents` link `adminOnly: true`.
- No "pending approvals" badge or count.

### 5.10 `src/app/agents/page.tsx` & `src/app/agents/[id]/page.tsx`

Both pages get the same treatment:
- **Remove** the entire "Pending approvals" section in `agents/page.tsx` (the card, the `pending` array, the `handleApprove` / `handleRevoke` handlers, the `Approve` button).
- **Remove** the "Add Agent" button and "New Agent" modal from `agents/page.tsx`. New agents come exclusively from Google sign-in.
- The agents list shows all agents in one section with `Edit` / `Delete` buttons.
- **Edit dialog/form** on both pages:
  - `email`: render as read-only with helper text "Email is tied to Google sign-in and cannot be changed."
  - `is_admin`: not shown / not editable (env-driven). Optionally show a small badge "Admin" next to the agent's name (read from row data) so admin can see who's an admin without being able to change it.
  - **Self-edit fields** (current logged-in agent editing their own row): `name`, `phone`, `license_number`. Show as enabled inputs.
  - **Admin-only fields** (only logged-in admin editing any row): `licensed_company`, `split_pct`, `team_id`, `joined_at`, `notes`. Show as enabled inputs only when admin; render as disabled for non-admin.
- Remove any `isActive` filter logic — show all agents in one list.

### 5.11 `src/app/api/agents/route.ts` & `src/app/api/agents/[id]/route.ts`

- **DELETE the `POST /api/agents` endpoint entirely.** New agents only come from the JWT callback at sign-in time. Manual creation has no use case.
- **Remove** any logic referencing `isActive` (filter, set, update).
- **`PUT /api/agents/[id]`** — split payload by sensitivity:
  - **Always rejected** (return 400): any payload that includes `email`, `is_admin`, or `id`. (Email is locked; is_admin is env-driven.)
  - **Self-edit allowed** (caller is the agent being edited, identified by `session.user.agentId === paramId`): `name`, `phone`, `license_number`.
  - **Admin-only fields** (caller must be admin): `licensed_company`, `split_pct`, `team_id`, `joined_at`, `notes`. If a non-admin caller passes any of these, return 403.
  - **Cross-agent edit**: only admin can PUT a row that isn't their own. Non-admin trying to edit someone else → 403.
- **`DELETE /api/agents/[id]`** — admin only. The DB-level `ON DELETE RESTRICT` on `deal_agents.agent_id` will block deletion if the agent is on any deal; in that case the API returns 409 with a message like "This agent is on N deals; reassign them before deleting." (Admin's job to manually edit each deal first.)
- **`PUT /api/agents` (collection)** — current code has a collection-level PUT/DELETE used by older flows. **Delete both methods entirely.** All agent edits go through `[id]` routes from now on.
- **`GET` endpoints**: keep `licensed_company` in the response shape (still on the schema).

### 5.12 `src/app/api/teams/route.ts` & `src/app/api/teams/[id]/route.ts`

- **Remove** references to `createdAt`, `updatedAt` (those columns are gone).
- **Keep** `leaderAgentId` handling — POST/PUT bodies accept `name`, `notes`, **and** `leaderAgentId` (nullable).
- **Validation**: when `leaderAgentId` is provided, verify the agent exists. Optional but recommended: verify the agent's `team_id` matches this team (i.e. only a member of the team can lead it). If you skip the second check, document it.
- **GET** must keep returning the per-team aggregate object: `{ team, leader, members, memberCount, mtdDeals, mtdTake }`. The MTD aggregation logic must be **rewritten** to use the new `deal_agents` junction (not the deleted `primaryAgentId` / `coAgentId` columns):
  ```ts
  // Pseudo-SQL
  // mtdDeals = COUNT(DISTINCT deals.id) where any deal_agents.agent_id is a member AND deal is in current month
  // mtdTake  = SUM(per-agent take) for member agents on those deals
  ```
  Use `getAgentTakeForDeal` from `lib/reporting.ts` (which itself is being rewritten in §5.22 to take an N-agent array). For each deal in scope, sum the takes for agents who are members of this team.
- **DELETE** flow unchanged: null out `agents.team_id` for any agent in this team, then delete the team row.

### 5.13 `src/app/teams/page.tsx`

- **Keep** the existing layout: per-team row showing `Team Name / Members / MTD Deals / MTD Take` and a `Leader: <name>` subtitle.
- **Keep** the leader dropdown in the Add/Edit Team modal — leader selection comes from this team's members (or "Unassigned").
- **Keep** the expand-row behavior that shows member cards.
- **Remove** any timestamp displays (created_at / updated_at no longer exist).
- The MTD numbers come from the rewritten API (§5.12) which uses `deal_agents` — no UI logic change here.

### 5.14 `src/app/api/settings/route.ts` (and `src/app/settings/page.tsx`)

- **API** (`/api/settings/route.ts`):
  - `GET`: any authenticated user (no change).
  - `POST` / `PUT` / `DELETE`: at the top, check `if (!session?.user?.isAdmin) return 403`.
- **UI** (`/settings/page.tsx`):
  - For non-admin users: render the entire settings page as **read-only** — all inputs disabled, no Save button (or Save button visible but `onSubmit` returns immediately). Replace it with a small note: "Only admins can edit settings."
  - Admin sees the same form with editable inputs.
  - No new `licensed_company` field needed — that field stays on `agents` (per §3.3).

### 5.15 `src/app/api/deals/route.ts` (multi-agent payload)

- **Drop** `referrers` import. Drop the `referrers` lookup and validation.
- **Drop** `referrerId` from `cleanDealPayload`.
- **Drop** the old `primaryAgentId` / `primaryAgentSharePct` / `coAgentId` / `coAgentSharePct` validation. Replace with a single `agents` array.

**Request payload** (POST/PUT body) shape going forward:
```ts
{
  buildingId, unit, tenantName, ...,
  totalCommission,
  agents: [
    { agentId: number; sharePct: number; isPrimary: boolean }
  ],
  referrerName, referrerType, referrerAmount, referrerPaymentInfo,
  ...
}
```

**Validation rules in `cleanDealPayload`**:
- `agents` must be an array of length ≥ 1.
- Each `agentId` must exist in `agents` table.
- Exactly one entry has `isPrimary === true`.
- `sum(sharePct) === 100` (within ±0.01 tolerance).
- All `agentId` values must be unique within the array.
- Compute `licensedCompany` server-side: look up the **primary agent** (the one with `isPrimary=true` in the payload) and copy their `agents.licensed_company` into `deals.licensed_company`. Do NOT trust a client-supplied value.

**POST flow** — must be transactional so the deal never exists without its agents:

```ts
// libSQL/Drizzle pattern — `db.batch()` runs all statements atomically.
// If any one fails, the whole thing rolls back.
const [insertDeal, ...insertAgents] = await db.batch([
  db.insert(deals).values({ /* ... no agent columns ... */ }).returning(),
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

If `db.batch()` is unavailable in the version of `@libsql/client` we use, fall back to:
```ts
const tx = await db.transaction(async (trx) => {
  const [created] = await trx.insert(deals).values({...}).returning();
  await trx.insert(dealAgents).values(payload.agents.map(a => ({
    dealId: created.id, ...
  })));
  return created;
});
```

**Do NOT** use plain sequential awaits with manual try/catch rollback — it's a known footgun (rollback step itself can fail and orphan rows).

**GET flow** (list endpoint):
- Auth check (existing).
- **Use the `dealsVisibleToSql(session)` helper from §5.20** — do NOT hand-write the OR-expression here. Admin gets `undefined` (no filter); non-admin gets the 2-clause WHERE fragment that covers self + team-leader read.
- Drop the `referrerById` map and the `referrer:` field from the response payload. Frontend reads `deal.referrerName`.
- Include the `deal_agents` rows in each deal's response (joined with `agents` for name + email + splitPct), so the list page can render "X, Y & Z" labels.
- **`invoiceCount` per deal**: the current implementation joins `dealInvoices` and counts. After this refactor, count via `invoices.deal_id`:
  ```ts
  // before: COUNT via deal_invoices junction
  // after:
  const invoiceCounts = await db
    .select({ dealId: invoices.dealId, count: count() })
    .from(invoices)
    .where(isNotNull(invoices.dealId))
    .groupBy(invoices.dealId);
  // then merge into the deals response by dealId
  ```

### 5.16 `src/app/api/deals/[id]/route.ts` (multi-agent CRUD)

- **Drop** `referrers` import + lookup.
- **Drop** the `dealInvoices` import + table query (the linked-invoices block).
- For "linked invoices" in the response, query `invoices` directly: `SELECT * FROM invoices WHERE deal_id = ?`.
- **GET single deal**: also fetch `deal_agents` rows joined with `agents`. Return as `agents: [{ agentId, sharePct, isPrimary, name, email, splitPct, licensedCompany }, ...]`.
- **PUT (update deal)**:
  - Validate the same `agents` array as POST (§5.15).
  - In a transaction: `DELETE FROM deal_agents WHERE deal_id = ?`, then `INSERT` the new rows.
  - Update the deals row.
  - **Do NOT modify `deals.licensed_company`.** It's a snapshot from creation time — see §3.6.
- **DELETE flow**: drop the `DELETE FROM deal_invoices WHERE deal_id = ?` step. `deal_agents` rows are auto-deleted via `ON DELETE CASCADE`. Just `UPDATE invoices SET deal_id = NULL WHERE deal_id = ?` to unlink invoices, then delete the deal row.
- **Visibility** (use the helpers from §5.20 — do NOT inline SQL here):
  - **GET single deal**: `await canViewDeal(session, dealId)` — covers admin, self (in deal_agents), and team-leader read. 403 if false.
  - **PUT / DELETE**: `await canEditDeal(session, dealId)` — only admin OR personal `deal_agents` row. **Team-leader read access does NOT grant write access.** 403 if false.

### 5.16b `src/app/api/deals/[id]/breakdown/route.ts` (visibility gap)

The deal detail page fetches commission breakdown from this separate endpoint. Without an auth check it leaks deal financials to any logged-in user.

- Add `await canViewDeal(session, dealId)` at the top (same helper as §5.16). 403 if false.
- Update the breakdown computation to read agents from the new `deal_agents` junction (no more `primaryAgentId`/`coAgentId`) and call the rewritten `computeCommission` from §5.21.

### 5.17 `src/app/api/deals/[id]/create-invoice/route.ts`

- **Keep** the cancelled-deal guard.
- **Drop** the `dealInvoices` insert at the bottom. The `invoices.deal_id` field set on the new invoice already establishes the link.
- **Look up the primary agent** from `deal_agents` (where `is_primary = 1`) — use that agent's `email`, `name`, `phone` to populate the new invoice's `agent_email` / `agent_name` / `agent_phone` fields. (Previously this used the now-deleted `primaryAgentId` column on `deals`.)
- The new invoice's `licensed_company` field is copied from `deals.licensed_company` (already snapshotted at deal creation — see §3.6 / §5.15). Do NOT read from settings or agents at this point.
- If no primary agent is found (shouldn't happen — validation guarantees one — but be defensive), return 500 with a clear error.

### 5.18 `src/app/deals/[id]/page.tsx` (render N agents)

- **Drop** the `referrer` field from the payload destructuring; drop the `referrer.name` fallback. Use only `deal.referrerName`.
- **Drop** the `primaryAgent` / `coAgent` destructuring. Replace with `agents: [...]` array from §5.16.
- Render the agents section as a list (loop over the array) showing each agent's name, share %, take amount, with the primary one visually marked (e.g. small `Primary` pill).
- Replace the linked-invoices logic — instead of querying `dealInvoices`, the API now returns invoices directly. Adjust the type and rendering accordingly.
- Update the Commission Breakdown card to iterate over all agents.

### 5.19 `src/app/deals/new/page.tsx` (multi-agent form)

Currently the form has hardcoded inputs for one primary + one optional co-agent. Replace with a dynamic agents list:

- State: `agentRows: { agentId: number | null; sharePct: number; isPrimary: boolean }[]`. Initialize with one row at 100% / `isPrimary: true`.
- UI:
  - Render `agentRows` as a list. Each row has: agent dropdown, share % input, "Primary" radio button, "Remove" button (disabled if it's the only row).
  - "+ Add agent" button below the list. Clicking adds a new row with a default share split (e.g. if 1 agent at 100%, adding makes it 50/50; if 2 agents at 50/50, adding makes it 33/33/34 — round so sum stays 100).
  - The "Primary" radio is mutually exclusive across rows (only one agent is primary).
- Validation (client-side, before submit):
  - At least one agent.
  - Exactly one is primary.
  - All agentId values populated.
  - `sum(sharePct) === 100`.
  - No duplicate agentIds.
- Submit body sends `agents: agentRows.map(r => ({ agentId: r.agentId!, sharePct: r.sharePct, isPrimary: r.isPrimary }))`.
- The Deal Summary sidebar updates to show a list of all agents (with avatars / initials / names / share %).

The old `hasCoAgent`, `primaryAgentId`, `primaryAgentSharePct`, `coAgentId` state can be deleted.

### 5.20 `src/lib/visibility.ts` (NEW — single source of truth for deal access)

The visibility OR-expression appears in 5+ places (deals list, single deal GET, breakdown, PUT/DELETE write checks, team MTD aggregation, agent-detail report). **Hand-copying it across endpoints is how data leaks.** Centralize.

**Three exports:**

```ts
import { sql, and, eq } from "drizzle-orm";
import { db } from "@/db";
import { agents, dealAgents, deals, teams } from "@/db/schema";

/**
 * SQL fragment for `WHERE` clauses on deal-list queries.
 * Returns `undefined` for admins (no filter — sees all).
 * Otherwise returns the 2-clause OR: I'm on the deal, or I lead a team
 * with a member on the deal.
 *
 * Usage:
 *   const filter = dealsVisibleToSql(session);
 *   const rows = filter
 *     ? await db.select().from(deals).where(filter)
 *     : await db.select().from(deals);
 */
export function dealsVisibleToSql(session: { user: { agentId: number | null; isAdmin: boolean } }) {
  if (session.user.isAdmin) return undefined;
  const me = session.user.agentId;
  if (me == null) return sql`1 = 0`; // no agent record → see nothing
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
 * Boolean check before reading a single deal.
 * Admin → true. Self in deal_agents → true. Team-leader of any agent on the deal → true.
 * Use in single-deal GET (§5.16) and breakdown route (§5.16b).
 */
export async function canViewDeal(
  session: { user: { agentId: number | null; isAdmin: boolean } },
  dealId: number
): Promise<boolean> {
  if (session.user.isAdmin) return true;
  const me = session.user.agentId;
  if (me == null) return false;

  // Self check
  const selfRow = await db
    .select({ id: dealAgents.dealId })
    .from(dealAgents)
    .where(and(eq(dealAgents.dealId, dealId), eq(dealAgents.agentId, me)))
    .get();
  if (selfRow) return true;

  // Team-leader check
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
 * Boolean check before mutating a single deal (PUT / DELETE).
 * Stricter than canViewDeal: team-leader read access does NOT grant write.
 * Admin → true. Self in deal_agents → true. Otherwise false.
 */
export async function canEditDeal(
  session: { user: { agentId: number | null; isAdmin: boolean } },
  dealId: number
): Promise<boolean> {
  if (session.user.isAdmin) return true;
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

**Tests** (`src/lib/__tests__/visibility.test.ts`, optional but recommended):
- Admin sees a deal they're not on.
- Non-admin agent in deal_agents → canView + canEdit both true.
- Non-admin team leader (member on deal but leader not on deal) → canView true, canEdit false.
- Non-admin not on deal and not leading any team containing a member on deal → both false.
- Agent with `agentId === null` (race-condition first-sign-in) → both false.

### 5.21 `src/lib/commission.ts` (rewrite for N agents)

The current `computeCommission` takes a primary + optional co structure. Rewrite it to accept an N-agent array.

**New signature**:
```ts
type CommissionInput = {
  totalCommission: number;
  agents: Array<{
    agentId: number;
    sharePct: number;       // 0–100; sums to 100 across array
    splitPct: number;       // agent.split_pct from agents table
  }>;
  referrer: {
    type: "percent" | "flat";
    amount: number;
  } | null;
};

type CommissionBreakdown = {
  totalCommission: number;
  referrerCut: number;
  netAfterReferrer: number;
  agents: Array<{
    agentId: number;
    sharePct: number;
    splitPct: number;
    grossShare: number;     // share_pct% of net_after_referrer
    agentTake: number;      // grossShare × split_pct/100
    companyPool: number;    // grossShare − agentTake
  }>;
  agentTakeTotal: number;
  companyPoolTotal: number;
};
```

**Algorithm**:
1. `referrerCut`: percent → `totalCommission * (referrer.amount / 100)`; flat → `referrer.amount`. 0 if no referrer.
2. `netAfterReferrer = totalCommission - referrerCut`.
3. For each agent: `grossShare = netAfterReferrer * (sharePct / 100)`; `agentTake = grossShare * (splitPct / 100)`; `companyPool = grossShare - agentTake`.
4. Sum across agents for totals.

### 5.22 Reporting / dashboard / breakdown — junction-aware rewrite

These specific files still use the old `primaryAgentId` / `coAgentId` columns. Each must be rewritten to read from `deal_agents`:

| File | What it does | Change |
|---|---|---|
| `src/app/page.tsx` | Dashboard MTD aggregates per logged-in agent | Replace primary/co filter with: `dealId IN (SELECT deal_id FROM deal_agents WHERE agent_id = me)` |
| `src/app/api/reports/monthly/route.ts` | Monthly company report | Sum agent takes by joining `deal_agents` |
| `src/app/api/deals/[id]/breakdown/route.ts` | Per-deal commission breakdown | Read agent list from `deal_agents` (joined with `agents` for splitPct), pass to `computeCommission` from §5.21. Auth via `canViewDeal` (§5.16b) |
| `src/components/homix/deal-breakdown.tsx` | Renders breakdown | Iterate over N agents from props (was hardcoded primary + co) |
| `src/app/api/deals/upcoming-renewals/route.ts` | Upcoming-renewals filtered to logged-in agent | Use `dealsVisibleToSql(session)` from §5.20 |
| `src/app/api/teams/route.ts` | Per-team MTD aggregation | Use `deal_agents` to find member-deals (already covered in §5.12, restated here for completeness) |
| `src/app/api/agents/[id]/report/route.ts` | Per-agent report | "Deals where this agent appears" = `dealId IN (SELECT deal_id FROM deal_agents WHERE agent_id = :id)` |
| `src/lib/reporting.ts` | Helpers (`getAgentTakeForDeal`, `dealInMonth`, etc.) | Rewrite to take `(deal, dealAgents[], agents[])` instead of primary/co IDs |
| `src/lib/aging.ts` | Aging buckets — operates on invoices, not deals directly | **Likely no change** — verify it doesn't reach into `primaryAgentId` |
| `src/lib/renewals.ts` | Upcoming-renewals filter | **Likely no change** — verify no agent FK references |

Also drop any helpers that reference `referrers`, `dealInvoices`, `users`, `accounts`, `sessions`.

### 5.23 Tests

- Update `src/lib/__tests__/commission.test.ts` for the new signature (§5.21). Add cases:
  - 1-agent deal at 100% share / 50% split / no referrer.
  - 2-agent deal 50/50 share / 50% split each / no referrer.
  - 3-agent deal 50/30/20 share / different splits each / 10% referrer.
  - Edge: rounding when share doesn't divide cleanly.
- All existing test scenarios should be re-expressible with the new array-based input.
- (Optional but recommended) `src/lib/__tests__/visibility.test.ts` — see §5.20 for the 5 scenarios to cover.

---

## 6. Database Migration Steps

The DB has 369 buildings worth of useful data. **Everything else is fake.** The migration plan: DROP every non-buildings/non-settings table, then re-create from the new schema via `db:seed`.

### Step 1 — User runs in Turso SQL Console (https://app.turso.tech)

**Order matters** — child tables (with FKs pointing to parents) must drop first, otherwise SQLite refuses with `FOREIGN KEY constraint failed`. The order below is a valid topological sort against the current schema.

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
--   • settings:  the owner has manually configured cc_email, from_email,
--                payment info etc. Schema unchanged (key/value pair).
--                The seed will `onConflictDoNothing` for default keys,
--                preserving existing values.
```

> ⚠️ `agents.user_id` and `teams.leader_agent_id` are mutual / circular through `agents`. SQLite tolerates the order above because we drop `agents` (child of `teams.leader_agent_id`) before `teams`. If Turso ever rejects, run `PRAGMA foreign_keys = OFF;` first, do the DROPs, then `PRAGMA foreign_keys = ON;`.

### Step 2 — User runs locally with prod credentials

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

### Step 3 — User signs in via Google

Use an email that's in `ADMIN_EMAILS`. The `agents` row is auto-created with `is_admin = 1`. User lands on `/`.

---

## 7. Acceptance Criteria

After this refactor + migration:

- [ ] `living.homixny.com/login` shows ONE Google button. No email input. No magic link copy.
- [ ] Clicking Google → consent screen → returns to `/` (not `/login/check-email`).
- [ ] First sign-in with an `ADMIN_EMAILS` email creates an `agents` row with `is_admin = 1`.
- [ ] Second sign-in with the same email reuses that row (no duplicate insert).
- [ ] Sign-in with a non-admin Google account creates an `agents` row with `is_admin = 0`. User lands on `/` and sees their own (empty) dashboard. They can create deals and invoices.
- [ ] An admin sees all deals/invoices across all agents. A non-admin sees deals where they appear in `deal_agents` plus, if they're a team leader, deals where any of their team members appears in `deal_agents`.
- [ ] `/pending`, `/login/check-email`, `/referrers`, `/api/agents/[id]/approve`, `/api/referrers` all return 404.
- [ ] `/agents` page does not show a "Pending approvals" section.
- [ ] Editing an agent does NOT allow changing the `email` field — UI shows it read-only, API rejects with 400.
- [ ] **Self-edit**: an agent can update their own `name`, `phone`, `license_number` via PUT. They cannot change `licensed_company`, `split_pct`, `team_id`, `joined_at`, `notes` (API returns 403 if attempted).
- [ ] **Admin-only fields**: admin can update any agent's `licensed_company`, `split_pct`, `team_id`, `joined_at`, `notes`.
- [ ] **`is_admin` is uneditable**: PUT payloads with `is_admin` are rejected (400). Admin status flips only via `ADMIN_EMAILS` env var on next sign-in (both promotion AND demotion).
- [ ] **`POST /api/agents` returns 404** (endpoint deleted).
- [ ] `/agents` page does NOT have an "Add Agent" button.
- [ ] **`licensed_company`** stays on `agents` (admin-editable per agent on `/agents`); each new deal snapshots the **primary agent's** value into `deals.licensed_company`. Existing invoices retain their snapshot.
- [ ] **`/api/deals/[id]/breakdown`** returns 403 when called by a non-admin who isn't on the deal and isn't a team leader of someone on the deal.
- [ ] **Visibility helpers** (`src/lib/visibility.ts`) are the only place the OR-expression lives. Every deal-related route imports from there — no inline SQL duplicates.
- [ ] **`invoice_send_log`** has no `sent_by_user_id` column; the send route no longer writes it; only `sent_by_email` is recorded.
- [ ] **JWT upsert** uses `onConflictDoNothing` (no UNIQUE-constraint crash on concurrent first sign-ins).
- [ ] Migration DROPs in §6 run cleanly without `FOREIGN KEY constraint failed`.
- [ ] `npx tsc --noEmit` passes with zero errors.
- [ ] `npm test` passes (commission math, including the new multi-agent test cases from §5.23).
- [ ] Creating a deal at `/deals/new` works with the inline referrer text + payment-info inputs.
- [ ] **Multi-agent deals**: creating a deal with 1 agent works (auto-100% share, is_primary=1). Creating with 2 agents at 60/40 works. Creating with 3 agents at 50/30/20 works. Each collaborating agent sees the deal in their list. Sum-not-100 payload returns 400.
- [ ] **Visibility (self)**: a non-admin agent sees a deal if they appear in that deal's `deal_agents` rows.
- [ ] **Visibility (team leader)**: an agent who is `teams.leader_agent_id` for a team also sees deals where any member of that team is in `deal_agents`, even if the leader isn't personally on the deal.
- [ ] **Write protection for team leader**: if the leader is NOT personally in the deal's `deal_agents` rows, PUT/DELETE on that deal returns 403.
- [ ] **Teams page MTD aggregation**: `/teams` shows correct `mtdDeals` and `mtdTake` numbers for each team, computed by joining through `deal_agents`.
- [ ] **Primary-agent enforcement**: payload with 0 primaries or 2 primaries returns 400.
- [ ] **Invoice generated from a deal** uses the primary agent's name/email/phone (looked up via `is_primary = 1` in `deal_agents`).
- [ ] Generating + sending an invoice from a deal works end-to-end. No "Failed to execute 'json' on 'Response'" toast.
- [ ] No reference to `users`, `accounts`, `sessions`, `verificationTokens`, `referrers`, `dealInvoices`, `deal_invoices`, `primaryAgentId`, `coAgentId` in any file under `src/` (except as comments referring to the removed concepts, which are also fine to clean up).

---

## 8. Out of Scope (deferred)

- **Domain whitelist** (e.g. `ALLOWED_EMAIL_DOMAIN=homixny.com`) — add later if random Google sign-ins become a problem.
- **Team hierarchy** (`teams.parent_team_id`) — defer until the brokerage actually has nested regions.
- **Team-leader override commission cut** (a leader auto-takes a small % of every team member's deal): owner is still finalizing the math model (off-the-top vs. from-agent-split, per-team vs. per-deal, leader-also-on-deal handling, multi-team-deal handling). When ready, the implementation is ~1 extra column on `teams` (`leader_override_pct`) plus a server-side step in the deal-creation flow to inject a `deal_agents` row for the leader. **Do not implement this in the current PR.**
- **Per-agent payout tracking** (`deal_agents.paid_at`, `deal_agents.payout_method`) — defer. The schema is in place to add these columns later without touching `deals` or any other table.
- **Audit log for admin actions** on agents / settings / teams — defer.
- **Soft-delete for agents** (`deleted_at` column) — defer; current deletion is hard, blocked by `deal_agents` FK if the agent is on any deal.
- **Tests for the new auth flow** — defer (commission math test stays).
- **`buildings` schema cleanup** — out of scope; the 369 rows must survive untouched.

---

## 9. Environment Variables

### Keep
- `TURSO_DATABASE_URL`
- `TURSO_AUTH_TOKEN`
- `AUTH_GOOGLE_ID`
- `AUTH_GOOGLE_SECRET`
- `AUTH_SECRET` — must be set in production (≥32 chars random); if missing, sessions break across function instances.
- `ADMIN_EMAILS` — comma-separated list of admin emails.
- `RESEND_API_KEY` — still used for invoice email (NOT for auth).
- `FROM_EMAIL` — invoice from-address (e.g. `invoice@homixny.com`).

### Drop (if anyone added them)
- `AUTH_EMAIL_FROM` — was the magic-link from-address.

---

## 10. Implementation Order (suggested)

To keep the diff reviewable, follow this order (steps that must be green before continuing are marked **GATE**):

1. **Schema + seed** (`src/db/schema.ts`, `src/db/seed.ts`) — new `deal_agents` table; drop `users`/`accounts`/`sessions`/`verificationTokens`/`referrers`/`deal_invoices`; deals column drops; `invoice_send_log.sent_by_user_id` drop; `agents` keeps `licensed_company`. **GATE: `tsc --noEmit` clean.**
2. **Visibility helper** (`src/lib/visibility.ts` per §5.20) + visibility tests. Must come before any consumer.
3. **Commission lib rewrite** (`src/lib/commission.ts` per §5.21) + tests. **GATE: `npm test` passes.**
4. **Auth rewrite** (`src/auth.ts`, `src/auth.config.ts`, `src/types/next-auth.d.ts`).
5. Login page simplification (`src/app/login/page.tsx`).
6. Delete dead directories (login/check-email, pending, referrers, agents/[id]/approve, api/referrers).
7. App-shell + nav cleanup.
8. Agents page + `/agents/[id]` page (drop pending UI, lock email field, restore self-edit policy from §5.10).
9. Agents API (drop POST + collection PUT/DELETE; PUT `[id]` enforces field policy from §5.11).
10. Teams page + APIs (per §5.12 — keep `leader_agent_id`; rewrite MTD aggregation via `deal_agents`).
11. Settings APIs + page (admin-only writes; no licensed_company UI add).
12. **Deals APIs** (`/api/deals/route.ts`, `/api/deals/[id]/route.ts`) — multi-agent payload + junction read/write via `db.batch()` + `dealsVisibleToSql` / `canEditDeal` from §5.20.
13. **`/api/deals/[id]/breakdown` route** — add `canViewDeal` check; rewrite breakdown to use `deal_agents` + new `computeCommission`.
14. **Deals new-form rewrite** (`/deals/new/page.tsx`) — dynamic agent rows.
15. **Deals detail page** (`/deals/[id]/page.tsx`) — render N agents + breakdown.
16. Create-invoice route (drop `deal_invoices` insert; primary agent lookup via junction; `licensed_company` from `deals.licensed_company` snapshot).
17. Reporting / dashboard / monthly / upcoming-renewals — see §5.22 file table for each.
18. **GATE: `tsc --noEmit` clean. `npm test` passes.**
19. Commit, push.

The user (project owner) handles steps in §6 (Turso SQL + db:seed against prod) before opening the deployed app.

---

## 11. Commit Message Template

```
refactor: drop adapter, auth tables, referrers, deal_invoices

Single-tenant brokerage with Google-only OAuth + JWT sessions doesn't need
the Auth.js adapter or its 4 tables. Identity is now `agents` keyed by
email; Auth.js writes nothing to the DB.

Schema changes:
- Drop tables: users, accounts, sessions, verificationTokens, referrers,
  deal_invoices.
- Add table: deal_agents (deal_id, agent_id, share_pct, is_primary).
  Replaces the hardcoded primary/co-agent columns on deals; supports
  any number of collaborating agents per deal with explicit shares.
- agents: drop user_id and is_active columns; add UNIQUE on email;
  keep licensed_company (still per-agent, admin-editable).
- teams: drop created_at and updated_at columns; keep leader_agent_id
  (now backs a team-leader read-visibility extension on deals).
- settings: schema unchanged. Existing rows preserved — table is NOT
  dropped during migration.
- invoice_send_log: drop sent_by_user_id column (FK to dropped users
  table). sent_by_email already snapshots the sender for audit.
- deals: drop primary_agent_id, primary_agent_share_pct, co_agent_id,
  co_agent_share_pct, referrer_id columns.
- invoices.deal_id is now the only deal↔invoice link.

New helper: src/lib/visibility.ts exports dealsVisibleToSql,
canViewDeal, canEditDeal — single source of truth for the
self-or-team-leader OR-expression that would otherwise be duplicated
across 5+ routes.

Auth changes:
- Remove DrizzleAdapter and Resend (magic link) entirely.
- Remove /login/check-email, /pending, /api/agents/[id]/approve,
  POST /api/agents (no manual provisioning).
- jwt callback upserts agents row by email on every sign-in (atomic
  via onConflictDoNothing); strictly syncs is_admin to whether the
  email is in ADMIN_EMAILS (env var is the single source of truth —
  both promotion and demotion).
- Login page simplified to a single Google button (no error banner,
  no useSearchParams, no Suspense).

Permission model: anyone with a Google account can sign in; ADMIN_EMAILS
get full access; everyone else sees only their own deals/invoices, plus
team leaders get read-only visibility over their team members' deals.
Agents can self-edit name/phone/license_number; admin-only for
licensed_company/split_pct/team_id/joined_at/notes; email and is_admin
are locked.

Migration: DROP every non-buildings/non-settings table in production,
then re-run `npm run db:seed` to recreate from the new schema.
Buildings (369 rows) and settings (admin-configured) preserved.
```
