# Homix — Future Feature Roadmap

This is a living document of features we've discussed but haven't built. Each entry includes priority, scope, technical plan, and legal/compliance notes where relevant.

> **Convention:** features below the "Backlog" line are deliberately deferred until real-user feedback informs them.

---

## ✅ Already shipped (for reference)

- Buildings directory with 369 NYC student-rental buildings
- Deal pipeline (active / cancelled / completed)
- Auto commission split (primary + co-agent + referrer)
- Invoice generation (PDF) with editorial design
- Email send via Resend (with reply-to = agent's email)
- Aging report (outstanding invoices by bucket + by building)
- Renewal pipeline (60/90 day windows + status tracking)
- Lead source attribution (xiaohongshu / WeChat / school / referral / website / other)
- Self-registration with magic-link auth + admin approval
- Row-level access (agents see only their deals; admins see all)

---

## 🟢 Active / next-up

### Deploy to production (Vercel + Turso + Resend)

**Status:** Ready. All code in place.
**Outstanding:** account setup + env vars + first admin sign-in.

---

## 🟡 High-value backlog (likely 3–6 month horizon)

### 1. Client document vault

**Why:** NYC rentals require a fixed set of documents. Today agents bounce them through WeChat / email / Google Drive. Centralizing them in the deal folder eliminates lost docs and "did you send the bank statement?" friction.

**Scope (V1):**

- New `client_documents` table in Turso (metadata only):
  ```
  id, dealId, type, originalFilename, r2Key,
  watermarkedR2Key, sizeBytes, uploadedAt, uploadedBy,
  watermarkApplied, status (uploaded|verified|rejected)
  ```
- Document types enumerated:
  - Universal: `passport`, `bank_statement`
  - Student: `i20`, `visa`, `offer_letter`
  - Worker: `employment_letter`, `pay_stub`, `tax_return`, `opt_ead`
- Required vs optional per client type:

  | Document | Student (required) | Worker (required) |
  |---|---|---|
  | Passport | ✅ | ✅ |
  | Offer letter / Employment letter | ✅ | ✅ |
  | Visa / I-20 | optional | optional (OPT only) |
  | Bank statement | optional | recommended |
  | 3 mo pay stubs | — | ✅ |

  > "Passport + offer is enough to hold a unit" — surface as a UI hint.

- Upload UI:
  - Drag & drop multi-file upload
  - Per-file progress bar
  - Auto-categorize by filename heuristics (e.g. "I-20.pdf" → I-20)
  - Manual category override
- Storage: **Cloudflare R2** (already in use for listings).
  ```
  homix-r2-bucket/
  └── client-docs/
      └── deal-{id}/
          ├── passport-original.pdf
          ├── passport-watermarked.pdf
          └── ...
  ```

**Why R2 (not Turso BLOBs):**
- Documents are 1–5 MB each; ~10–20 MB per client; ~5–15 GB/year
- DB-stored BLOBs make queries slow, backups massive, free quota fill fast
- R2 already in use for listings → zero new account
- $0 egress fees (cheap downloads forever)

**Effort:** ~4 hours

---

### 2. Auto watermarking on upload

**Why:** Personal documents (passport, bank statement, visa) leak constantly in real estate. A "FOR RENTAL USE ONLY" watermark + agent license # gives clients confidence and creates an audit trail.

**Scope:**

Server-side processing on upload:
- **PDFs:** parse with `pdf-lib`, overlay diagonal watermark text on every page
- **Images (JPEG/PNG):** use `sharp` (Node native) or `Jimp` to composite watermark
- Watermark content:
  ```
  Top diagonal:    FOR RENTAL USE ONLY
  Bottom strip:    Agent: Yini Cui  ·  License #10401390004  ·  Apr 30, 2026
  ```
- Save both `original` and `watermarked` versions to R2.
- Client-facing downloads always serve watermarked.

**Effort:** ~3 hours

---

### 3. Designation of Sales (DOS) e-signature flow

**Why:** Every NYC rental requires a DOS form designating the agent as the client's representative. Today this is paper / scanned PDF / email back-and-forth.

**Legal basis:** ESIGN Act (2000) + UETA make typed-name + IP + timestamp a legally binding signature for this kind of disclosure form. We don't need DocuSign for DOS.

**Three approach tiers:**

| Tier | Cost / yr | Effort | Recommendation |
|---|---|---|---|
| **DIY** (typed signature + audit log) | $0 | 6 h | ✅ For DOS |
| BoldSign / HelloSign API | $120–600 | 8 h | Maybe for leases later |
| DocuSign | $480–1500 | 8 h | Overkill for DOS |

**DIY plan:**

1. Agent generates a unique signing link: `homixny.com/sign/{token}`
   - Token expires in 24 h
   - Pre-filled with: client name, email, agent info, building, unit
2. Client lands on signing page:
   - Reads pre-filled DOS
   - Checks `☑ I have read and agree`
   - Signs by typing full name OR drawing on canvas (`signature_pad` library)
3. Server records:
   ```
   signatures
   ──────────
   id, dealId, signerName, signerEmail, signedAt,
   ipAddress, userAgent, documentHash (sha256),
   consent (full text agreed to),
   signatureImage (base64 PNG)
   ```
4. PDF rendered with signature embedded + audit footer:
   ```
   ─────────────────────────────────────────────
   Electronically signed by: Wei Chen
   Date: May 1, 2026 at 11:42 AM EDT
   Agreement ID: SIG-2026-001234
   Document hash: a7f3...e2b9
   Recorded from IP: 73.252.xx.xx
   ─────────────────────────────────────────────
   ```
5. Stored in R2 + emailed to both client and agent.

**Effort:** ~6 hours.

**Future leases (high-stakes, multi-party):** punt to BoldSign API — much cheaper than DocuSign while still real e-signature provider.

---

### 4. Public client intake link

**Why:** Reduce friction. Today agents collect docs piecemeal via WeChat. A single shareable link lets clients self-serve.

**Flow:**

```
Agent in /deals/[id] → "Send intake link to client"
  → Generates one-time URL: /intake/{token}
  → Sends to client via email/WeChat
  → Client opens, sees agent profile, fills:
      • Phone, passport #
      • Client type (student / worker)
      • Uploads documents (with auto-categorization)
      • Signs DOS
  → Submission lands in deal folder
  → Agent gets notification
```

No login required for client side — token is sufficient (24h expiry, single-use after submit).

**Effort:** ~4 hours (depends on #1 + #2 + #3 being done)

---

### 5. Document expiration tracking

**Why:** Passports / visas / I-20s have expiration dates. Agents currently rediscover this when a building rejects an application.

**Scope:**
- During upload, OCR or manual entry of expiration date for each doc
- `/renewals` page shows "Documents expiring within 90 days" alongside lease renewals
- Email digest weekly to admin

**Effort:** ~3 hours (without OCR), +4 hours (with OCR via AWS Textract or similar)

---

## 🟠 Medium priority (6–12 month horizon)

### 6. Lead pipeline (Kanban)

**Why:** Today the funnel from "WeChat inquiry" → "signed deal" is invisible. Source attribution is collected on deals but pre-deal stages aren't tracked.

**Scope:**
- New `leads` table separate from `deals`
- Stages: `new` → `qualified` → `touring` → `applying` → `signed` (becomes a deal) | `lost`
- Kanban view with drag-to-update status
- Conversion funnel report (per source × per stage)
- Lead → Deal promotion (auto-fills the deal form)

**Why deferred:** without real volume, building a CRM is premature optimization. Run for a quarter and see what's actually missing.

**Effort:** ~8 hours

---

### 7. Realtime updates (only if Lead pipeline ships)

**Why:** Without realtime, two agents updating the same Kanban card see stale state. Once #6 ships and multiple agents collaborate on shared boards, this becomes useful.

**Tech path:**
- **Currently impossible on Turso/Vercel** — Vercel functions don't support long-lived WebSocket connections
- Options:
  - Server-Sent Events (one-way push) — works on Vercel, fine for activity feeds
  - Migrate to **Supabase Realtime** for full WebSocket-based table subscriptions
  - Or use a third-party like Ably / Pusher (~$10/mo)
- Simplest fallback: poll every 10 seconds — works, is ugly, fine for V1

**Why deferred:** product-market fit isn't there yet. We confirmed Aug 2026 that team uses WeChat for live coordination today; no demand for in-app chat.

---

### 8. Tour scheduling

**Why:** Each building has different leasing-office hours, contacts, access codes. Agents currently coordinate in private notes.

**Scope:**
- Calendar view of upcoming tours (per agent + per building)
- One tour can have multiple buildings (typical NYC tour day)
- Tour confirmation emails to building leasing office
- Time zone handling (parent in China watching)

**Effort:** ~6 hours

---

### 9. Building portal upload helpers

**Why:** Each building has different OP submission rules — some require a portal upload (not email). Today agents do this manually.

**Scope (V1, no automation):**
- Per-building "submission instructions" copy block
- Agent sees these on invoice send page
- Checklist: "Did you upload to portal?" before marking sent

**V2 (browser automation, advanced):**
- Use Playwright or Puppeteer to drive building portals
- Risky — portals change UI; brittle

**Effort:** V1 = 1.5 h. V2 = 1–2 weeks.

---

## 🔵 Long-term wishlist (12+ months, or if business changes)

### 10. Tenant self-service portal

Tenants log in to see their lease, download W9/DOS copies, request maintenance. Out-of-scope until rental management becomes a business line (today we're brokerage-only).

### 11. Multi-language UX (中英双语)

Most agents are bilingual; clients vary. Adding Chinese to forms + emails would help. Not urgent because today's flows happen in WeChat where language is auto-handled.

### 12. Mobile PWA

Field agents on phones. Once usage volume justifies, PWA-ify the app for offline-capable basic actions (add a deal, view a building).

### 13. CRM-grade contact management

Leads, contacts, communication history, follow-up reminders. Punt until #6 ships and there's real lead volume.

### 14. Compliance & licensing

- License renewal reminders (NY/NJ real estate licenses)
- REBNY membership status tracking
- 1099 generation for end of year
- Continuing education tracking

### 15. Reconciliation: paid vs invoiced

We mark invoices as paid manually. A future state imports bank statements (CSV) and auto-reconciles. Probably needs accounting software integration (QuickBooks).

### 16. Analytics & business intelligence

- Conversion funnel by lead source (depends on #6)
- Per-building revenue / season trends
- Agent ramp curves
- Cohort analysis
- Likely: Metabase or self-built dashboards

---

## 🚫 Considered and rejected

### Cloudflare Workers / D1 full migration

**Rejected because:** `@react-pdf/renderer` (our invoice PDF generator) depends on Node `Buffer` / `fs` / system fonts. Cloudflare Workers V8-isolate runtime doesn't support these. Risk of core feature break > savings.

We DO use Cloudflare R2 for object storage (no compute, just storage; works fine).

### Supabase migration (post-Auth implementation)

**Rejected because:** at our team size (≤ 50 agents) and feature scope (no realtime, no file uploads in DB, no advanced auth needs), Supabase's bundled features don't justify the migration cost from Turso. Revisit if we add #6 + #7 (Lead pipeline + Realtime).

### DocuSign for DOS

**Rejected because:** $480/yr minimum for low-stakes form. ESIGN Act + DIY signature is legally equivalent. Reconsider for lease signing only.

### Domain-restricted signup

**Rejected because:** flexible — admins approve via UI. Hardcoding `@homixny.com` would block edge cases (contractors, temporary staff, partner brokerages).

---

## 🔧 Technical debt to address before scaling

- [ ] Demo data toggle (`SEED_DEMO=1`) is fragile — replace with real fixtures
- [ ] No automated tests beyond commission math — at least add API smoke tests
- [ ] Error boundaries on every page (currently only some)
- [ ] `pdf-lib` upgrades watch — major version bumps break rendering
- [ ] Storage retention policy for old invoices/docs (currently: forever)
- [ ] Audit log for admin actions (approval/revoke/delete)

---

## Versioning

Maintain in this file:
- `## ✅ Already shipped` — append new sections here as features ship
- `## 🟢 Active` — what we're working on now
- Move `🟡` → `🟢` → `✅` as priorities shift

Last updated: 2026-05-01
