import assert from "node:assert/strict";
import {
  HOMIX_LIVING_COMPANY_NAME,
  HOMIX_LIVING_W9_ID,
  ensureHomixLivingW9,
  parseStoredCompanyW9Documents,
  toCompanyW9DocumentMetadata,
} from "../company-w9-model";

const legacyDocuments = ensureHomixLivingW9([], {
  objectKey: "company-docs/w9-legacy.pdf",
  fileName: "old-name.pdf",
  uploadedAt: "2026-07-29T12:00:00.000Z",
});
assert.equal(legacyDocuments.length, 1);
assert.equal(legacyDocuments[0].id, HOMIX_LIVING_W9_ID);
assert.equal(legacyDocuments[0].companyName, HOMIX_LIVING_COMPANY_NAME);
assert.equal(legacyDocuments[0].objectKey, "company-docs/w9-legacy.pdf");

const parsed = parseStoredCompanyW9Documents(
  JSON.stringify([
    {
      id: HOMIX_LIVING_W9_ID,
      companyName: "Incorrect editable name",
      objectKey: "company-docs/living.pdf",
      fileName: "living.pdf",
      uploadedAt: "2026-07-29T12:00:00.000Z",
    },
    {
      id: "homix-realty",
      companyName: "Homix Realty Inc.",
      objectKey: "company-docs/realty.pdf",
      fileName: "realty.pdf",
      uploadedAt: "2026-07-29T13:00:00.000Z",
    },
    {
      id: "homix-realty",
      companyName: "Duplicate",
      objectKey: "company-docs/duplicate.pdf",
      fileName: "duplicate.pdf",
    },
    {
      id: "invalid/key",
      companyName: "Invalid",
      objectKey: "public/invalid.pdf",
      fileName: "invalid.pdf",
    },
  ]),
);
assert.equal(parsed.length, 2);
assert.equal(parsed[0].companyName, HOMIX_LIVING_COMPANY_NAME);
assert.equal(parsed[1].companyName, "Homix Realty Inc.");

const affiliateOnly = parseStoredCompanyW9Documents(
  JSON.stringify([
    {
      id: "homix-realty",
      companyName: "Homix Realty Inc.",
      objectKey: "company-docs/realty.pdf",
      fileName: "realty.pdf",
      uploadedAt: "2026-07-29T13:00:00.000Z",
    },
  ]),
);
const migrated = ensureHomixLivingW9(affiliateOnly, {
  objectKey: "company-docs/living-legacy.pdf",
  fileName: "living-legacy.pdf",
  uploadedAt: "2026-07-29T12:00:00.000Z",
});
assert.deepEqual(
  migrated.map((document) => document.companyName),
  [HOMIX_LIVING_COMPANY_NAME, "Homix Realty Inc."],
);
assert.equal(migrated[0].objectKey, "company-docs/living-legacy.pdf");

const metadata = toCompanyW9DocumentMetadata(parsed[1]);
assert.equal(metadata.source, "uploaded");
assert.equal(metadata.isRentalInvoiceDefault, false);
assert.equal("objectKey" in metadata, false);

assert.deepEqual(parseStoredCompanyW9Documents("not-json"), []);

console.log("company W-9 model tests passed");
