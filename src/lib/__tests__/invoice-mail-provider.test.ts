import assert from "node:assert/strict";
import { sendInvoiceEmail } from "../email-sender";
import { UncertainInvoiceDeliveryError } from "../invoice-email-errors";

process.env.RESEND_API_KEY = "synthetic-no-network";
const originalFetch = globalThis.fetch;
const send = () => sendInvoiceEmail({ to: ["synthetic@example.invalid"], subject: "Synthetic test", fileName: "test", pdfBuffer: Buffer.from("test"), buildingName: "Test", unit: "1", tenantName: "Test" });
async function main() {
  // Real installed Resend SDK, with only its HTTP boundary replaced. Its
  // handling of thrown fetch errors differs from ordinary rejecting promises.
  globalThis.fetch = async () => { throw new Error("Synthetic transport timeout"); };
  await assert.rejects(send(), UncertainInvoiceDeliveryError);
  for (const status of [408, 500, 503]) {
    globalThis.fetch = async () => Response.json({ name: "application_error", statusCode: status, message: "Synthetic failure" }, { status });
    await assert.rejects(send(), UncertainInvoiceDeliveryError);
  }
  globalThis.fetch = async () => Response.json({ name: "validation_error", statusCode: 422, message: "Invalid recipient" }, { status: 422 });
  await assert.rejects(send(), error => error instanceof Error && !(error instanceof UncertainInvoiceDeliveryError));
  globalThis.fetch = async () => new Response("truncated", { status: 200 });
  await assert.rejects(send(), UncertainInvoiceDeliveryError);
  globalThis.fetch = async () => Response.json({});
  await assert.rejects(send(), UncertainInvoiceDeliveryError);
  globalThis.fetch = async () => Response.json({ id: "synthetic-delivery" });
  assert.equal((await send()).id, "synthetic-delivery");
  console.log("PASS real mail SDK: timeout/5xx/truncated responses remain uncertain; explicit rejection is retryable; confirmed delivery is accepted.");
}
main().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => { globalThis.fetch = originalFetch; });
