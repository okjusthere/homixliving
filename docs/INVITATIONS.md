# Agent invitations

The single invitation entry is the top-right avatar menu → **Invite to join**
(`/invite`). Every active agent can use it. The profile, teams console and team
workspace no longer generate invitations. The team workspace retains its
invitation history and revoke controls.

## Everyday referrals

The main page explains the 10% lifetime referral program and offers a reusable
personal link. Its sponsor is always the authenticated active agent. The
invitee chooses their licensed company and plan; joining a team still requires
the existing Team Leader approval. Sponsor attribution and Team Split remain
separate financial facts.

The existing accounting basis is:

- Transactions: 10% of the referred agent's allocated Company Dollar + Source Fee.
- Eligible plan payments and renewals: 10% of the eligible amount settled.
- Transaction fees, license-transfer charges and agent take-home commissions
  are excluded. Sending an invitation itself does not accrue a payment.

Lifetime describes continued qualifying revenue during the referred agent's
relationship with Homix, subject to the applicable agreement; the reward is
not limited to a first transaction or first year. This UI change does not
alter settlement calculations, agreement text, or payout rules.

## Link persistence

`POST /api/onboarding/referral-link` creates or returns the current agent's
standing invitation. It ignores caller-supplied sponsor, company and team
values, checks live account status, and serializes concurrent requests by
locking the agent row. Page loads only retrieve links; creation requires a
button press.

The existing invitation table and `/join/[token]` redemption path are reused;
no database migration is required. Standing links use the existing non-null
fields with expiry `9999-12-31` and maximum uses `2147483647`, removing the old
30-day / 100-use campaign limits. They remain revocable through the invitation
API. Existing short-lived and email-restricted invitations remain valid under
their original limits.

The shareable token is a domain-separated HMAC of the invitation and agent IDs
using the server's `AUTH_SECRET` (or `NEXTAUTH_SECRET`). Only its SHA-256 hash
is persisted. A later page load reconstructs and verifies the same token. If
the signing secret changes, existing shared URLs still redeem by their stored
hash, while obtaining a new standing link creates one under the new secret.
Revoked invitations are never reactivated.

## Joining and resuming

1. `/join/[token]` validates the invitation, stores an HttpOnly cookie and
   opens the application version of Google login.
2. The login URL retains the invitation token. Copying the link from an in-app
   browser reopens `/join/[token]`, preserving attribution in Safari/Chrome.
3. The existing profile submission locks and persists the sponsor and
   invitation ID. Subsequent visits use that stored relationship even without
   the original cookie.
4. The existing application continues through eSign and the applicable
   membership/desk fee and onboarding charges. Eligible settled online
   payments activate the account under `ONBOARDING_V2_ENFORCED=1`; offline
   payments and exceptions retain the existing review requirements.

Invalid invitations clear any previous invitation cookie and show an explicit
message asking the applicant to obtain the inviter's current link.

## Special placements

The same `/invite` page has collapsed special settings for administrators and
Team Leaders. Team recruitment fixes the target team, company, plan, term and
current team compensation configuration. Company placement is admin-only and
allows an explicit sponsor (including no sponsor). The existing invitation
API remains the authority for team ownership, active sponsors and completed
Team Leader agreement requirements.

## Verification

- `npm run test:personal-referral`: token isolation, locked routing and browser handoff.
- `npm run test:personal-referral:db`: local Postgres only; concurrent creation,
  subsequent retrieval, usage beyond 100, revocation and legacy compatibility.
- Checked local HTTP role gates, applicant profile submission, and persisted
  sponsor attribution when resuming without the cookie.
- Existing onboarding/routing/eSign/payment tests and the rollback smoke test
  passed using an isolated local database with onboarding enforcement enabled.
- Production build, changed-file ESLint, desktop and 390px mobile browser checks passed.

These checks did not perform a real Google OAuth registration, external eSign
signature or Stripe charge, and did not deploy to production.
