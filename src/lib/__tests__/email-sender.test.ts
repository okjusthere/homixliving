import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import { buildInvoiceEmailAttachments } from "../email-sender";

async function main() {
  const invoicePdf = Buffer.from("%PDF-test-invoice");
  const attachments = await buildInvoiceEmailAttachments("Unit-Test-Invoice", invoicePdf);

  assert.equal(attachments.length, 2);
  assert.deepEqual(
    attachments.map((attachment) => attachment.filename),
    ["Unit-Test-Invoice.pdf", "Homix Living Inc W9.pdf"]
  );
  assert.deepEqual(
    attachments.map((attachment) => attachment.contentType),
    ["application/pdf", "application/pdf"]
  );
  assert.equal(Buffer.from(attachments[0].content, "base64").toString(), "%PDF-test-invoice");
  assert.equal(Buffer.from(attachments[1].content, "base64").subarray(0, 4).toString(), "%PDF");

  console.log("email sender tests passed");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
