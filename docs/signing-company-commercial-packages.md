# Company Listing, disclosure and commercial packages

The signing workspace has three company package entry points: Buyer, Seller /
Listing, and Commercial & other. The new `commercial` scenario reuses company
ownership and per-agent visibility, including review, send, follow-up, replacement
and download. It does not provision native agent accounts.

`company_name`, `company_address`, and `company_mailing_line` are bound by the
server to the initiating agent's licensed company. The mailing line combines the
canonical legal company name and address. Broker license numbers continue to
come from the existing administrator company settings.

Company administrators can publish `commercial` packages and share a master
across the configured licensed companies. Optional client roles work in all three
standard customer scenarios. Package selectors `usageZh` and `usageEn`, when
present, appear below package selection to explain the approved purpose.

The September 15 company materials include an 18-page Residential Listing
package, Buyer and Seller disclosure packages, two buyer agreements with
disclosures, and a Property NDA. The original Listing package already includes
Agency, anti-discrimination, Lead Paint, and Property Condition Disclosure forms;
do not append duplicate copies. Disclosure packages collect only the initiating
side's signatures. Counterparty signatures and referenced supporting materials
must still be obtained. The approved agency mappings are ordinary buyer or
seller agency, not dual-agency consent.

Published versions and existing signed requests are immutable. New content is
published as a new version. Deploy the bridge's commercial scenario support
before the Portal and before publishing the NDA.

The local HTTP integration test accepts `SIGNING_QA_SCENARIO=commercial` and
uses the corresponding fixture report from the bridge's local synthetic test.
