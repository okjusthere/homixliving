# Homix Deals & Commissions — Implementation Plan

This plan adds a **Deals (成单)** management system on top of the existing **Homix Invoice Suite**. Once implemented, Deals become the source of truth for who got paid what; Invoices become a downstream artifact generated from a Deal.

> **Audience:** an autonomous coding agent (Codex). Read this whole file before writing any code. Where ambiguity exists, choose the option closest to the existing codebase's patterns.

---

## 0. Project Context

### Repo
- **Name:** `homixliving`
- **Stack:** Next.js 16 (App Router, Turbopack), React 19, TypeScript, Tailwind CSS v4, libSQL/Turso via Drizzle ORM
- **Deployed to:** Vercel (planned; build is verified working)
- **Run commands:**
  - `npm run dev` — dev server on :3000
  - `npm run build` — production build (must pass)
  - `npm run db:seed` / `npm run db:push` — re-seed local SQLite at `local.db`

### Existing modules to **not break**

| Path | Purpose |
|---|---|
| `src/db/schema.ts` | Drizzle schema — `buildings`, `invoices`, `settings` |
| `src/db/seed.ts` | Imperative seed file (raw SQL `CREATE TABLE` + Drizzle inserts). Contains 369 buildings. |
| `src/db/index.ts` | Drizzle client (libSQL with `file:local.db` fallback) |
| `src/app/api/buildings/route.ts` | GET/POST/PUT/DELETE for buildings |
| `src/app/api/invoices/route.ts` | GET/POST for invoices |
| `src/app/api/invoices/[id]/route.ts` | GET/DELETE one invoice |
| `src/app/api/invoices/[id]/pdf/route.ts` | Streams PDF with `new NextResponse(new Uint8Array(buffer))` |
| `src/app/api/invoices/[id]/send/route.ts` | Sends email via Resend |
| `src/app/api/settings/route.ts` | KV settings read/write |
| `src/lib/pdf-generator.tsx` | `@react-pdf/renderer` invoice PDF |
| `src/lib/email-sender.ts` | Lazy Resend client |
| `src/lib/invoice-generator.ts` | Builds invoice number / file name / email subject |
| `src/components/homix/*` | Editorial design system — see §3 |

### Existing pages

| Route | File |
|---|---|
| `/` | `src/app/page.tsx` (Server Component dashboard) |
| `/invoices` | `src/app/invoices/page.tsx` (list) |
| `/invoices/new` | `src/app/invoices/new/page.tsx` (create form with live PDF preview) |
| `/invoices/[id]` | `src/app/invoices/[id]/page.tsx` (detail with split layout) |
| `/buildings` | `src/app/buildings/page.tsx` (directory + edit dialog) |
| `/settings` | `src/app/settings/page.tsx` |

---

## 1. What we're building

A complete **Deals & Commissions** layer:

- **Deals** — every signed lease = one Deal. Captures the money split.
- **Agents** — every broker on the team. Has a fixed split %.
- **Teams** — agents are grouped into teams.
- **Referrers** — outside parties who refer clients.
- **Deal → Invoice** — one Deal can produce one or more Invoices. Existing Invoice creation flow stays, but a new "Create Invoice from Deal" path is the primary one.
- **Reports & per-agent dashboards** — monthly views of commissions earned.

### Out of scope for this iteration (do **not** build)

- Auth / login / per-user permissions (everyone is implicit "admin" for now).
- Team-leader override commission. Leave a `team_id` on agents but no override math.
- Auto-emailing monthly statements.
- Tracking actual money received vs. invoiced (reconciliation).
- A full CRM (leads, viewings, follow-ups).

These will be future iterations. Architect cleanly so they can be added without rewrites.

---

## 2. Domain Model

### 2.1 Tables to add

All tables use `integer` PKs with `autoIncrement`, ISO-string timestamps, snake_case columns in SQL but camelCase in Drizzle. Match the style of `src/db/schema.ts` exactly.

