import assert from "node:assert/strict";
import { documentStorageEndpoint } from "../document-storage-endpoint";
import {
  buildDealDocumentKey,
  isDealDocumentKeyForDeal,
  MAX_DEAL_DOCUMENT_BYTES,
  validateDealDocumentMetadata,
} from "../deal-document-storage";

function main() {
  assert.deepEqual(documentStorageEndpoint("account", "", "production"), {
    endpoint: "https://account.r2.cloudflarestorage.com",
  });
  assert.deepEqual(documentStorageEndpoint("account", "http://127.0.0.1:4569", "development"), {
    endpoint: "http://127.0.0.1:4569", forcePathStyle: true,
  });
  for (const endpoint of ["http://127.0.0.1:4569", "https://external.example", "http://localhost@external.example", "http://localhost:4569/path"]) {
    assert.throws(() => documentStorageEndpoint("account", endpoint, "production"));
  }
  for (const endpoint of ["https://external.example", "http://localhost@external.example", "http://localhost:4569/path"]) {
    assert.throws(() => documentStorageEndpoint("account", endpoint, "development"));
  }
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
