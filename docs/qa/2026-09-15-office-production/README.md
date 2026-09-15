# Office production workflow simplification

Scope: `/admin/marketing/posters?tab=production` and its office-only draft handling. Personal Content Studio, other admin tabs, shared generation rules and access permissions retain their behavior. Shared picker/event-editor changes are opt-in props used by this workbench; new CSS is scoped to `.office-workbench`.

## Changed behavior

- Selecting an Agent shows a compact identity card, six theme buttons and the property picker automatically.
- Office multiselect uses 110px horizontal cards, visible checkmarks, select-page, cross-page selection, removable selection summary and a sticky next-step bar.
- Batch theme/language/style/size control the resulting drafts. Defaults persist for this browser session. Chinese plus English still creates two independent outputs.
- Open House batch sessions apply to each selected property; per-property edits remain available. Missing sessions may be saved in office drafts, but strict generation validation rejects them.
- Brief status themes skip AI highlight extraction. Detailed themes preserve basic-data drafts if extraction fails and show an actionable dismissible error.
- Sold imports and theme switches omit unconfirmed prices rather than treating asking price as sold price.
- Draft rows expose theme and language selectors directly. Incomplete rows identify the remedy before submission.
- Production navigation stays available while selecting properties. Review/deliver/ZIP actions count only eligible selected images and explain the sequence.

## Verification

- 46 content tests, including five new tests covering batch settings, sold prices, missing/invalid sessions, paired dates, and preference recovery.
- 31 existing office database assertions passed against disposable local database `homix_office_test`.
- TypeScript and targeted ESLint passed.
- Browser QA used the real local Next frontend with a localhost-only synthetic API proxy; no real emails or model calls.
- Actual clicks verified automatic Agent-to-picker flow, theme selection, selection across two pages, and creation of two Under Contract drafts with the correct target and language.
- Inline theme change to Open House immediately displayed the missing-date remedy.
- A simulated extraction failure preserved the draft and displayed a closable notification with retry instructions.
- Native date picker plus Add another day produced and saved two consecutive local dates, both 13:00–15:00.
- Desktop cards measured 110px high; 390px viewport measured approximately 119px high with no horizontal overflow. Temporary viewport was reset.

The development proxy initially lacked WebSocket passthrough, delaying hydration. Adding passthrough fixed the test harness; production application authentication and browser security policies were unchanged.