```ts
// teams
id              integer PK
name            text not null            // "Manhattan Sales", "NJ Group"
leaderAgentId   integer references agents(id)  // nullable
notes           text
createdAt       text default CURRENT_TIMESTAMP
updatedAt       text default CURRENT_TIMESTAMP

// agents
id              integer PK
name            text not null
email           text
phone           text
licenseNumber   text                      // NY/NJ real estate license #
licensedCompany text                      // "Homix Living Inc.", "AIREA LLC", etc
splitPct        real not null default 50  // 0-100, e.g. 70 means agent keeps 70%, 30% to company pool
teamId          integer references teams(id)
isActive        integer (boolean) default 1
joinedAt        text                      // ISO date
notes           text
createdAt       text default CURRENT_TIMESTAMP
updatedAt       text default CURRENT_TIMESTAMP

// referrers
id              integer PK
name            text not null
email           text
phone           text
defaultReferralType text                  // 'percent' | 'flat' | null
defaultReferralAmount real                // % (e.g. 15) OR dollars (e.g. 200)
notes           text
createdAt       text default CURRENT_TIMESTAMP
updatedAt       text default CURRENT_TIMESTAMP

// deals
id                       integer PK
buildingId               integer references buildings(id) NOT NULL
unit                     text not null
tenantName               text not null
tenantEmail              text
tenantPhone              text
apartmentAddress         text
moveInDate               text                       // ISO date
leaseStartDate           text                       // ISO date (often = move-in)
leaseEndDate             text                       // ISO date
rentAmount               real                       // monthly rent in USD
leaseLengthMonths        integer                    // 12, 13, etc.
totalCommission          real not null              // OP / total commission from building
licensedCompany          text not null              // copy of agent's licensed company at time of deal
primaryAgentId           integer references agents(id) NOT NULL
primaryAgentSharePct     real not null default 100  // % of (commission - referrer cut) to primary agent. Default 100 if no co-agent.
coAgentId                integer references agents(id)  // nullable
coAgentSharePct          real                            // % to co-agent of remaining; primary + co should sum to 100
referrerId               integer references referrers(id)  // nullable
referrerType             text                              // 'percent' | 'flat' | null
referrerAmount           real                              // when 'percent': % of total commission; when 'flat': dollars
status                   text not null default 'active'    // 'active' | 'cancelled' | 'completed'
dealDate                 text                              // ISO date — when signed; default = createdAt
notes                    text
createdAt                text default CURRENT_TIMESTAMP
updatedAt                text default CURRENT_TIMESTAMP

// deal_invoices  (join table — one deal can have many invoices)
dealId          integer references deals(id) ON DELETE CASCADE
invoiceId       integer references invoices(id) ON DELETE CASCADE
createdAt       text default CURRENT_TIMESTAMP
PRIMARY KEY (dealId, invoiceId)
```

### 2.2 Update existing `invoices` table

Add a nullable `dealId` column referencing `deals(id)`. Most existing invoices won't have one. New invoices created from a Deal will have it set.

```ts
// invoices  — ADD column
dealId          integer references deals(id)  // nullable
```

### 2.3 Drizzle types & helpers

Export types matching the convention in `schema.ts`:

```ts
export type Team = typeof teams.$inferSelect;
export type NewTeam = typeof teams.$inferInsert;
export type Agent = typeof agents.$inferSelect;
export type NewAgent = typeof agents.$inferInsert;
export type Referrer = typeof referrers.$inferSelect;
export type NewReferrer = typeof referrers.$inferInsert;
export type Deal = typeof deals.$inferSelect;
export type NewDeal = typeof deals.$inferInsert;
```

### 2.4 Seed data

Update `src/db/seed.ts` with:

- 3 demo teams: "Manhattan", "Brooklyn & Queens", "NJ"
- 8 demo agents spread across the teams, with varying splits (50/60/70/80)
- 2 demo referrers (one percent-type, one flat-type)
- 0 demo deals (so the empty state is testable)

Append the new `CREATE TABLE` statements **after** the existing ones in the seed function. Wrap them in `IF NOT EXISTS`. Add an `ALTER TABLE invoices ADD COLUMN deal_id INTEGER REFERENCES deals(id)` — guard with a try/catch for the case where the column already exists.

---

## 3. Design System (must match existing pages)

The existing app uses a custom editorial design. **Do not introduce shadcn primitives or new visual language.** Reuse:

### Tokens (`src/components/homix/tokens.ts`)

