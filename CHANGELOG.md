# Changelog

## 2026-07-13

- Resource library imports the "HOMIX 常用做单表格" Google Sheet: 60 deal forms
  (blank template + filled sample Drive links, 8 categories incl. the Homix
  Living section) and the per-stage required-documents checklists (5 stages,
  27 items). Files stay in Google Drive; the portal owns metadata + display.
- Resources cards now pair "空白表格 ↗ / 查看样本 ↗" links (`resources.sample_url`).
- New required-documents section on `/resources` (做单必交文件) with stage tabs,
  backed by the new `checklist_items` table and an admin manager.
- Admin "同步做单表格数据" button → `POST /api/admin/import-resources` (same
  operational model as ensure-schema: idempotent, runs where the Sensitive
  Turso credentials live; also applies the schema DDL first).

## 2026-07-06

- Security hardening: edge middleware is now default-deny for data APIs (only active/admin users pass), cron endpoints fail closed when `CRON_SECRET` is unset, and workspace-order routes enforce ownership guards.
- Fixed schema drift between `src/db/seed.ts`, the Drizzle schema, and production; removed dead code left over from the old deals/referrers data model.
- In-app notifications with a nav bell, plus email fan-out via Resend.
- Renewal reminder cron (`/api/cron/renewal-reminders`) notifies deal agents at lease-end windows.
- Global ⌘K search across deals, invoices, buildings, and agents.
- Deal document uploads (lease/application files) stored in Vercel Blob.
- Append-only audit log wired into every money/roster mutation, browsable at `/audit`.
- Commission math is now cents-exact (integer cents, no floating-point drift).
- Three new test suites (aging, reporting, renewals) — `npm test` now runs 8 suites.
- CI workflow (typecheck, lint, seed smoke test, tests) on push/PR.
- Reports support a year mode alongside monthly views.
- `/teams` added to the main navigation.

## 2026-05-01

- Added Deals & Commissions V1 data model: `teams`, `agents`, `referrers`, `deals`, `deal_invoices`, and nullable `invoices.deal_id`.
- Added seed support for the new tables with demo teams, agents, and referrers.
- Added commission math library and assertion tests for primary-only, referral, co-agent, combined, and 100% split cases.
- Added API routes for teams, agents, referrers, deals, deal breakdowns, deal-to-invoice creation, agent reports, and monthly reports.
- Added pages for Deals, new Deal, Deal detail, Agents, Agent detail, Teams, Referrers, and Reports.
- Updated the dashboard, navigation, dashboard CTA, and standalone invoice creation page to make Deals the primary workflow.
- Acceptance checklist: all items verified.
