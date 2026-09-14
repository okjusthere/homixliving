# Shared buyer templates and company settings

Each exclusive/non-exclusive agreement has one company master. The prepared document belongs to the initiating agent's actual licensed company; `ownerAgentId` continues to isolate agent tasks. Company name, agent legal name/license/contact and Broker license are set by the server. No company picker or agent Documenso account is required. Buyer 2 is added/removed in the preparation form; its signature and prefills are enabled together.

Administrator `/admin/settings`, Company section stores `homix_realty_broker_license` and `homix_living_broker_license` in `portal.settings`. These are reusable company settings with 11-digit validation and the existing administrator audit trail. No license values are hardcoded in PDF templates. Already issued requests retain their original snapshots.

Deploy the eSign bridge additive package-scope migration before Portal. Historical packages remain company-specific unless an administrator explicitly publishes a shared scope. Do not change historical document ownership.

Validation: Portal unit tests cover canonical company settings/profile binding, missing configuration, legacy/shared scopes and bad license values. The local `shared-buyer-http.integration.ts` verifies both companies through actual Portal-to-Bridge requests, including company spoof rejection and canonical signer names. The eSign native suite completes four synthetic signing and bundle-download cases using one master. Real customer invitations and signatures are excluded from these tests.

Local HTTP command requires the fixed isolated fixture:

```sh
DATABASE_URL=postgres://homix:synthetic-only@127.0.0.1:5569/homix_onboarding_integration ESIGN_REPO_PATH=/path/to/esign node --import ./scripts/test-server-only.mjs --import ./scripts/test-agreement-auth.mjs --import tsx src/lib/__tests__/shared-buyer-http.integration.ts
```