```ts
export const tone = {
  paper: "#F7F4EE",       // bg
  paperDeep: "#F0EBDF",   // hover, segmented chip bg
  card: "#FFFFFF",
  ink: "#1A1814",
  ink70: "#534F47",
  ink50: "#7A756C",
  ink30: "#B8B0A2",
  line: "#E8E2D6",
  lineSoft: "#F0EBDF",
  accent: "#5B5A2B",      // olive
  accentSoft: "#F0EFD9",
  green: "#3F6E3A",
  greenSoft: "#E5EFDA",
  amber: "#8C6B19",
  amberSoft: "#F4E9CF",
  rose: "#A84135",
  roseSoft: "#F2D8D5",
};
```

Plus `fmtMoney(n)` and `fmtDate(s)` helpers also exported from this file.

### Primitives (`src/components/homix/primitives.tsx`)

`<Card>`, `<Btn variant="primary|outline|danger" size="md|lg" icon={…}>`, `<Pill tone="neutral|sent|draft|failed|accent">`, `<EditorialInput>`, `<LabeledField>`, `<HomixMark>`, `<SoftField>`, `Icons.*`. **Use these. Do not import shadcn or third-party UI kits.**

### Type system

- Display headings: `font-serif` (Instrument Serif via `--font-instrument-serif` CSS variable)
- Body: Geist (default)
- Numerics, codes, dates: `font-mono` (Geist Mono)

### Page layout pattern

Look at `src/app/invoices/page.tsx`. Every list page has:

```
[uppercase tracking-wider category label]
[font-serif display heading, ~52px]
[filter chips row + search row]
[<Card>...table...</Card>]
```

Detail pages: see `src/app/invoices/[id]/page.tsx` for the split layout (left = data cards, right = preview / sidebar).

Form pages: see `src/app/invoices/new/page.tsx` for the multi-card form on the left + live preview on the right.

**Match these patterns exactly.** A Codex pass that produces visually inconsistent pages (e.g. different heading sizes, different button styles, mixed in shadcn `<Button>`) is a failure.

---

## 4. Commission split math (the spec)

Implement this in `src/lib/commission.ts` as a pure function:

```ts
export type CommissionInput = {
  totalCommission: number;
  referrer?: { type: 'percent' | 'flat'; amount: number } | null;
  primaryAgentSharePct: number;            // 0-100, of (total - referrer)
  primaryAgentSplitPct: number;            // 0-100, agent take of their share
  coAgent?: { sharePct: number; splitPct: number } | null;
};

export type CommissionBreakdown = {
  totalCommission: number;
  referrerCut: number;
  afterReferrer: number;            // = total - referrerCut
  primaryGross: number;             // = afterReferrer * primaryAgentSharePct/100
  primaryAgentTake: number;         // = primaryGross * primaryAgentSplitPct/100
  primaryCompanyPool: number;       // = primaryGross - primaryAgentTake
  coAgentGross: number;             // = afterReferrer - primaryGross   (or 0)
  coAgentTake: number;              // = coAgentGross * coAgentSplit/100 (or 0)
  coCompanyPool: number;            // = coAgentGross - coAgentTake (or 0)
  companyPoolTotal: number;         // = primaryCompanyPool + coCompanyPool
  agentTakeTotal: number;           // = primaryAgentTake + coAgentTake
};

export function computeCommission(input: CommissionInput): CommissionBreakdown
```

### Worked example

```
totalCommission = 5000
referrer = { type: 'percent', amount: 10 }     →  referrerCut = 500
afterReferrer = 4500

primaryAgentSharePct = 60                      →  primaryGross = 2700
primaryAgentSplitPct = 70                      →  primaryAgentTake = 1890,  primaryCompanyPool = 810

coAgent.sharePct = 40                          →  coAgentGross = 1800
coAgent.splitPct = 60                          →  coAgentTake = 1080, coCompanyPool = 720

agentTakeTotal = 1890 + 1080 = 2970
companyPoolTotal = 810 + 720 = 1530
referrerCut = 500
———
sanity: 2970 + 1530 + 500 = 5000  ✓
```

Round each line to 2 decimals at display time, but keep math at full precision until display.

Also write a unit test or assertion script: `src/lib/__tests__/commission.test.ts` (or `commission.test.ts` next to it) hitting at least:

1. No referrer, no co-agent
2. Percent referrer, no co-agent
3. Flat referrer, no co-agent
4. No referrer, co-agent
5. Both
6. 100% split (agent takes everything, no company pool)

