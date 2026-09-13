"use client";
import {
  OnboardingSpecialActions,
  type OnboardingRecords,
} from "@/components/admin/onboarding-special-actions";
import type { VerifiedManualContract } from "@/db/schema";
import { fmtTimestamp } from "@/lib/db-time";
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
  agent: {
    name: string;
    email: string;
    accountStatus: string;
    agreementStatus: string;
    paymentStatus: string;
    licensedCompany: string | null;
    manualContract: VerifiedManualContract | null;
  };
  records: OnboardingRecords;
  events: Array<{
    id: number;
    type: string;
    at: string;
    actorId: number | null;
    detail: Record<string, unknown> | null;
  }>;
  workflow: OnboardingWorkflow;
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
          ? `签署邮件已发送至 ${body.email}。已保存进度会保留，请使用最新邮件。`
          : `Sent to ${body.email}. Saved progress is retained; use the newest email.`,
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
    try {
      await onApprove();
      await load();
    } finally {
      setBusy(false);
    }
  };
  const signing = detail?.signing;
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
                ? ONBOARDING_NEXT[detail.workflow.next][zh ? 0 : 1]
                : ""}
          </p>
          <button
            className="admin-control"
            onClick={() => void load()}
            disabled={loading || busy}
            aria-label={zh ? "刷新状态" : "Refresh status"}
          >
            <RefreshCw size={16} />
          </button>
        </div>
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
            <ol className="divide-y rounded-xl border border-stone-200">
              {[
                [
                  zh ? "本人资料" : "Agent profile",
                  detail.workflow.profileReady,
                  zh
                    ? "本人补全姓名、执照、公司及方案"
                    : "Agent completes identity, license, company and plan",
                ],
                [
                  zh ? "本人合同要求" : "Agent contract requirement",
                  detail.workflow.signed,
                  signing?.request.parts.flatMap(
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
                  zh ? "团队确认" : "Team & terms",
                  detail.workflow.teamReady,
                  zh
                    ? "团队成员须完成入组及分佣条款确认"
                    : "Team members need an accepted team and compensation terms",
                ],
                [
                  zh ? "费用到账" : "Payment",
                  Boolean(detail.payment),
                  detail.payment
                    ? `${detail.payment.channel === "offline" ? (zh ? "管理员已核验" : "Admin verified") : "Stripe"} · $${(detail.payment.amountCents / 100).toFixed(2)}`
                    : zh
                      ? "线上付款，或由管理员核验线下收款"
                      : "Online payment or admin-verified offline receipt",
                ],
                [
                  zh ? "账号开通" : "Portal access",
                  detail.agent.accountStatus === "active",
                  zh
                    ? "线上付款自动开通；线下收款后管理员审批"
                    : "Online payments activate automatically; offline payments require admin approval",
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
                  {zh
                    ? "合同尚未生成。本人完善资料后，系统会生成并发送。"
                    : "Complete the onboarding profile to prepare and send the agreement."}
                </p>
              )}
              <div className="flex flex-wrap gap-2">
                <button
                  className="admin-control"
                  disabled={
                    busy || loading || detail.warning || !needsReminder("owner")
                  }
                  onClick={() => void resend("agent")}
                >
                  {zh ? "重发本人签署邮件" : "Resend agent invitation"}
                </button>
                <button
                  className="admin-control"
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
            <section className="space-y-3 border-t border-stone-200 pt-4">
              <h3 className="font-medium">
                {zh ? "收款与审批" : "Payment & approval"}
              </h3>
              {detail.payment?.reference && (
                <p className="text-sm text-stone-600">
                  {detail.payment.reference} · {detail.payment.verifiedBy}
                </p>
              )}
              <div className="flex flex-wrap gap-2">
                <button
                  className="admin-control"
                  disabled={
                    busy || loading || !detail.workflow.canRecordPayment
                  }
                  onClick={onOffline}
                >
                  {zh ? "登记实际收款" : "Record money received"}
                </button>
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
                  {zh ? "审批并开通账号" : "Approve & activate"}
                </button>
              </div>
              {detail.workflow.canApprove && approvalFields}
              {!detail.workflow.canApprove &&
                detail.agent.accountStatus !== "active" && (
                  <p className="text-sm text-stone-500">
                    {zh
                      ? "审批条件：资料完成、本人已签署、团队条款确认及线下收款已核验。线上 Stripe 付款无须再次审批。"
                      : "Approval requires a complete profile, agent signature, team terms and a verified offline receipt. Stripe payments do not need another approval."}
                  </p>
                )}
            </section>
            <OnboardingSpecialActions
              agentId={agentId}
              company={detail.agent.licensedCompany}
              manual={detail.agent.manualContract}
              records={detail.records}
              onChanged={async () => {
                await load();
                onChanged();
              }}
            />
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
