import assert from "node:assert/strict";
import { bucketLabel } from "../aging";
import { commerceProductName } from "../commerce/catalog";
import { commerceStatusLabel, dealStatusLabel } from "../domain-labels";
import { invoicePaymentLabel } from "../invoice-payment";
import { renewalStatusLabel, windowLabel } from "../renewals";
import { saleRepresentationLabel, saleStageLabel } from "../sales";
import { sourceLabel } from "../sources";

function main() {
  assert.equal(saleRepresentationLabel("buyer_rep", "en"), "Buyer rep");
  assert.equal(saleRepresentationLabel("buyer_rep", "zh"), "买方代理");
  assert.equal(saleStageLabel("under_contract", "en"), "Under contract");
  assert.equal(saleStageLabel("under_contract", "zh"), "已签合同");

  assert.equal(sourceLabel("wechat_group", "en"), "WeChat group");
  assert.equal(sourceLabel("wechat_group", "zh"), "微信群");
  assert.equal(dealStatusLabel("active", "zh"), "进行中");
  assert.equal(invoicePaymentLabel("awaiting_payment", "zh"), "等待付款");

  assert.equal(windowLabel("overdue", "zh"), "已过租期");
  assert.equal(renewalStatusLabel("moving_out", "zh"), "退租中");
  assert.equal(bucketLabel("90+", "zh"), "超过 90 天");

  assert.equal(commerceStatusLabel("past_due", "zh"), "已逾期");
  assert.equal(
    commerceProductName("company_domain_email", "Company domain Email", "zh"),
    "公司域名邮箱",
  );
  assert.equal(commerceProductName("unknown", "Custom service", "zh"), "Custom service");

  console.log("domain label tests passed");
}

main();
