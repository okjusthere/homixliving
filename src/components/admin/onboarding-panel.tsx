"use client";
import { OnboardingLicenseCard, type LicenseDetail } from "./onboarding-license-card";
import {
  OnboardingSpecialActions,
  type OnboardingRecords,
} from "@/components/admin/onboarding-special-actions";
import type { VerifiedManualContract } from "@/db/schema";
import { fmtTimestamp } from "@/lib/db-time";
import { OnboardingCompletion, type OnboardingFee } from "./onboarding-completion";
import { TASK_LABELS, type OnboardingTaskSummary } from "@/lib/onboarding-tasks";
import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, Circle, RefreshCw, ExternalLink } from "lucide-react";
import { EditPanel } from "@/components/admin/edit-panel";
import { useLocale } from "@/lib/i18n-client";
import {
  ONBOARDING_NEXT,
  type OnboardingWorkflow,
} from "@/lib/onboarding-workflow";

import type { SigningRequest } from "@/lib/signing-contract";
import type { HrFileManifest } from "@/lib/signing-hr-files";
type Detail = {
  agent: LicenseDetail & {
    name: string;
    email: string;
    accountStatus: string;
    agreementStatus: string;
    paymentStatus: string;
    licensedCompany: string | null;
    plan: string;
    manualContract: VerifiedManualContract | null;
    websiteSync?: { status: "pending" | "complete"; attemptedAt: string } | null;
  };
  records: OnboardingRecords;
  events: Array<{
    id: number;
    type: string;
    at: string;
    actorId: number | null;
    detail: Record<string, unknown> | null;
  }>;
  workflow: OnboardingWorkflow & { canComplete?: boolean };
  fee: OnboardingFee | null;
  tasks?: OnboardingTaskSummary;
  payment: {
    channel: string;
    amountCents: number;
    paidAt: string;
    reference: string | null;
    verifiedBy: string | null;
  } | null;
  signing: ({ request: SigningRequest } & HrFileManifest) | null;
  warning: boolean;
};