If a test runner isn't already wired up, add `vitest` minimally and a `npm run test` script.

---

## 5. API routes

Mirror the existing pattern (`route.ts` per resource, default export-less, `GET/POST/PUT/DELETE` handlers with `NextRequest`/`NextResponse`). All routes must:

- Return `NextResponse.json(...)` with `status` 200/201/400/404/500 as appropriate
- For list endpoints, allow `?status=active`, `?agentId=…`, `?from=YYYY-MM-DD`, `?to=YYYY-MM-DD` query params where they make sense
- Use `parseInt` carefully — never trust user input as a valid number

| Route | Verbs |
|---|---|
| `/api/teams` | GET (list), POST (create), PUT (update), DELETE |
| `/api/agents` | GET (list, supports `?teamId=`), POST, PUT, DELETE |
| `/api/agents/[id]` | GET (one), DELETE |
| `/api/agents/[id]/report?month=YYYY-MM` | GET — agent monthly report |
| `/api/referrers` | GET, POST, PUT, DELETE |
| `/api/deals` | GET (supports `?from=`, `?to=`, `?agentId=`, `?status=`), POST |
| `/api/deals/[id]` | GET, PUT, DELETE |
| `/api/deals/[id]/breakdown` | GET — returns `CommissionBreakdown` for the deal |
| `/api/deals/[id]/create-invoice` | POST — creates a draft invoice from this deal, links via `deal_invoices`, returns the new invoice ID |
| `/api/reports/monthly?month=YYYY-MM` | GET — company-wide monthly summary |

### Deal creation logic (`POST /api/deals`)

1. Validate: `buildingId`, `unit`, `tenantName`, `totalCommission`, `primaryAgentId` are required.
2. Default `primaryAgentSharePct` to 100 if no co-agent, else require both pcts and ensure they sum to 100 (allow ±0.01 tolerance).
3. Default `licensedCompany` to the agent's `licensedCompany`.
4. Default `dealDate` to today.
5. Insert and return the row.

### Deal → Invoice flow (`POST /api/deals/[id]/create-invoice`)

1. Load deal + building + agent.
2. Build line items: a single line — `{ description: "Owner Pays Commission", quantity: 1, unitPrice: totalCommission, amount: totalCommission }` (one line is fine; future iterations can split further).
3. Compute invoice number / file name / email subject using existing `src/lib/invoice-generator.ts`.
4. Year = year of `dealDate` (fallback to current year).
5. Insert invoice with all fields plus `dealId = deal.id`.
6. Insert into `deal_invoices` join table.
7. Return `{ invoiceId, invoiceNumber }`.

The frontend will then redirect to `/invoices/{invoiceId}`.

---

## 6. Pages to add

**All pages must follow the design system in §3.** Read `src/app/invoices/page.tsx`, `src/app/invoices/[id]/page.tsx`, and `src/app/invoices/new/page.tsx` before writing each new page so styling matches.

### 6.1 `/deals` — Deals list

- Editorial header: category "Pipeline", display heading "Deals", "+ New Deal" button (top-right)
- Filter chip row: All / Active / Cancelled / Completed (with counts), like `/invoices`
- Search box — filters by tenant name, unit, building name, agent name
- Table columns: **Deal #** (just the id with a `#` prefix, mono font) · **Building / Tenant** (two-line, like invoices list) · **Agent** (primary, with co-agent badge if present) · **Move-in** (mono date) · **Commission** (right-aligned, font-serif, $X,XXX.XX) · **Status** (Pill)
- Click row → `/deals/[id]`
- Empty state: "No deals yet" + "Create your first deal" link

### 6.2 `/deals/new` — Create Deal form

Two-column layout (form on left, live preview on right) matching `/invoices/new`.

**Form cards (left column):**

1. **Building** — search input, filtered list, selected building shown as Pill row with "Change" link. Pre-select if `?buildingId=` query param is set.
2. **Tenant & Lease** — Tenant name (required), Tenant email, Tenant phone, Apartment address, Move-in date, Lease length (months, default 12), Rent amount (monthly $).
3. **Agent** — Primary agent dropdown (required); checkbox "Add co-agent" reveals a second agent dropdown + share split slider/inputs (defaults 50/50).
4. **Referral** — checkbox "Has referrer" reveals: Referrer dropdown, type radio (percent / flat), amount input.
5. **Commission** — Total commission input (required, $). Live shows the **breakdown** below (this is the magic): "Referrer gets $X · Primary agent takes $Y · Co-agent takes $Z · Company pool $W".
6. **Notes** — optional textarea.

