import assert from "node:assert/strict";
import {
  buildDealDocumentKey,
  isDealDocumentKeyForDeal,
  MAX_DEAL_DOCUMENT_BYTES,
  validateDealDocumentMetadata,
} from "../deal-document-storage";

function main() {
  const valid = validateDealDocumentMetadata({
    fileName: "signed lease.pdf",
    contentType: "application/pdf",
    size: 1024,
  });
  assert.equal(valid.ok, true);

  const mismatch = validateDealDocumentMetadata({
    fileName: "lease.exe",
    contentType: "application/pdf",
    size: 1024,
  });
  assert.deepEqual(mismatch, {
    ok: false,
    error: "File type and extension are not allowed",
  });

  const oversized = validateDealDocumentMetadata({
    fileName: "lease.pdf",
    contentType: "application/pdf",
    size: MAX_DEAL_DOCUMENT_BYTES + 1,
  });
  assert.equal(oversized.ok, false);

  const key = buildDealDocumentKey(
    "rental",
    42,
    "租约 final (signed).pdf",
    "00000000-0000-4000-8000-000000000000"
  );
  assert.equal(
    key,
    "deal-docs/rental/42/00000000-0000-4000-8000-000000000000-租约 final (signed).pdf"
  );
  assert.equal(isDealDocumentKeyForDeal(key, "rental", 42), true);
  assert.equal(isDealDocumentKeyForDeal(key, "rental", 43), false);
  assert.equal(isDealDocumentKeyForDeal(key, "sale", 42), false);
  assert.equal(
    isDealDocumentKeyForDeal("deal-docs/rental/42/../sale/42/file.pdf", "rental", 42),
    false
  );

  console.log("deal document storage tests passed");
}

main();
