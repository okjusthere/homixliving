# Existing-agent Portal access

This is a separate flow from recruiting/onboarding invitations. An administrator
pre-registers an existing `public.agents.id` and its public contact email. This
does not create a Portal account, mark an email verified, sign a contract, send
an invitation, or change a website profile.

## Authorization

- `portal.legacy_agent_claims.expected_email` is the administrator-approved login
  candidate. Only an exact, case-normalized `@gmail.com` address with
  `allow_email_login=true` can claim through ordinary Google sign-in.
- Other domains and missing addresses require a personal `/claim/<token>` link.
  A recipient can choose a different Google email. This link is an access
  credential: send privately only to the intended person, never to a group.
- The recipient explicitly confirms the displayed existing profile, then uses
  Google OAuth. Only a verified Google email and stable subject are accepted.
- A successful claim creates one non-admin active Portal account and associates
  the original website row in the same database transaction. It copies the
  existing display name, phone and license, without inventing a Legal name.
  No existing agreement/payment evidence is changed and none is fabricated.
- The original registered Gmail remains authorized after first claiming with a
  different invited email; it is added as an alias only when Google verifies it.
  Existing disabled aliases, conflicting identities and administrator accounts
  are not silently re-enabled, reassigned or merged.
- A new account is assigned Homix Realty Inc. No joining date, fee payment,
  contract-completion date or signed Legal name is inferred.

## Invitation administration

Admin → Agents → Website → **Existing agent access**
(`/admin/agents/legacy-access`). Links expire after seven days. Only token hashes
are stored; each generated link is displayed once. Generating a replacement
invalidates the prior link. Revoking a reservation stops both unused invitations
and automatic Gmail claims. It is not an account-offboarding operation.

Links cannot claim a second identity after success. OAuth retries for the same
identity are harmless. Opening/previewing a link does not consume it. Two people
claiming the same profile concurrently cannot create two accounts. Audit failure
rolls back the account, login identities and website association together.

## Duplicate prevention and boundaries

Identity/email/license conflicts stop and require administrator review. A known
license belonging to a reserved profile blocks other Portal publishing paths.
An unknown or missing license cannot prove two different emails belong to the
same person; names are never fuzzy-matched to grant access.

The association transaction is an intentional narrow exception to the usual
website-owned profile editing API: it changes only `public.agents.portal_agent_id`.
Slug, visibility, photo, email, name and all other website fields are unchanged.
`onboarding_website_sync=complete` prevents onboarding retries from republishing
or making a hidden profile visible.

RLS is enabled without browser/anonymous policies. Mutations are server-only.
Invitation management requires current database-backed administrator access.
The recipient confirmation uses a Next Server Action with origin/CSRF defenses,
an HttpOnly/Secure/SameSite=Lax short-lived OAuth context cookie and Google state.
Claim URLs are excluded from analytics and send no referrer.

## Rollout

1. Run `agents:preregister-legacy` with explicit `--ids`, `--actor-id` and an
   environment file. Default mode is read-only preview. Review email/license
   conflicts before proceeding.
2. Apply the additive schema and reservations with `--apply --confirm-hash=...`
   and `--snapshot=/absolute/private/before.json`. The snapshot is exclusive and
   mode 0600. Existing website/account records are not modified by preregistration.
3. Deploy this branch before telling agents to use the automatic claim flow.
   Older application code ignores these reservations. Before schema installation,
   ordinary existing sign-ins continue normally and claim invitations fail closed.
4. Test a registered Gmail and an invited different Google address with the actual
   intended users. Verify the original profile ID, slug, visibility and photo.
5. Only then distribute invitations individually. Do not recreate old recruiting
   invitations for this purpose.

## Verification

`test:legacy-claims:db` refuses any database except a fresh local database named
`homix_legacy_claim_test`. It uses synthetic data only. It covers exact Gmail,
different-email invitations, mailbox verification, original-Gmail aliases,
revocation/expiration/rotation, preview safety, identity/license conflicts,
concurrent claims, preserved profile data and audit-failure rollback.
The same integration test is part of GitHub CI and runs against a fresh local
PostgreSQL database there. The existing `npm test` suite also requires a seeded
throwaway database; never point it at production.

Deployment and real-person Google sign-in must not be described as verified
based only on these database checks.