**Right column (live preview):**

A **Deal summary card** showing:
- Building / Unit / Tenant
- Agent split (with avatars or initials in circles)
- Commission breakdown bar chart (visual segmented bar showing Referrer | Primary | Co | Company)
- All numbers update live as the form changes.

**Submit:** Saves the deal, redirects to `/deals/[id]`. After submit show toast: "Deal created. Open invoice?" with a button to one-click create the invoice.

### 6.3 `/deals/[id]` — Deal detail

Split layout matching `/invoices/[id]`:

- Header: status pill, deal number `#42`, tenant + unit + building, action buttons (Edit, Cancel deal, **Create Invoice** primary CTA).
- **Left column:**
  - Total Commission hero card (huge serif number, like Invoice "Total Due")
  - Building / Tenant card
  - Agents card (Primary, Co-agent if present, with their split %s)
  - Lease details card (move-in, term, monthly rent)
  - Notes card if non-empty
- **Right column:**
  - **Commission Breakdown** card (visual): segmented bar + table:
    ```
    Total Commission                $5,000.00
    ───────────────────
    Referrer (Jane Doe, 10%)         -$500.00
    Primary Agent — Alice (60%)       $1,890.00 take
                                      $810.00 → company
    Co-Agent — Bob (40%)              $1,080.00 take
                                      $720.00 → company
    ───────────────────
    Agent take total                $2,970.00
    Company pool                    $1,530.00
    Referrer total                   $500.00
    ```
  - **Linked Invoices** card: list of invoices linked via `deal_invoices`, each clickable. If empty, prominent "Create Invoice" CTA.

### 6.4 `/agents` — Agents list

- Editorial header "Agents", "+ Add Agent" button
- Cards grid (3-col on desktop), grouped by team
- Each card: avatar circle (initials), name, license #, team, split %, # of deals MTD, MTD take

Click card → `/agents/[id]`.

### 6.5 `/agents/[id]` — Agent detail

- Header: name, license #, team, split %
- Stats row (4 stat cards like Dashboard): MTD deals, MTD take, YTD deals, YTD take
- Month selector (segmented chip: this month, last month, custom)
- Deals table for selected month with their per-deal take
- Edit dialog (same pattern as Buildings edit) for updating agent info

### 6.6 `/teams` — Teams list

- Simple page: list of teams, each with member count and MTD totals
- Click → expandable detail with member list

(Keep this minimal — full team management is V1.1.)

### 6.7 `/referrers` — Referrers list

- Editorial header "Referrers"
- Cards or simple table: Name, default referral type/amount, # deals referred, total earned
- Add/Edit dialog like Buildings

### 6.8 `/reports` — Reports page

- Editorial header "Reports"
- Month picker (chip with current month + chevron, opens calendar)
- 4 stat cards: Total deals, Total commission, Company pool, Agent payouts
- "Top agents" table for selected month
- "Per building" table
- Export CSV button (top-right)

### 6.9 Update `/` Dashboard

Add a row of **Deal stats** alongside existing Invoice stats:
- Deals MTD
- Commission MTD
- Top agent MTD
- Pending invoices count (existing)

Add a "Recent deals" card next to the existing "Recent invoices".

### 6.10 Update Navigation (`src/components/nav.tsx`)

Update `navItems` to:

```ts
[
  { href: "/", label: "Overview" },
  { href: "/deals", label: "Deals" },
  { href: "/invoices", label: "Invoices" },
  { href: "/buildings", label: "Buildings" },
  { href: "/agents", label: "Agents" },
  { href: "/reports", label: "Reports" },
  { href: "/settings", label: "Settings" },
]
```

Drop the standalone "New Invoice" link from the nav — both Deals and Invoices have their own "+ New" buttons in-page now.

### 6.11 Update `/invoices/new`

Add a top banner (small Card): "Tip — invoices are now created from a Deal. [Browse deals →](/deals)". Keep the standalone form for cases where a deal isn't tracked, but make Deal-driven creation the primary path.