export function OnboardingPanel({
  agentId,
  onClose,
  onChanged,
  onEdit,
  onOffline,
  onApprove,
  approvalFields,
}: {
  agentId: number;
  onClose: () => void;
  onChanged: () => void;
  onEdit: () => void;
  onOffline: () => void;
  onApprove: () => Promise<void>;
  approvalFields?: React.ReactNode;
}) {
  const zh = useLocale() === "zh";
  const [detail, setDetail] = useState<Detail | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch(`/api/admin/agents/${agentId}/onboarding`, {
        cache: "no-store",
      });
      if (!response.ok) throw new Error();
      setDetail(await response.json());
    } catch {
      setError(
        zh
          ? "暂时无法读取入职状态，请重试。"
          : "Could not load onboarding. Please retry.",
      );
    } finally {
      setLoading(false);
    }
  }, [agentId, zh]);
  useEffect(() => {
    void load();
  }, [load]);
  const resend = async (recipient: "agent" | "company") => {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const response = await fetch(`/api/admin/agents/${agentId}/onboarding`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "resend", recipient }),
      });
      const body = await response.json();
      if (!response.ok)
        throw new Error(
          response.status === 429
            ? zh
              ? "刚刚已请求发送，请稍后再试。"
              : "A reminder was just requested. Please wait."
            : zh
              ? "当前无法重发，请刷新签约状态。"
              : "Unable to resend. Refresh the signing status.",
        );
      setMessage(
        zh
          ? `已请求手动提醒${body.email ? `：${body.email}` : ""}。签署进度保留；此结果不代表邮件已送达。`
          : `Manual reminder requested${body.email ? ` for ${body.email}` : ""}. Signing progress is retained; this does not confirm email delivery.`,
      );
      await load();
      onChanged();
    } catch (error) {
      setError((error as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const approve = async () => {
    setBusy(true);
    setError("");
    try {
      await onApprove();
      await load();
    } catch (error) {
      setError(error instanceof Error ? error.message : (zh ? "开通失败，请重试。" : "Activation failed; please retry."));
    } finally {
      setBusy(false);
    }
  };
  const signing = detail?.signing;
  const retryWebsite = async () => {
    setBusy(true); setError("");
    try {
      const response = await fetch(`/api/admin/agents/${agentId}/onboarding/commands`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "retry_website_sync" }),
      });
      if (!response.ok) throw new Error(zh ? "账号已开通，但官网仍未同步。待办会保留，请稍后重试。" : "The account is active, but website sync still needs a retry.");
      await load(); onChanged();
    } catch (error) { setError((error as Error).message); }
    finally { setBusy(false); }
  };
  const waiting = busy || loading;
  const fullyWaived = Boolean(detail?.agent.paymentStatus === "not_required" && detail.fee?.adjustment && detail.fee.dueAmountCents === 0 && detail.fee.waivedAmountCents === detail.fee.originalAmountCents);
  const approvalReasons: string[] = [];
  if (waiting) approvalReasons.push(zh ? "正在处理或刷新，请稍候。" : "An operation or refresh is in progress.");
  if (detail?.warning) approvalReasons.push(zh ? "请先刷新并核实签署状态。" : "Refresh and verify signing status first.");
  if (detail) {
    if (detail.agent.accountStatus !== "pending") approvalReasons.push(zh ? "仅待开通账号需要审批。" : "Only pending accounts need approval.");
    if (!detail.workflow.profileReady) approvalReasons.push(zh ? "本人资料尚未补齐。" : "The agent profile is incomplete.");
    if (!detail.workflow.signed) approvalReasons.push(zh ? "本人合同要求尚未完成。" : "The agent contract requirement is incomplete.");
    if (!detail.workflow.teamReady) approvalReasons.push(zh ? "团队归属或分佣条款尚未确认。" : "Team membership or compensation terms are not confirmed.");
    if (!fullyWaived && !(detail.agent.paymentStatus === "paid" && ["offline", "stripe"].includes(detail.payment?.channel || ""))) approvalReasons.push(zh ? "请先核验付款，或使用上方费用确认与开通流程。" : "Verify payment first, or use Confirm fee & activate above.");
    if (!detail.workflow.canApprove && !approvalReasons.length) approvalReasons.push(zh ? "服务端尚未确认可审批，请刷新状态。" : "Approval is not available yet. Refresh the current status.");
  }
  const reminderReason = (actor: "owner" | "company") => waiting
    ? (zh ? "正在处理或刷新，请稍候。" : "An operation or refresh is in progress.")
    : detail?.warning ? (zh ? "须先刷新并核实签署状态。" : "Refresh and verify signing status first.")
    : !needsReminder(actor) ? (zh ? "当前没有轮到此签署人的未完成签署。" : "No unsigned step is currently available for this signer.") : "";
  const needsReminder = (actor: "owner" | "company") =>
    Boolean(
      signing?.request.parts.some((part) => {
        if (part.document?.status !== "PENDING") return false;
        const unsigned = part.document.recipients.filter(
          (r) => r.role !== "CC" && r.signingStatus === "NOT_SIGNED",
        );
        const first =
          part.document.signingOrder === "SEQUENTIAL"
            ? Math.min(...unsigned.map((r) => r.signingOrder ?? 1))
            : null;
        return unsigned.some(
          (r) =>
            r.actor === actor &&
            (first === null || (r.signingOrder ?? 1) === first),
        );
      }),
    );
  const eventLabel = (type: string) => {
    const names: Record<string, [string, string]> = {
      confirm_dos: ["已更新 DOS 人工核实记录", "DOS verification updated"],
      dos_legacy_confirmation_backfilled: ["管理员授权的存量 DOS 确认", "Administrator-authorized historical DOS confirmation"],
      license_release_declared: ["本人已更新 release 申报", "Release declaration updated"],
      documenso_agreement_prepared: [
        "已准备电子合同",
        "Electronic agreement prepared",
      ],
      documenso_agreement_refreshed: [
        "已核对电子签署状态",
        "Electronic signing status checked",
      ],
      documenso_agreement_restarted: [
        "已重新发起电子合同",
        "Electronic agreement restarted",
      ],
      documenso_agreement_superseded: [
        "已用新合同替代旧任务",
        "Agreement replaced",
      ],
      online_invitations_close_requested: [
        "已请求取消不再使用的邀请",
        "Unused invitation cancellation requested",
      ],
      online_invitations_closed: [
        "已取消不再使用的邀请",
        "Unused invitations closed",
      ],
      online_invitations_close_failed: [
        "邀请取消失败，需重试",
        "Invitation cancellation failed; retry required",
      ],
      review_contract: ["已记录合同核验决定", "Contract review recorded"],
      manual_contract_uploaded: ["已上传合同，等待核验", "Contract uploaded; awaiting verification"],
      grant_access: ["已授予有限权限", "Limited access granted"],
      revoke_access: ["已撤销有限权限", "Limited access revoked"],
      existing_staff: [
        "已按既有人员办理",
        "Existing staff recognition recorded",
      ],
      match_receipt: [
        "已核对收款与入职费用",
        "Receipt matched to onboarding fees",
      ],
      void_receipt: ["已作废收款登记", "Receipt record voided"],
      disposition: ["已更新办理安排", "Intake disposition updated"],
      receipt_recorded: ["已登记实际收款", "Payment receipt recorded"],
      "agreement.reminder_sent": ["管理员已请求签署提醒", "Manual signing reminder requested"],
      "agreement.reminder_requested": ["管理员已请求签署提醒", "Manual signing reminder requested"],
      complete_onboarding: ["已确认费用并开通", "Fee confirmed and account activated"],
      onboarding_completed_by_admin: ["已确认费用并开通", "Fee confirmed and account activated"],
      onboarding_fee_reduced: ["已批准公司费用减免", "Company fee waiver approved"],
      onboarding_test_payments_corrected: ["已清理测试金额并登记真实减免", "Test payments corrected to an approved waiver"],
    };
    return (
      names[type]?.[zh ? 0 : 1] ||
      (zh ? "已记录办理操作" : "Onboarding action recorded")
    );
  };

  return (
    <EditPanel
      title={zh ? "处理入职" : "Manage onboarding"}
      description={
        detail ? `${detail.agent.name} · ${detail.agent.email}` : undefined
      }
      onClose={onClose}
      saving={busy}
      footer={
        <div className="flex flex-wrap gap-2">
          <button className="admin-control" onClick={onEdit} disabled={busy}>
            {zh ? "编辑资料" : "Edit profile"}
          </button>
          <button className="admin-control" onClick={onClose} disabled={busy}>
            {zh ? "关闭" : "Close"}
          </button>
          {busy && <p className="w-full text-xs text-stone-500">{zh ? "正在保存，请完成后再编辑或关闭。" : "Saving; wait before editing or closing."}</p>}
        </div>
      }
    >
      <div className="space-y-5">
        <div className="flex items-center justify-between gap-3">
          <p className="font-medium" role="status">
            {loading
              ? zh
                ? "正在核对最新状态…"
                : "Checking current status…"
              : detail
                ? detail.agent.accountStatus === "active" && detail.tasks?.tasks.length
                  ? (zh ? "账号已开通 · 仍有待办" : "Account active · tasks remain")
                  : ONBOARDING_NEXT[detail.workflow.next][zh ? 0 : 1]
                : ""}
          </p>
          <button
            className="admin-control"
            onClick={() => void load()}
            disabled={loading || busy}
            aria-label={zh ? "刷新状态" : "Refresh status"}
            title={waiting ? (zh ? "正在处理或刷新，请稍候。" : "An operation or refresh is in progress.") : undefined}
          >
            <RefreshCw size={16} />
          </button>
        </div>
        {waiting && <p className="text-xs text-stone-500">{zh ? "当前操作完成后即可刷新或继续办理。" : "Wait for the current operation before refreshing or continuing."}</p>}
        {error && (
          <p role="alert" className="text-sm text-red-700">
            {error}
          </p>
        )}
        {message && (
          <p role="status" className="text-sm text-green-800">
            {message}
          </p>
        )}
        {detail?.warning && (
          <p
            role="alert"
            className="rounded-xl bg-amber-50 p-3 text-sm text-amber-900"
          >
            {zh
              ? "eSign 最新状态暂未核实。以下为已保存记录，请刷新后再操作。"
              : "The latest eSign status is unavailable. Showing saved records; refresh before taking action."}
          </p>
        )}
        {detail && (
          <>
            <OnboardingLicenseCard agentId={agentId} agent={detail.agent} confirmed={detail.workflow.dosReady}
              busy={waiting} onBusy={setBusy} onChanged={async () => { await load(); onChanged(); }} />
            {detail.agent.accountStatus === "active" && detail.agent.websiteSync?.status === "pending" && <section className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm">
              <p>{zh ? "账号已开通，官网同步尚未完成。无需重新审批或付款。" : "Account active; website sync is incomplete. No new approval or payment is needed."}</p>
              <button className="admin-control mt-2" disabled={waiting} onClick={() => void retryWebsite()}>{zh ? "重试官网同步" : "Retry website sync"}</button>
            </section>}
            {detail.agent.accountStatus === "active" && Boolean(detail.tasks?.tasks.length) && <p className="rounded-lg bg-stone-100 p-3 text-sm">{detail.tasks!.tasks.map((task) => TASK_LABELS[task][zh ? 0 : 1]).join(" · ")}</p>}
            {Boolean(detail.records.staleSettlements?.length) && <section role="alert" className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm">
              <p className="font-medium">{zh ? "实际 Stripe 付款需财务核对" : "Actual Stripe payment needs finance review"}</p>
              <p className="mt-1">{zh ? "已保留真实到账，但未覆盖已批准的减免，也未重复发放推荐奖励。请先核对，勿再次收款或直接退款。" : "Actual income is retained without replacing an approved waiver or duplicating sponsor rewards. Reconcile before collecting again or issuing a refund."}</p>
              <ul className="mt-2 list-disc pl-5">{detail.records.staleSettlements.map((item) => <li key={item.id}>#{item.orderId} · {(item.actualAmountCents / 100).toFixed(2)} {item.currency.toUpperCase()} · {fmtTimestamp(item.createdAt)}</li>)}</ul>
            </section>}
            <ol className="divide-y rounded-xl border border-stone-200">
              {[
                [
                  zh ? "本人资料" : "Agent profile",
                  detail.workflow.profileReady,
                  detail.workflow.profileReady ? (zh ? "资料已补齐，将用于待签署文件" : "Profile complete; saved facts carry into signing documents") : zh
                    ? "本人补全姓名、执照、公司及方案"
                    : "Agent completes identity, license, company and plan",
                ],
                [
                  zh ? "本人合同要求" : "Agent contract requirement",
                  detail.workflow.signed,
                  detail.agent.manualContract && detail.workflow.signed ? (zh ? "已核验线下 / 历史签署合同" : "Verified paper / historical signed contract") : signing?.request.parts.flatMap(
                    (p) =>
                      p.document?.recipients
                        .filter((r) => r.actor === "owner")
                        .map((r) => r.email) || [],
                  )[0] ||
                    (zh
                      ? "本人从待办页继续签署"
                      : "Continue from the onboarding page"),
                ],
                [
                  detail.agent.plan === "solo" || detail.agent.plan === "solo_pro" ? (zh ? "团队确认 · 不适用" : "Team & terms · not applicable") : (zh ? "团队确认" : "Team & terms"),
                  detail.agent.plan === "solo" || detail.agent.plan === "solo_pro" || detail.workflow.teamReady,
                  detail.agent.plan === "solo" || detail.agent.plan === "solo_pro" ? (zh ? "Solo 方案无需团队确认。" : "Solo plans do not require team approval.") : zh
                    ? "团队成员须完成入组及分佣条款确认"
                    : "Team members need an accepted team and compensation terms",
                ],
                [
                  zh ? "费用处理" : "Fee settlement",
                  Boolean(detail.payment) || fullyWaived,
                  detail.payment
                    ? `${detail.payment.channel === "offline" ? (zh ? "管理员已核验" : "Admin verified") : "Stripe"} · $${(detail.payment.amountCents / 100).toFixed(2)}`
                    : fullyWaived ? (zh ? "公司已全额减免；无收款记录" : "Fully waived by the company; no receipt") : zh
                      ? "线上付款，或由管理员核验线下收款"
                      : "Online payment or admin-verified offline receipt",
                ],
                [
                  zh ? "账号开通" : "Portal access",
                  detail.agent.accountStatus === "active",
                  detail.agent.accountStatus === "active" ? (zh ? "账号已开通，可以进入 Portal" : "Account active; Portal access is available") : zh
                    ? "本人签署并完成线上付款后自动开通；线下收款由管理员核验。DOS 单独跟进，已付款无需重付"
                    : "Agent signature and verified online payment activate access automatically. Admins verify offline payments and follow up on DOS separately; do not collect paid fees again",
                ],
              ].map(([label, done, help]) => (
                <li key={String(label)} className="flex gap-3 p-4">
                  {done ? (
                    <CheckCircle2
                      className="mt-0.5 shrink-0 text-green-700"
                      size={19}
                    />
                  ) : (
                    <Circle
                      className="mt-0.5 shrink-0 text-stone-400"
                      size={19}
                    />
                  )}
                  <div>
                    <p className="text-sm font-medium">{label}</p>
                    <p className="mt-1 text-xs text-stone-500">{help}</p>
                  </div>
                </li>
              ))}
            </ol>
            <OnboardingCompletion
              agentId={agentId}
              fee={detail.fee ?? null}
              accountStatus={detail.agent.accountStatus}
              paymentStatus={detail.agent.paymentStatus}
              paymentChannel={detail.payment?.channel ?? null}
              canComplete={detail.workflow.canComplete === true}
              profileReady={detail.workflow.profileReady}
              signed={detail.workflow.signed}
              teamReady={detail.workflow.teamReady}
              warning={detail.warning}
              loading={loading}
              busy={busy}
              receipts={detail.records.receipts}
              onBusyChange={setBusy}
              onRecordOnly={onOffline}
              onChanged={async () => { onChanged(); await load(); }}
            />
            <section className="space-y-3">
              <h3 className="font-medium">
                {zh ? "合同与签署" : "Agreement & signatures"}
              </h3>
              {signing?.documents.map((d) => (
                <a
                  key={d.id}
                  className="flex items-center gap-2 text-sm underline underline-offset-4"
                  href={d.originalUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <ExternalLink size={14} />
                  {zh
                    ? "查看原合同（未含签名）"
                    : "Original agreement (without signatures)"}{" "}
                  · {d.name}
                </a>
              ))}
              {signing?.documents
                .filter((d) => d.signedUrl)
                .map((d) => (
                  <a
                    key={`signed-${d.id}`}
                    className="block text-sm underline"
                    href={d.signedUrl!}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    {zh ? "已签署文件" : "Signed document"} · {d.name}
                  </a>
                ))}
              {signing?.completionFiles.map((file) => (
                <a
                  key={file.url}
                  className="block text-sm underline"
                  href={file.url}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {file.kind === "certificate"
                    ? zh
                      ? "完成证书"
                      : "Completion certificate"
                    : zh
                      ? "签署审计"
                      : "Signing audit"}{" "}
                  · {file.name}
                </a>
              ))}
              {signing?.request.parts.map((part) => (
                <div key={part.id} className="rounded-lg border p-3 text-sm">
                  <p className="font-medium">{part.document?.title}</p>
                  {part.document?.recipients
                    .filter((r) => r.role !== "CC")
                    .map((r) => (
                      <p key={r.id} className="mt-1 text-stone-600">
                        {r.name} · {r.email} ·{" "}
                        {r.signingStatus === "SIGNED"
                          ? zh
                            ? "已签署"
                            : "Signed"
                          : r.signingStatus === "REJECTED"
                            ? zh
                              ? "已拒绝"
                              : "Rejected"
                            : r.expiresAt &&
                                Date.parse(r.expiresAt) <= Date.now()
                              ? zh
                                ? "链接过期，可重发续期"
                                : "Link expired; resend to renew"
                              : zh
                                ? "待签署"
                                : "Awaiting signature"}
                      </p>
                    ))}
                </div>
              ))}
              {!signing && (
                <p className="text-sm text-stone-500">
                  {detail.agent.manualContract && detail.workflow.signed ? (zh ? "已核验线下 / 历史合同，无需重新生成电子协议。合同档案见高级办理。" : "A paper / historical contract is verified. A new electronic agreement is not required; see contract records under advanced handling.") : zh
                    ? "合同尚未生成。本人完善资料后，系统会生成并发送。"
                    : "Complete the onboarding profile to prepare and send the agreement."}
                </p>
              )}
              {signing && <><div className="flex flex-wrap gap-2">
                <button
                  className="admin-control"
                  title={reminderReason("owner") || undefined}
                  aria-describedby="owner-reminder-reason"
                  disabled={
                    busy || loading || detail.warning || !needsReminder("owner")
                  }
                  onClick={() => void resend("agent")}
                >
                  {zh ? "重发本人签署邮件" : "Resend agent invitation"}
                </button>
                <button
                  className="admin-control"
                  title={reminderReason("company") || undefined}
                  aria-describedby="company-reminder-reason"
                  disabled={
                    busy ||
                    loading ||
                    detail.warning ||
                    !needsReminder("company")
                  }
                  onClick={() => void resend("company")}
                >
                  {zh ? "提醒公司会签" : "Remind company signer"}
                </button>
              </div>
              {reminderReason("owner") && <p id="owner-reminder-reason" className="text-xs text-stone-500">{zh ? "本人提醒：" : "Agent reminder: "}{reminderReason("owner")}</p>}
              {reminderReason("company") && <p id="company-reminder-reason" className="text-xs text-stone-500">{zh ? "公司提醒：" : "Company reminder: "}{reminderReason("company")}</p>}
              <div className="space-y-2 text-xs text-stone-600">
                {detail.events.filter((event) => ["agreement.reminder_sent", "agreement.reminder_requested"].includes(event.type)).map((event) => <p key={event.id}>
                  {zh ? "手动提醒" : "Manual reminder"} · {fmtTimestamp(event.at)} · {zh ? "操作人" : "Requested by"} {event.actorId ? `#${event.actorId}` : (zh ? "未记录" : "not recorded")} · {zh ? "对象" : "Target"}: {event.detail?.recipientActor === "company" ? (zh ? "公司签署人" : "Company signer") : event.detail?.recipientActor === "owner" ? (zh ? "本人" : "Agent") : (zh ? "未记录" : "not recorded")}
                </p>)}
                <p>{zh ? "本人完成电子签署后，系统自动邀请 hr@homixny.com 会签，无需点击提醒。以上按钮仅供手动补发；邮件的 Reminder 标题表示提醒，不是首次邀请。本页不显示收件箱投递确认。" : "After the agent signs electronically, the system automatically invites hr@homixny.com. These buttons are only for manual reminders; Reminder is not the first invitation. Inbox delivery confirmation is not shown here."}</p>
              </div>
              </>}
              {detail.workflow.countersignPending && (
                <p className="text-sm text-stone-600">
                  {zh
                    ? `公司会签待办：${
                        signing?.request.parts
                          .flatMap(
                            (p) =>
                              p.document?.recipients
                                .filter((r) => r.actor === "company")
                                .map((r) => r.email) || [],
                          )
                          .filter((email, i, all) => all.indexOf(email) === i)
                          .join(", ") || "等待公司签署人"
                      }。账号开通后仍会保留这项待办。`
                    : `Company signature due: ${
                        signing?.request.parts
                          .flatMap(
                            (p) =>
                              p.document?.recipients
                                .filter((r) => r.actor === "company")
                                .map((r) => r.email) || [],
                          )
                          .filter((email, i, all) => all.indexOf(email) === i)
                          .join(", ") || "awaiting company signer"
                      }. This task remains after activation.`}
                </p>
              )}
              {["declined", "expired", "voided"].includes(
                detail.agent.agreementStatus,
              ) && (
                <p className="text-sm text-amber-800">
                  {zh
                    ? "链接过期可重发续期并保留签名；已取消或拒签的任务由本人确认重新发起。旧记录及已支付费用会保留。"
                    : "Expired links can be renewed without losing signatures. Cancelled or rejected requests need an explicit restart; history and payments are retained."}
                </p>
              )}
              {detail.agent.agreementStatus === "failed" && (
                <p className="text-sm text-amber-800">
                  {zh
                    ? "签名已保留，但最终文件生成失败。请在 eSign 管理端恢复文件生成，不要要求本人重新签署。"
                    : "Signatures are retained. Recover finalization in eSign instead of asking the agent to sign again."}
                </p>
              )}
            </section>
            <details className="space-y-3 border-t border-stone-200 pt-4">
              <summary className="cursor-pointer text-sm font-medium">{zh ? "高级办理：档案关联、历史合同及有限权限" : "Advanced: profile linking, historical contracts & limited access"}</summary>
              {detail.payment?.reference && (
                <p className="text-sm text-stone-600">
                  {detail.payment.reference} · {detail.payment.verifiedBy}
                </p>
              )}
              <div className="flex flex-wrap gap-2">
                <button
                  className="admin-control"
                  disabled={
                    busy ||
                    loading ||
                    detail.warning ||
                    !detail.workflow.canApprove
                  }
                  onClick={() => void approve()}
                >
                  {zh ? "使用指定官网档案审批" : "Approve with selected website profile"}
                </button>
              </div>
              {detail.workflow.canApprove && approvalFields}
              {approvalReasons.length > 0 && <ul className="space-y-1 text-xs text-stone-500">{approvalReasons.map((reason) => <li key={reason}>{reason}</li>)}</ul>}
              <fieldset disabled={waiting}>
                {waiting && <p className="text-xs text-stone-500">{zh ? "正在处理，请稍候再使用高级操作。" : "An operation is in progress; advanced actions will be available afterward."}</p>}
            <OnboardingSpecialActions
              agentId={agentId}
              company={detail.agent.licensedCompany}
              manual={detail.agent.manualContract}
              records={detail.records}
              onBusyChange={setBusy}
              onChanged={async () => {
                await load();
                onChanged();
              }}
            />
              </fieldset>
            </details>
            <section className="space-y-3 border-t pt-4">
              <h3 className="font-medium">{zh ? "处理记录" : "Activity"}</h3>
              <ol className="space-y-3">
                {detail.events.map((event) => (
                  <li
                    key={event.id}
                    className="border-l-2 border-stone-200 pl-3 text-sm"
                  >
                    <p>{eventLabel(event.type)}</p>
                    <p className="text-xs text-stone-500">
                      {fmtTimestamp(event.at)}
                      {event.actorId ? ` · #${event.actorId}` : ""}
                    </p>
                    {typeof event.detail?.reason === "string" && (
                      <p>{event.detail.reason}</p>
                    )}
                  </li>
                ))}
              </ol>
            </section>
          </>
        )}
      </div>
    </EditPanel>
  );
}
