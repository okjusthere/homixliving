"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";
import type { AgentMergePreview, MergeBlocker } from "@/lib/admin-agent-merge";
import { useLocale } from "@/lib/i18n-client";

const blockers: Record<MergeBlocker, [string, string]> = {
  privileged: [
    "涉及管理员权限或管理员配置邮箱，需要单独核对权限。",
    "An account or email has administrator access and needs a separate access review.",
  ],
  inactive: [
    "重复账号已停用，需先核对停用原因。",
    "The duplicate account is inactive. Review why it was deactivated first.",
  ],
  target_inactive: [
    "请选用已开通的经纪人账号作为保留账号。",
    "Choose an active agent as the account to keep.",
  ],
  agreement: [
    "重复账号已有合同或签署记录，需要核对后处理。",
    "The duplicate has agreement or signature records that need review.",
  ],
  payment: [
    "重复账号已有付款、支付账户或入职完成记录，需要核对后处理。",
    "The duplicate has payment, billing or completed onboarding records that need review.",
  ],
  team_terms: [
    "重复账号已有团队关系或团队条款，需要核对后处理。",
    "The duplicate has team membership or accepted terms that need review.",
  ],
  pending_link: [
    "重复账号正在验证其他邮箱，请先完成或取消该申请。",
    "Complete or cancel the duplicate's pending email verification first.",
  ],
  website: [
    "待合并账号也关联了官网主页。请先处理官网主页，或改以它作为保留账号。",
    "The duplicate also has a website profile. Resolve the profiles first, or keep that account instead.",
  ],
  website_unavailable: [
    "暂时无法确认官网关联状态，请稍后重试。",
    "Website links could not be verified. Please retry later.",
  ],
  identity_conflict: [
    "邮箱或 Google 登录身份存在交叉归属，需要核对后处理。",
    "Email or Google identities have conflicting ownership and need review.",
  ],
  business_records: [
    "重复账号有关联业务资料，不能直接合并。",
    "The duplicate has linked business records that prevent a simple merge.",
  ],
};

export function AgentMergeReview({
  preview,
  confirmed,
  busy,
  onConfirm,
  onMerge,
}: {
  preview: AgentMergePreview;
  confirmed: boolean;
  busy: boolean;
  onConfirm: (value: boolean) => void;
  onMerge: () => void;
}) {
  const zh = useLocale() === "zh";
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    heading.current?.focus({ preventScroll: true });
    heading.current?.scrollIntoView({ block: "start" });
  }, [preview.revision]);
  return (
    <section
      className="space-y-4 rounded-xl border border-stone-300 bg-white p-4"
      aria-label={zh ? "重复账号合并预览" : "Duplicate account merge preview"}
    >
      <h4 ref={heading} tabIndex={-1} className="font-medium outline-none">
        {zh ? "合并前核对" : "Review before merging"}
      </h4>
      <div className="space-y-3 text-sm">
        <div>
          <p className="text-xs text-ink-50">
            {zh ? "保留账号" : "Keep account"}
          </p>
          <p>
            {preview.target.name} · #{preview.target.id}
          </p>
          <p className="break-all">{preview.target.email}</p>
          <p className="break-all text-ink-50">
            {preview.targetProfiles.length
              ? `${zh ? "保留官网主页" : "Keep website profile"}：${preview.targetProfiles.map((slug) => "/" + slug).join(" · ")}`
              : zh
                ? "该账号暂未关联官网主页"
                : "No website profile linked"}
          </p>
        </div>
        <div>
          <p className="text-xs text-ink-50">
            {zh
              ? "并入后移除的重复账号"
              : "Duplicate account to merge and remove"}
          </p>
          <p>
            {preview.source.name} · #{preview.source.id}
          </p>
          <p className="break-all">{preview.source.email}</p>
        </div>
        <div>
          <p className="mb-1 text-xs text-ink-50">
            {zh ? "归入保留账号的邮箱" : "Emails moved to the retained account"}
          </p>
          <ul>
            {preview.emails.map((address) => (
              <li key={address.email} className="break-all">
                {address.email}
                {!address.canSignIn && (
                  <span className="text-ink-50">
                    {" "}
                    · {zh ? "仍不启用登录" : "Sign-in remains unavailable"}
                  </span>
                )}
              </li>
            ))}
          </ul>
        </div>
        <p className="text-ink-50">
          {zh
            ? `同时迁移 ${preview.identityCount} 个 Google 登录身份、${preview.activityCount} 项活动引用；保留账号的主页、资料和权限继续使用。`
            : `${preview.identityCount} Google identities and ${preview.activityCount} activity references move with the emails. The retained account's website profile, details and permissions continue to apply.`}
        </p>
      </div>
      {preview.blockers.length ? (
        <div role="alert" className="space-y-2 text-sm">
          <p className="font-medium text-red-700">
            {zh ? "需要先处理以下事项" : "Resolve these items first"}
          </p>
          <ul className="list-disc space-y-2 pl-4">
            {preview.blockers.map((blocker) => (
              <li key={blocker.code}>
                {blockers[blocker.code][zh ? 0 : 1]}
                {blocker.count ? ` (${blocker.count})` : ""}
              </li>
            ))}
          </ul>
          {preview.sourceProfiles.length > 0 && (
            <div className="flex flex-wrap gap-3">
              <Link
                className="underline"
                href={`/admin/agents?view=public&q=${encodeURIComponent(preview.sourceProfiles[0])}`}
              >
                {zh ? "管理官网主页" : "Manage website profiles"}
              </Link>
              <Link
                className="underline"
                href={`/admin/agents?emails=${preview.source.id}`}
              >
                {zh ? "改用该账号作为保留账号" : "Keep this account instead"}
              </Link>
            </div>
          )}
        </div>
      ) : (
        <>
          <p className="text-sm text-ink-50">
            {zh
              ? "系统会保存合并前的账号快照和操作记录。合并后，请经纪人重新登录。"
              : "A snapshot and audit record are retained. Ask the agent to sign in again after the merge."}
          </p>
          <label className="flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              className="mt-1 size-4 shrink-0 accent-stone-700"
              checked={confirmed}
              disabled={busy}
              onChange={(event) => onConfirm(event.target.checked)}
            />
            <span>
              {zh
                ? `我确认这两个账号属于同一人，保留 #${preview.target.id}，合并并移除重复账号 #${preview.source.id}。`
                : `I confirm both accounts belong to the same person. Keep #${preview.target.id}, merge and remove duplicate #${preview.source.id}.`}
            </span>
          </label>
          <button
            className="admin-control"
            type="button"
            disabled={busy || !confirmed}
            onClick={onMerge}
          >
            {busy
              ? zh
                ? "合并中…"
                : "Merging…"
              : zh
                ? "合并到此经纪人"
                : "Merge into this agent"}
          </button>
        </>
      )}
    </section>
  );
}
