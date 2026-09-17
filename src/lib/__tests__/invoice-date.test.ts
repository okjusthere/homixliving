import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import type { Building } from "@/db/schema";
import { InvoiceDoc } from "@/components/homix/invoice-doc";
import { generateInvoicePDF } from "../pdf-generator";

async function main() {
  const building = { name: "Test Building" } as Building;
  const invoice = {
    invoiceNumber: "TIMEZONE-REGRESSION-2026", unit: "2A", tenantName: "Test Tenant",
    licensedCompany: "Homix Living Inc", moveInDate: "2026-09-18",
    createdAt: "2026-09-17 00:31:42.191+00",
    lineItems: [{ description: "Rental commission", quantity: 1, unitPrice: 2200, amount: 2200 }],
    totalAmount: 2200,
  };
  const preview = renderToStaticMarkup(createElement(InvoiceDoc, { invoice, building, settings: {} }));
  const pdfBytes = await generateInvoicePDF({ ...invoice, date: invoice.createdAt, building });
  const pdf = await getDocument({ data: new Uint8Array(pdfBytes), useSystemFonts: true }).promise;
  try {
    assert.equal(pdf.numPages, 1);
    const page = await pdf.getPage(1);
    const content = await page.getTextContent();
    const pdfText = content.items.map((item) => "str" in item ? item.str : "").join(" ");
    for (const text of [preview, pdfText]) {
      assert.ok(text.includes("September 16, 2026"), "long issue date uses New York");
      assert.ok(text.includes("09/16/2026"), "short issue date agrees with preview");
      assert.ok(text.includes("September 18, 2026"), "move-in date stays as entered");
      assert.ok(!text.includes("09/17/2026"), "UTC date must not leak into the invoice");
    }
  } finally {
    await pdf.destroy();
  }
  console.log(`invoice preview + actual PDF dates passed (host TZ=${process.env.TZ})`);
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
