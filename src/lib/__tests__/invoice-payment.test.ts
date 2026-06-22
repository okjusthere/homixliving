import assert from "node:assert/strict";
import { summarizeInvoicePayment } from "../invoice-payment";

function invoice(overrides: Partial<Parameters<typeof summarizeInvoicePayment>[0][number]>) {
  return {
    id: 1,
    invoiceNumber: "INV-1",
    status: "draft",
    totalAmount: 1000,
    paidAmount: null,
    paidAt: null,
    sentAt: null,
    createdAt: "2026-06-01T00:00:00.000Z",
    updatedAt: "2026-06-01T00:00:00.000Z",
    ...overrides,
  };
}

async function main() {
  assert.equal(summarizeInvoicePayment([]).status, "none");

  assert.equal(
    summarizeInvoicePayment([invoice({ status: "draft" })]).status,
    "draft"
  );

  const sent = summarizeInvoicePayment([
    invoice({
      id: 2,
      invoiceNumber: "INV-2",
      status: "sent",
      totalAmount: 2500,
      sentAt: "2026-06-10T00:00:00.000Z",
    }),
  ]);
  assert.equal(sent.status, "awaiting_payment");
  assert.equal(sent.totalOutstanding, 2500);
  assert.equal(sent.latestInvoiceNumber, "INV-2");

  const paid = summarizeInvoicePayment([
    invoice({
      status: "paid",
      totalAmount: 3000,
      paidAmount: 2800,
      paidAt: "2026-06-12T00:00:00.000Z",
    }),
  ]);
  assert.equal(paid.status, "paid");
  assert.equal(paid.totalPaid, 2800);

  const mixed = summarizeInvoicePayment([
    invoice({ id: 3, invoiceNumber: "INV-3", status: "paid", totalAmount: 1000, paidAt: "2026-06-11T00:00:00.000Z" }),
    invoice({ id: 4, invoiceNumber: "INV-4", status: "sent", totalAmount: 1500, sentAt: "2026-06-13T00:00:00.000Z" }),
  ]);
  assert.equal(mixed.status, "awaiting_payment");
  assert.equal(mixed.totalOutstanding, 1500);
  assert.equal(mixed.totalPaid, 1000);

  console.log("invoice payment tests passed");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
