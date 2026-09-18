# Company Listing, disclosure and commercial packages

The signing workspace has four company entry points: Buyer, Seller /
Listing, Commercial & other, and Company File. The new `commercial` scenario reuses company
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

Company File and independently reviewed document composition are described in
[the September 15 implementation plan](plans/2026-09-15-independent-signing-packages.md).
New buyer packages reference separate approved document versions and produce one
native envelope with separate PDF items, instead of a physically merged source PDF.

## 选择文件时预览

在买家、Seller / Listing、商业及其他、Company File 中选择公司文件后，点击「预览文件」即可查看发布版本的原始 PDF，无需先填写客户、交易资料或创建草稿。多文件包可以逐份切换并翻页；下载链接也经过相同公司权限检查。这里显示尚未填写的公司模板，正式发出前仍要核对具体任务的预填资料和收件人。

Portal 的 `GET /api/signing/packages/:id/files?partIndex=0&fileIndex=0` 验证在职经纪人和实际所属公司，Bridge 对应只读接口验证发布版本、公司模板归属、文件哈希及组合包中独立文件的启用状态。浏览器不会得到公司签署凭据或原生模板编辑权限；预览不会创建签署任务或发送邀请。
