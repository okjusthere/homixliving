import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { CompensationPreviewAllocations } from "@/components/homix/compensation-v31-preview";
import { InvoiceEmailAttachments } from "@/components/homix/send-dialog";
import { computeCompensationV31 } from "../compensation-v31";

const participants = [
  { agentId: 1, name: "Current Agent", sharePct: 60 },
  { agentId: 2, name: "Private Co-Agent", sharePct: 40 },
];
const result = computeCompensationV31({
  dealType: "rental",
  grossCommission: 10_000,
  source: "self",
  participants: [
    { agentId: 1, sharePct: 60, plan: "solo", companyCapUsed: 0 },
    { agentId: 2, sharePct: 40, plan: "solo_pro", companyCapUsed: 0 },
  ],
});
const originalResult = JSON.stringify(result);

for (const locale of ["en", "zh"] as const) {
  const ownPreview = renderToStaticMarkup(createElement(CompensationPreviewAllocations, {
    allocations: result.allocations, participants, viewerAgentId: 1, locale,
  }));
  assert.ok(ownPreview.includes("Current Agent"));
  assert.ok(ownPreview.includes("5,100"), "own net is still visible");
  assert.ok(!ownPreview.includes("Private Co-Agent"));
  assert.ok(!ownPreview.includes("4,000"), "co-agent net must not reveal their split");
  assert.ok(!ownPreview.includes("Solo Pro"));

  const coAgentViewing = renderToStaticMarkup(createElement(CompensationPreviewAllocations, {
    allocations: result.allocations, participants, viewerAgentId: 2, locale,
  }));
  assert.ok(coAgentViewing.includes("Private Co-Agent"), "co-agent can see their own preview");
  assert.ok(!coAgentViewing.includes("Current Agent"));
  for (const viewerAgentId of [null, 999]) {
    const unlinkedPreview = renderToStaticMarkup(createElement(CompensationPreviewAllocations, {
      allocations: result.allocations, participants, viewerAgentId, locale,
    }));
    assert.ok(!unlinkedPreview.includes("Current Agent"));
    assert.ok(!unlinkedPreview.includes("Private Co-Agent"));
    assert.ok(!unlinkedPreview.includes("5,100"));
    assert.ok(!unlinkedPreview.includes("4,000"));
  }

  const attachments = renderToStaticMarkup(createElement(InvoiceEmailAttachments, {
    invoiceId: 10, fileName: "Rental-Invoice-10", locale,
  }));
  assert.ok(attachments.includes("Rental-Invoice-10.pdf"));
  assert.ok(attachments.includes("Homix Living Inc W9.pdf"));
  assert.ok(attachments.includes(locale === "zh"
    ? "Invoice 和 Company W-9 将作为两个 PDF 附件一并发送给收件人，无需另行添加。"
    : "The invoice and Company W-9 will be sent together as two PDF attachments. No separate upload is needed."));
}
assert.equal(JSON.stringify(result), originalResult, "display changes must not alter compensation");

for (const form of ["src/app/rental/rental-deal-form.tsx", "src/app/sales/new/page.tsx"]) {
  const source = readFileSync(form, "utf8");
  assert.ok(!source.includes(".splitPct"), `${form} must not display roster splits`);
  assert.ok(!source.includes("splitLabel"));
  assert.ok(source.includes("participant.sharePct"), "deal collaboration shares remain editable/visible");
  assert.ok(source.includes("本单合作份额"), "deal shares must be distinguished from personal plan splits");
}
const previewSource = readFileSync("src/components/homix/compensation-v31-preview.tsx", "utf8");
assert.ok(previewSource.includes("viewerAgentId={session?.user?.agentId ?? null}"));
const dialogSource = readFileSync("src/components/homix/send-dialog.tsx", "utf8");
assert.ok(dialogSource.includes("<InvoiceEmailAttachments"), "notice must be in the actual send dialog");
console.log("deal-entry split visibility and invoice attachment UI tests passed");