---

## 7. UX details that matter

- **Empty states** — every list page must have a beautiful empty state (font-serif heading + CTA). See `/invoices` for the pattern.
- **Loading states** — match the existing `"Loading…"` text style (`text-[13px]`, `tone.ink50`).
- **Currency formatting** — always `fmtMoney(n)` from tokens. Always prefix with `$`. Wrap large numerics in `font-serif` for hero displays, `font-mono` for tabular.
- **Date formatting** — always `fmtDate(s)` — outputs `MM/DD/YYYY`. For long-form (like "Move-in May 14, 2026") use `new Date(s).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })`.
- **Toasts** — use `toast` from `sonner`. Match existing toast usage: success in present-perfect ("Deal created", "Agent saved"), errors short ("Save failed").
- **Confirmations** — use `confirm()` for destructive actions, like the existing `handleDelete` patterns.

---

## 8. Implementation order

Do this in order. Verify each step works before moving on.

1. **Schema + seed** (~ 30 min)
   - Update `src/db/schema.ts` with new tables and the new `dealId` on invoices
   - Update `src/db/seed.ts` with `CREATE TABLE` statements + `ALTER TABLE invoices ADD COLUMN deal_id` (try/catch)
   - Add demo teams, agents, referrers
   - Run `npm run db:seed` — must complete cleanly. Inspect `local.db` with `sqlite3` to confirm tables exist.

2. **Commission lib + tests** (~ 30 min)
   - Write `src/lib/commission.ts` with the spec from §4
   - Write tests covering at least the 6 cases listed
   - `npm test` (or whatever you wired up) must pass

3. **Agents API + page** (~ 1 hour)
   - Routes: `/api/agents`, `/api/agents/[id]`
   - Pages: `/agents`, `/agents/[id]`
   - Add/Edit dialog matching the existing Buildings dialog UI
   - Verify in browser

4. **Teams + Referrers** (~ 30 min)
   - Routes + minimal pages

5. **Deals API** (~ 45 min)
   - Routes: `/api/deals`, `/api/deals/[id]`, `/api/deals/[id]/breakdown`, `/api/deals/[id]/create-invoice`
   - Test with `curl` before building UI

6. **Deals pages** (~ 2 hours — biggest chunk)
   - `/deals` list
   - `/deals/new` form with live commission breakdown preview
   - `/deals/[id]` detail with split layout

7. **Reports + Dashboard updates** (~ 1 hour)
   - `/reports` page
   - `/api/reports/monthly`
   - Update `/` dashboard
   - Update nav

8. **Verification pass** (~ 30 min)
   - `npm run build` — must succeed
   - Click through every page in dev
   - Create a deal → create invoice from it → download the PDF → verify it works
   - Smoke test: delete a deal that has linked invoices — invoices must remain (just with `dealId = null`), the join row should be gone

---

## 9. Acceptance checklist

When you're done, verify by walking through this:

- [ ] `npm run build` passes with no TypeScript errors
- [ ] `npm run db:seed` runs cleanly on a fresh `local.db`
- [ ] `npm test` (or equivalent) passes commission unit tests
- [ ] Dashboard shows deal stats alongside invoice stats
- [ ] Can create a team, then an agent under that team
- [ ] Can create a referrer
- [ ] Can create a deal with: building, tenant, primary agent only — commission breakdown shows correctly (referrer = 0, co = 0)
- [ ] Can create a deal with referrer (both percent and flat) — math correct
- [ ] Can create a deal with co-agent — math correct
- [ ] Can create a deal with ALL of: referrer + co-agent — math correct, sum reconciles to total
- [ ] On a deal detail page, "Create Invoice" creates a draft invoice with all fields populated, links to `deal_invoices`, redirects to the invoice page
- [ ] The invoice's PDF downloads and looks correct (the existing PDF generator already handles this — don't break it)
- [ ] Agent detail page shows their MTD deals correctly with their personal take
- [ ] Reports page shows correct monthly totals (deals × commission split)
- [ ] All new pages match the editorial design (serif headings, paper bg, olive accents, no shadcn primitives sneaking in)
- [ ] Nav reflects the new IA: Overview · Deals · Invoices · Buildings · Agents · Reports · Settings
- [ ] No console errors in dev mode on any page

