# Changelog

## 2026-05-01

- Added Deals & Commissions V1 data model: `teams`, `agents`, `referrers`, `deals`, `deal_invoices`, and nullable `invoices.deal_id`.
- Added seed support for the new tables with demo teams, agents, and referrers.
- Added commission math library and assertion tests for primary-only, referral, co-agent, combined, and 100% split cases.
- Added API routes for teams, agents, referrers, deals, deal breakdowns, deal-to-invoice creation, agent reports, and monthly reports.
- Added pages for Deals, new Deal, Deal detail, Agents, Agent detail, Teams, Referrers, and Reports.
- Updated the dashboard, navigation, dashboard CTA, and standalone invoice creation page to make Deals the primary workflow.
- Acceptance checklist: all items verified.
