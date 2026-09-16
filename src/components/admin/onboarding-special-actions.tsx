"use client";
import { useState, type ComponentProps } from "react";
import { useSession } from "next-auth/react";
import { useLocale } from "@/lib/i18n-client";
import { fmtTimestamp, dbTimeMs, dbDatePart } from "@/lib/db-time";
import type { LimitedCapability, VerifiedManualContract } from "@/db/schema";
import type { onboardingAdminRecords } from "@/lib/onboarding-admin";

export type OnboardingRecords = Awaited<
  ReturnType<typeof onboardingAdminRecords>
>;
const inputClass =
  "w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm focus:outline-2 focus:outline-stone-500";
const actionErrors: Record<string, string> = {
  "Administrator access required": "需要管理员权限",
  "Agent not found": "未找到该经纪人",
  "Contract not found": "未找到该合同",
  "Only an uploaded or returned version can be verified": "只能核验待核验或已退回的合同版本",
  "Verify the person's identity, licence and matching legal company first": "请先核对本人身份、执照及一致的持证公司",
  "Verify the selected team compensation terms in the signed file after team approval.": "请先完成团队审批，再核对已签文件中适用的团队分佣条款",
  "Only the accepted version can be revoked": "只能撤销已核验的合同版本",
  "Revoke an accepted contract instead of returning it": "已核验合同请使用撤销核验操作",
  "Limited access is only available for pending agents": "仅待入职经纪人可设置有限权限",
  "Select a deadline within the next 90 days": "请选择未来 90 天内的截止时间",
  "Select an active administrator responsible for completion": "请选择一名在职管理员负责跟进",
  "The grant is no longer open": "该授权已结束，请刷新状态",
  "Verify the current historical contract before recognizing existing staff": "按既有人员办理前，请先核验当前适用的历史合同",
  "Complete the person's profile first": "请先补全本人资料",
  "Confirm in DOS that this license is affiliated with the selected company before activation": "请先在执照卡片确认 DOS 已正式接收该执照",
  "Confirm team membership and compensation terms first": "请先确认团队归属与分佣条款",
  "Match the current fee payment first": "请先核对本次应付费用与收款",
  "Receipt not found": "未找到该收款记录",
  "Only an unmatched receipt can be processed. Settled payments require the finance adjustment workflow.": "只能处理待匹配收款；已结算款项请使用财务调整流程",
  "The receipt is saved. Complete the profile, contract and team terms before matching the onboarding fee.": "收款已保留；补全资料、合同及团队条款后，再匹配入职费用",
  "The fee is already paid. Keep this additional receipt unmatched for finance reconciliation.": "该费用已付清；这笔额外收款将保留待匹配，由财务核对",
  "Select the applicable payment plan first": "请先选择适用的付费方案",
  "This request or payment reference has already been recorded. Review the existing receipt.": "该请求或收款凭据已登记，请查看现有记录",
  "Check the PDF, contract details and signing dates": "请检查 PDF、合同资料及签署日期",
  "Unable to register this PDF. No verification was recorded.": "PDF 登记失败，尚未记录核验结果，请重试",
};
function ExplainedAction({ disabledReason = "", children, ...props }: ComponentProps<"button"> & { disabledReason?: string }) {
  return <span className="inline-flex max-w-full flex-col items-start gap-1">
    <button {...props} disabled={Boolean(disabledReason)} title={disabledReason || undefined}>{children}</button>
    {disabledReason && <span className="max-w-xs text-xs text-stone-500">{disabledReason}</span>}
  </span>;
}