---

## 10. Notes & gotchas

### Existing patterns to preserve

- **Server vs Client components:** look at how `/` is a Server Component (uses `db` directly) but `/invoices` is a Client Component (uses `fetch`). Pick the right model per page. Lists with filtering/search → Client. Read-only stats dashboards → Server. Forms with state → Client.
- **Server-safe vs client primitives:** `src/components/homix/server-primitives.tsx` exports `Card` and `Pill` for Server Components. `src/components/homix/primitives.tsx` (with `"use client"`) exports interactive primitives. Don't import client primitives into Server Components — see how `src/app/page.tsx` does it.
- **Drizzle queries:** see existing route handlers for the syntax. Use `eq`, `desc`, `count`, `sql` from `drizzle-orm` — don't reach for raw SQL unless absolutely necessary.

### Type safety

- `lineItems` on `invoices` is JSON-typed (`$type<LineItem[]>()`). Pass arrays, not strings, to inserts.
- For `NextResponse` with binary data, use `new Uint8Array(buffer)`, not `Buffer` directly. (See PDF route.)

### Commission edge cases

- If `totalCommission = 0` → all breakdown values are 0. Don't divide by zero.
- If `primaryAgentSharePct = 100` and no co-agent → `coAgentGross = 0`, fine.
- If primary + co share % don't sum to 100 → the API should reject with 400. Provide a clear error message.

### Don't introduce

- shadcn/ui components — every primitive needed already exists in `src/components/homix/`
- A new ORM, query builder, or migration tool — just append to `seed.ts`
- Auth libraries — out of scope
- Any Tailwind plugin not already configured

### Do introduce (if needed)

- `vitest` for the commission unit tests (lightweight, works with Next 16)
- That's about it.

---

## 11. File structure after implementation

```
src/
├── app/
│   ├── api/
│   │   ├── agents/
│   │   │   ├── route.ts                         (NEW)
│   │   │   └── [id]/
│   │   │       ├── route.ts                     (NEW)
│   │   │       └── report/route.ts              (NEW)
│   │   ├── deals/
│   │   │   ├── route.ts                         (NEW)
│   │   │   └── [id]/
│   │   │       ├── route.ts                     (NEW)
│   │   │       ├── breakdown/route.ts           (NEW)
│   │   │       └── create-invoice/route.ts      (NEW)
│   │   ├── referrers/route.ts                   (NEW)
│   │   ├── reports/monthly/route.ts             (NEW)
│   │   └── teams/route.ts                       (NEW)
│   ├── deals/
│   │   ├── page.tsx                             (NEW)
│   │   ├── new/page.tsx                         (NEW)
│   │   └── [id]/page.tsx                        (NEW)
│   ├── agents/
│   │   ├── page.tsx                             (NEW)
│   │   └── [id]/page.tsx                        (NEW)
│   ├── teams/page.tsx                           (NEW)
│   ├── referrers/page.tsx                       (NEW)
│   ├── reports/page.tsx                         (NEW)
│   └── page.tsx                                 (UPDATED: deal stats)
├── components/
│   ├── homix/
│   │   ├── deal-breakdown.tsx                   (NEW: visual segmented bar)
│   │   └── ...                                  (existing)
│   └── nav.tsx                                  (UPDATED: new nav items)
├── db/
│   ├── schema.ts                                (UPDATED: new tables)
│   └── seed.ts                                  (UPDATED: new tables + demo data)
└── lib/
    ├── commission.ts                            (NEW)
    └── __tests__/commission.test.ts             (NEW)
```

---

## 12. When in doubt

If something is genuinely ambiguous after reading this doc end-to-end:

1. Mirror what `/invoices` (list) or `/invoices/[id]` (detail) or `/invoices/new` (form) does, depending on the page type.
2. Default to **simpler** — this is V1, future iterations add complexity.
3. Use the existing design tokens. Do not invent new colors, fonts, or sizes.
4. Leave a `// TODO(v1.1):` comment for anything you defer.

---

## 13. After delivery

When done, write a `CHANGELOG.md` entry summarizing:
- New tables added
- New routes added
- New pages added
- Any acceptance-checklist items that were skipped (and why)

Then run `git add -A && git commit -m "feat: deals & commissions v1"` — push happens manually.