export function OnboardingSpecialActions({
  agentId,
  company,
  manual,
  dosReady,
  records,
  onChanged,
  onBusyChange,
}: {
  agentId: number;
  company: string | null;
  manual: VerifiedManualContract | null;
  dosReady: boolean;
  records: OnboardingRecords;
  onChanged: () => Promise<void>;
  onBusyChange?: (busy: boolean) => void;
}) {
  const zh = useLocale() === "zh";
  const describeError = (e: unknown) => {
    const message = e instanceof Error ? e.message : "";
    return (zh && actionErrors[message]) || message || (zh ? "保存失败，请重试" : "Unable to save; please retry");
  };
  const { data: session } = useSession();
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const [mode, setMode] = useState<
    "" | "upload" | "grant" | "existing" | "disposition" | "close_online"
  >("");
  const [reason, setReason] = useState("");
  const [verifiedTerms, setVerifiedTerms] = useState<Record<string, boolean>>(
    {},
  );
  const [capabilities, setCapabilities] = useState<LimitedCapability[]>([
    "training",
  ]);
  const savingReason = busy ? (zh ? "正在保存，请稍候。" : "Saving; please wait.") : "";
  const decisionReason = savingReason || (reason.trim().length < 5 ? (zh ? "请填写上述处理依据，至少 5 个字符。" : "Enter a decision reason above (at least 5 characters).") : "");
  const labels = {
    uploaded: zh ? "待核验" : "Awaiting verification",
    accepted: zh ? "已核验" : "Verified",
    returned: zh ? "已退回" : "Returned",
    revoked: zh ? "已撤销" : "Revoked",
    superseded: zh ? "已被新版本替代" : "Superseded",
  };
  const run = async (action: Record<string, unknown>) => {
    setBusy(true);
    onBusyChange?.(true);
    setError("");
    try {
      const response = await fetch(
        `/api/admin/agents/${agentId}/onboarding/commands`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...action, ...(action.action === "match_receipt" ? {} : { reason }) }),
        },
      );
      const body = await response.json();
      if (!response.ok) throw new Error(body.error);
      setMode("");
      setReason("");
      await onChanged();
    } catch (e) {
      setError(describeError(e));
    } finally {
      setBusy(false);
      onBusyChange?.(false);
    }
  };
  const upload = async (form: HTMLFormElement) => {
    const data = new FormData(form),
      file = data.get("file") as File;
    if (!file?.size || file.size > 25 * 1024 * 1024) {
      setError(zh ? "请选择 25 MB 以内的 PDF" : "Select a PDF up to 25 MB");
      return;
    }
    setBusy(true);
    onBusyChange?.(true);
    setError("");
    try {
      const endpoint = `/api/admin/agents/${agentId}/onboarding/contracts`;
      const post = async (value: unknown) => {
        const response = await fetch(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(value),
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error);
        return result;
      };
      const prepared = await post({
        action: "upload",
        fileName: file.name,
        byteSize: file.size,
      });
      const sent = await fetch(prepared.uploadUrl, {
        method: "PUT",
        headers: { "Content-Type": "application/pdf" },
        body: file,
      });
      if (!sent.ok)
        throw new Error(
          zh ? "文件上传失败，请重试" : "Upload failed; please retry",
        );
      await post({
        action: "register",
        uploadId: prepared.uploadId,
        fileName: file.name,
        source: data.get("source"),
        company: data.get("company"),
        title: data.get("title"),
        version: data.get("version"),
        purpose: "agent_affiliation",
        agentSignedAt: data.get("agentSignedAt"),
        companySignedAt: data.get("companySignedAt") || null,
        replacesId: data.get("replacesId") || null,
      });
      setMode("");
      await onChanged();
    } catch (e) {
      setError(describeError(e));
    } finally {
      setBusy(false);
      onBusyChange?.(false);
    }
  };
  const field = (
    label: string,
    name: string,
    type = "text",
    defaultValue?: string,
    required = true,
  ) => (
    <label className="block space-y-1 text-sm">
      {label}
      <input
        className={inputClass}
        name={name}
        type={type}
        required={required}
        defaultValue={defaultValue}
      />
    </label>
  );
  return (
    <div className="space-y-6">
      {error && (
        <p
          role="alert"
          className="rounded-lg bg-red-50 p-3 text-sm text-red-800"
        >
          {error}
        </p>
      )}
      <label className="block space-y-1 text-sm font-medium">
        {zh
          ? "高级核验、更正或授权说明（普通收款匹配不需要）"
          : "Advanced verification, correction or access reason (not needed for receipt matching)"}
        <textarea
          className={inputClass}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          rows={2}
          minLength={5}
          maxLength={2000}
          placeholder={
            zh
              ? "说明核验依据或需要特殊处理的原因"
              : "Describe the evidence or reason for the decision"
          }
        />
      </label>
      <section className="space-y-3 border-t pt-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="font-medium">
            {zh ? "线下与历史合同" : "Paper & historical contracts"}
          </h3>
          <ExplainedAction
            className="admin-control"
            disabledReason={savingReason}
            onClick={() => setMode(mode === "upload" ? "" : "upload")}
          >
            {zh ? "登记已签合同" : "Register signed contract"}
          </ExplainedAction>
        </div>
        {records.contracts.length === 0 && (
          <p className="text-sm text-stone-500">
            {zh
              ? "上传已签 PDF 后由管理员核验，电子签署状态保持真实。"
              : "Upload an executed PDF for verification. Electronic signing status remains unchanged."}
          </p>
        )}
        {records.contracts.map((c) => (
          <article
            key={c.id}
            className="space-y-2 rounded-xl border bg-white p-3 text-sm"
          >
            <a
              className="font-medium underline"
              target="_blank"
              rel="noopener noreferrer"
              href={`/api/onboarding/contracts/${c.id}`}
            >
              {c.title} · {c.version} ↗
            </a>
            <p>
              {labels[c.status]} ·{" "}
              {c.source === "historic"
                ? zh
                  ? "历史合同"
                  : "Historical"
                : zh
                  ? "纸质签署"
                  : "Paper"}{" "}
              · {c.company}
            </p>
            <p className="text-xs text-stone-500">
              {zh ? "本人签署" : "Agent signed"}:{" "}
              {dbDatePart(c.agentSignedAt)} ·{" "}
              {zh ? "公司签署" : "Company signed"}:{" "}
              {c.companySignedAt
                ? dbDatePart(c.companySignedAt)
                : zh
                  ? "仍待完成"
                  : "Outstanding"}
            </p>
            {c.reviewReason && <p className="text-xs">{c.reviewReason}</p>}
            {["uploaded", "returned"].includes(c.status) && (
              <label className="flex items-start gap-2 text-sm">
                <input
                  className="mt-1"
                  type="checkbox"
                  checked={Boolean(verifiedTerms[c.id])}
                  onChange={(e) =>
                    setVerifiedTerms({
                      ...verifiedTerms,
                      [c.id]: e.target.checked,
                    })
                  }
                />
                {zh
                  ? "已核对本人签名、持证公司及适用分佣条款；团队成员还须包含当前团队条款。"
                  : "I verified the person's signature, legal company and applicable compensation terms, including current team terms for a Team Member."}
              </label>
            )}
            <div className="flex flex-wrap gap-2">
              {["uploaded", "returned"].includes(c.status) && (
                <>
                  <ExplainedAction
                    className="admin-control"
                    disabledReason={decisionReason || (!verifiedTerms[c.id] ? (zh ? "请先确认已核对签名、公司及适用条款。" : "Confirm the signature, company and applicable terms first.") : "")}
                    onClick={() =>
                      void run({
                        action: "review_contract",
                        contractId: c.id,
                        decision: "accept",
                        teamTermsVerified: Boolean(verifiedTerms[c.id]),
                      })
                    }
                  >
                    {zh ? "核验通过" : "Verify"}
                  </ExplainedAction>
                  <ExplainedAction
                    className="admin-control"
                    disabledReason={decisionReason}
                    onClick={() =>
                      void run({
                        action: "review_contract",
                        contractId: c.id,
                        decision: "return",
                      })
                    }
                  >
                    {zh ? "退回补充" : "Return for correction"}
                  </ExplainedAction>
                </>
              )}
              {c.status === "accepted" && (
                <ExplainedAction
                  className="admin-control"
                  disabledReason={decisionReason}
                  onClick={() =>
                    void run({
                      action: "review_contract",
                      contractId: c.id,
                      decision: "revoke",
                    })
                  }
                >
                  {zh ? "撤销核验" : "Revoke verification"}
                </ExplainedAction>
              )}
            </div>
          </article>
        ))}
        {records.signingRequestId &&
          ((records.signingClosure?.status !== "completed" &&
            ["sent", "preparing", "expired"].includes(
              records.agreementStatus,
            )) ||
            records.signingClosure?.status === "failed") && (
            <ExplainedAction
              className="admin-control"
              disabledReason={savingReason}
              onClick={() => setMode("close_online")}
            >
              {zh ? "取消已不用的线上邀请" : "Close unused online invitations"}
            </ExplainedAction>
          )}
        {records.signingClosure && (
          <p className="text-sm">
            {records.signingClosure.status === "completed"
              ? zh
                ? "线上邀请已关闭，完成合同仍保留。"
                : "Online invitations closed; completed documents are retained."
              : records.signingClosure.status === "failed"
                ? zh
                  ? "上次取消未全部完成，记录已保留，请重试。"
                  : "The last cancellation did not fully complete. Retry; the attempt is recorded."
                : zh
                  ? "取消请求正在核对，未确认完成前仍保留待办。"
                  : "Cancellation is being reconciled; the task remains until confirmed."}
          </p>
        )}
        {mode === "close_online" && (
          <div className="rounded-lg border p-3 space-y-2">
            <p className="text-sm">
              {zh
                ? "这会取消尚未完成的线上签署邀请并放弃未发送草稿。已完成合同、线下核验、实际收款和账号权限会保留。请在上方填写原因。"
                : "This cancels outstanding online invitations and discards unsent drafts. Completed contracts, offline verification, receipts and account access are retained. Enter a reason above."}
            </p>
            <ExplainedAction
              className="admin-control"
              disabledReason={decisionReason}
              onClick={() => void run({ action: "close_online" })}
            >
              {zh ? "确认关闭线上邀请" : "Confirm closing online invitations"}
            </ExplainedAction>
            <ExplainedAction className="admin-control ml-2" disabledReason={savingReason} onClick={() => setMode("")}>
              {zh ? "返回" : "Back"}
            </ExplainedAction>
          </div>
        )}
        {mode === "upload" && (
          <form
            className="space-y-3 rounded-xl bg-stone-100 p-4"
            onSubmit={(e) => {
              e.preventDefault();
              void upload(e.currentTarget);
            }}
          >
            <label className="block space-y-1 text-sm">
              {zh ? "合同来源" : "Contract source"}
              <select name="source" className={inputClass}>
                <option value="paper">
                  {zh ? "纸质 / 线下签署" : "Paper / offline signing"}
                </option>
                <option value="historic">
                  {zh
                    ? "既有员工历史合同"
                    : "Existing staff historical contract"}
                </option>
              </select>
            </label>
            {field(
              zh ? "持证公司" : "Legal company",
              "company",
              "text",
              company || "",
            )}
            {field(zh ? "合同名称" : "Contract title", "title")}
            {field(zh ? "版本 / 日期标识" : "Version / edition", "version")}
            <div className="grid gap-3 sm:grid-cols-2">
              {field(
                zh ? "本人签署日期" : "Agent signed date",
                "agentSignedAt",
                "date",
              )}
              {field(
                zh
                  ? "公司签署日期（未签留空）"
                  : "Company signed date (blank if due)",
                "companySignedAt",
                "date",
                undefined,
                false,
              )}
            </div>
            <label className="block space-y-1 text-sm">
              {zh ? "替换哪个版本" : "Replaces version"}
              <select name="replacesId" className={inputClass}>
                <option value="">
                  {zh ? "首次登记 / 独立合同" : "New record"}
                </option>
                {records.contracts.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.title} · {c.version}
                  </option>
                ))}
              </select>
            </label>
            <label className="block space-y-1 text-sm">
              PDF ≤ 25 MB
              <input
                className={inputClass}
                name="file"
                type="file"
                accept="application/pdf,.pdf"
                required
              />
            </label>
            <ExplainedAction className="admin-control" disabledReason={savingReason}>
              {busy
                ? zh
                  ? "正在上传…"
                  : "Uploading…"
                : zh
                  ? "上传并等待核验"
                  : "Upload for verification"}
            </ExplainedAction>
          </form>
        )}
      </section>
      <section className="space-y-3 border-t pt-4">
        <h3 className="font-medium">{zh ? "实际收款记录" : "Receipts"}</h3>
        <p className="text-sm text-stone-500">
          {zh
            ? "登记到账不要求先签署。匹配入职费用时再校验合同和方案；多收或金额不符保留待核对。"
            : "Receipts can be recorded before signing. Matching validates the agreement and plan; extra or differing amounts remain for reconciliation."}
        </p>
        {records.receipts.map((r) => (
          <article
            className="space-y-2 rounded-xl border p-3 text-sm"
            key={r.id}
          >
            <p className="font-medium">
              ${(r.amountCents / 100).toFixed(2)} · {({ check: zh ? "支票" : "Check", cash: zh ? "现金" : "Cash", ach: "ACH", zelle: "Zelle", wire: zh ? "电汇" : "Wire", other: zh ? "其他" : "Other" } as Record<string, string>)[r.method] || r.method} · {r.reference}
            </p>
            <p>
              {dbDatePart(r.receivedAt)} ·{" "}
              {r.status === "matched"
                ? zh
                  ? "已匹配入职费用"
                  : "Matched to onboarding fee"
                : r.status === "voided"
                  ? zh
                    ? "已更正作废"
                    : "Voided with reason"
                  : zh
                    ? "已收款 · 待匹配"
                    : "Received · unmatched"}
            </p>
            {r.reason && <p>{r.reason}</p>}
            {r.status === "unmatched" && (
              <div className="flex flex-wrap gap-2">
                <ExplainedAction
                  className="admin-control"
                  disabledReason={savingReason}
                  onClick={() =>
                    void run({ action: "match_receipt", receiptId: r.id })
                  }
                >
                  {zh ? "核对并匹配入职费用" : "Match onboarding fee"}
                </ExplainedAction>
                <ExplainedAction
                  className="admin-control"
                  disabledReason={decisionReason}
                  onClick={() =>
                    void run({ action: "void_receipt", receiptId: r.id })
                  }
                >
                  {zh ? "更正错误记录" : "Void incorrect record"}
                </ExplainedAction>
              </div>
            )}
          </article>
        ))}
      </section>
      <section className="space-y-3 border-t pt-4">
        <h3 className="font-medium">
          {zh ? "账号权限与特殊办理" : "Access & special handling"}
        </h3>
        <p className="text-sm">
          {records.access?.full
            ? zh
              ? "完整工作台权限"
              : "Full workspace access"
            : records.access?.limited
              ? zh
                ? "例外开放 · 仍需补齐入职"
                : "Temporary access · onboarding incomplete"
              : zh
                ? "仅入职办理"
                : "Onboarding access only"}
        </p>
        {records.grants.map((g) => (
          <div className="rounded-xl border p-3 text-sm" key={g.id}>
            <p>
              {g.capabilities
                .map(
                  (c) =>
                    ({
                      profile: zh ? "本人资料" : "Profile",
                      training: zh ? "培训" : "Training",
                      resources: zh ? "资料库" : "Resources",
                    })[c],
                )
                .join(" · ")}{" "}
              · {fmtTimestamp(g.expiresAt)}
            </p>
            <p className="mt-1 text-stone-600">
              {g.reason} · {g.outstandingRequirements}
            </p>
            <p>
              {g.status === "open"
                ? (dbTimeMs(g.expiresAt) ?? 0) <= Date.now()
                  ? zh
                    ? "已到期"
                    : "Expired"
                  : zh
                    ? "有效"
                    : "Open"
                : g.status === "completed"
                  ? zh
                    ? "正规入职已完成"
                    : "Normal access obtained"
                  : zh
                    ? "已撤销"
                    : "Revoked"}
            </p>
            {g.status === "open" && (
              <ExplainedAction
                className="admin-control mt-2"
                disabledReason={decisionReason}
                onClick={() =>
                  void run({ action: "revoke_access", grantId: g.id })
                }
              >
                {zh ? "撤销有限权限" : "Revoke limited access"}
              </ExplainedAction>
            )}
          </div>
        ))}
        <div className="flex flex-wrap gap-2">
          <ExplainedAction
            className="admin-control"
            disabledReason={savingReason || (records.access?.full ? (zh ? "账号已有完整权限。" : "The account already has full access.") : "")}
            onClick={() => setMode(mode === "grant" ? "" : "grant")}
          >
            {zh ? "设置有限权限" : "Set limited access"}
          </ExplainedAction>
          <ExplainedAction
            className="admin-control"
            disabledReason={savingReason || (records.access?.full ? (zh ? "账号已有完整权限。" : "The account already has full access.") : !dosReady ? (zh ? "请先在执照卡片确认 DOS 接收。" : "Confirm DOS affiliation in the license card first.") : manual?.source !== "historic" ? (zh ? "请先核验适用的历史合同。" : "Verify the applicable historical contract first.") : "")}
            onClick={() => setMode(mode === "existing" ? "" : "existing")}
          >
            {zh ? "按既有人员开通" : "Activate existing staff"}
          </ExplainedAction>
          <ExplainedAction
            className="admin-control"
            disabledReason={savingReason}
            onClick={() => setMode(mode === "disposition" ? "" : "disposition")}
          >
            {zh ? "暂缓 / 恢复办理" : "Defer / resume intake"}
          </ExplainedAction>
        </div>
        {mode === "grant" && (
          <form
            className="space-y-3 rounded-xl bg-stone-100 p-4"
            onSubmit={(e) => {
              e.preventDefault();
              const data = new FormData(e.currentTarget);
              void run({
                action: "grant_access",
                capabilities,
                expiresAt: new Date(
                  String(data.get("expiresAt")),
                ).toISOString(),
                responsibleAgentId: session?.user.agentId,
                outstandingRequirements: data.get("outstandingRequirements"),
              });
            }}
          >
            <p className="text-sm">
              {zh
                ? "仅开放所选功能。到期立即失效，不开放客户合同、财务或管理员能力。你将作为补齐事项的负责人。"
                : "Only selected capabilities are enabled until the deadline. Customer signing, finance and admin access remain unavailable. You are responsible for follow-up."}
            </p>
            {(["profile", "training", "resources"] as const).map((c) => (
              <label
                className="mr-4 inline-flex items-center gap-2 text-sm"
                key={c}
              >
                <input
                  type="checkbox"
                  checked={capabilities.includes(c)}
                  onChange={(e) =>
                    setCapabilities(
                      e.target.checked
                        ? [...capabilities, c]
                        : capabilities.filter((v) => v !== c),
                    )
                  }
                />
                {
                  {
                    profile: zh ? "本人资料" : "Profile",
                    training: zh ? "培训" : "Training",
                    resources: zh ? "资料库" : "Resources",
                  }[c]
                }
              </label>
            ))}
            {field(
              zh ? "截止时间（当地时间）" : "Deadline (local time)",
              "expiresAt",
              "datetime-local",
            )}
            {field(
              zh ? "需补齐的事项" : "Outstanding requirements",
              "outstandingRequirements",
            )}
            <ExplainedAction
              className="admin-control"
              disabledReason={decisionReason || (!capabilities.length ? (zh ? "至少选择一项有限功能。" : "Select at least one limited capability.") : "")}
            >
              {zh ? "保存有限权限" : "Save limited access"}
            </ExplainedAction>
          </form>
        )}
        {mode === "existing" && (
          <form
            className="space-y-3 rounded-xl bg-stone-100 p-4"
            onSubmit={(e) => {
              e.preventDefault();
              const data = new FormData(e.currentTarget);
              void run({
                action: "existing_staff",
                contractId: manual?.id,
                identityAndTermsVerified: true,
                billingBasis: data.get("billingBasis"),
                billingEvidence: data.get("billingEvidence"),
              });
            }}
          >
            <label className="block text-sm">
              <input type="checkbox" required />{" "}
              {zh
                ? "已核对本人身份、公司及现行条款"
                : "Identity, company and applicable terms verified"}
            </label>
            <label className="block space-y-1 text-sm">
              {zh ? "收费适用依据" : "Billing basis"}
              <select className={inputClass} name="billingBasis">
                <option value="not_applicable">
                  {zh
                    ? "本次无需新入职收费"
                    : "New onboarding fee not applicable"}
                </option>
                <option value="historically_verified">
                  {zh
                    ? "已核对历史财务依据"
                    : "Historical financial evidence verified"}
                </option>
                <option value="current_payment">
                  {zh ? "使用本次已匹配付款" : "Current matched payment"}
                </option>
              </select>
            </label>
            {field(
              zh ? "财务核验依据 / 凭据说明" : "Financial evidence / reference",
              "billingEvidence",
            )}
            <ExplainedAction
              className="admin-control"
              disabledReason={decisionReason}
            >
              {zh
                ? "确认既有人员并开通"
                : "Recognize & activate existing staff"}
            </ExplainedAction>
          </form>
        )}
        {mode === "disposition" && (
          <div className="flex flex-wrap gap-2 rounded-xl bg-stone-100 p-4">
            {(
              [
                ["deferred", zh ? "暂缓办理" : "Defer"],
                ["closed", zh ? "关闭本次入职" : "Close intake"],
                ["open", zh ? "恢复办理" : "Resume"],
              ] as const
            ).map(([disposition, label]) => (
              <ExplainedAction
                key={disposition}
                className="admin-control"
                disabledReason={decisionReason}
                onClick={() => void run({ action: "disposition", disposition })}
              >
                {label}
              </ExplainedAction>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
