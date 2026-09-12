"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { EditPanel } from "./edit-panel";
import { AgentMergeReview } from "./agent-merge-review";
import type { AgentMergePreview } from "@/lib/admin-agent-merge";
import { useLocale } from "@/lib/i18n-client";
import type {
  AgentEmailPreview,
  ManagedAgentEmail,
} from "@/lib/admin-agent-emails";

const messages: Record<string, [string, string]> = {
  MERGE_CHANGED: [
    "账号资料已变化，请重新检查后再合并。",
    "Account data changed. Review a new preview before merging.",
  ],
  MERGE_BLOCKED: [
    "账号存在需要核对的资料，请重新检查合并条件。",
    "This account has records that need review. Check merge eligibility again.",
  ],
  INVALID_EMAIL: ["请输入有效邮箱。", "Enter a valid email address."],
  ALREADY_LINKED: [
    "这个邮箱已经关联到该经纪人。",
    "This email is already linked to this agent.",
  ],
  EMAIL_IN_USE: [
    "邮箱已被其他账号使用，请重新检查归属。",
    "This email belongs to another account. Check its owner again.",
  ],
  EMAIL_PENDING: [
    "该邮箱正在进行本人验证，请先完成或取消原关联申请。",
    "A self-service verification is in progress. Complete or cancel it first.",
  ],
  RESERVED_ADMIN_EMAIL: [
    "此邮箱用于管理员环境配置，不能在这里关联。",
    "This email is reserved by administrator configuration.",
  ],
  ACCESS_CHANGED: [
    "账号权限已变化，请重新检查后确认。",
    "Account permissions changed. Check again before confirming.",
  ],
  FORBIDDEN: [
    "管理员权限已失效，请重新登录。",
    "Administrator access is no longer available. Sign in again.",
  ],
  AGENT_NOT_FOUND: [
    "经纪人账号不存在，请刷新列表。",
    "Agent not found. Refresh the list.",
  ],
  UNAVAILABLE: [
    "暂时无法完成操作，请重试。",
    "Unable to complete this operation. Please retry.",
  ],
};

export function AgentEmailsPanel({
  agentId,
  name,
  onClose,
  onLinked,
  onMerged,
}: {
  agentId: number;
  name: string;
  onClose: () => void;
  onLinked: (email: string) => void;
  onMerged: () => void;
}) {
  const zh = useLocale() === "zh";
  const [emails, setEmails] = useState<ManagedAgentEmail[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [reload, setReload] = useState(0);
  const [email, setEmail] = useState("");
  const [preview, setPreview] = useState<AgentEmailPreview | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [mergePreview, setMergePreview] = useState<AgentMergePreview | null>(
    null,
  );
  const [mergeConfirmed, setMergeConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const endpoint = `/api/admin/agents/${agentId}/emails`;
  const errorText = (code: string) =>
    (messages[code] || messages.UNAVAILABLE)[zh ? 0 : 1];

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setLoadError(false);
    fetch(endpoint, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error();
        setEmails((await response.json()).emails);
      })
      .catch(() => {
        if (!controller.signal.aborted) setLoadError(true);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [endpoint, reload]);

  const check = async () => {
    if (busy) return;
    setBusy(true);
    setError("");
    setPreview(null);
    setMergePreview(null);
    setMergeConfirmed(false);
    setConfirmed(false);
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "preview", email }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.code);
      setPreview(data);
    } catch (err) {
      setError(errorText(err instanceof Error ? err.message : "UNAVAILABLE"));
    } finally {
      setBusy(false);
    }
  };
  const link = async () => {
    if (busy || !preview || preview.state !== "available" || !confirmed) return;
    setBusy(true);
    setError("");
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "link",
          email: preview.email,
          confirmed: true,
          expectedAdmin: preview.target.isAdmin,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.code);
      setEmails((current) => [
        ...current,
        {
          email: data.email,
          isPrimary: false,
          canSignIn: true,
          verifiedAt: new Date().toISOString(),
          source: "admin_assigned",
        },
      ]);
      setEmail("");
      setPreview(null);
      setConfirmed(false);
      onLinked(data.email);
      toast.success(zh ? "登录邮箱已关联" : "Login email linked");
    } catch (err) {
      setError(errorText(err instanceof Error ? err.message : "UNAVAILABLE"));
      setPreview(null);
      setConfirmed(false);
    } finally {
      setBusy(false);
    }
  };

  const checkMerge = async (sourceId: number) => {
    if (busy) return;
    setBusy(true);
    setError("");
    setMergePreview(null);
    setMergeConfirmed(false);
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "merge-preview", sourceId }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.code);
      setMergePreview(data);
    } catch (err) {
      setError(errorText(err instanceof Error ? err.message : "UNAVAILABLE"));
    } finally {
      setBusy(false);
    }
  };
  const merge = async () => {
    if (
      busy ||
      !mergeConfirmed ||
      !mergePreview ||
      mergePreview.blockers.length
    )
      return;
    setBusy(true);
    setError("");
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "merge",
          sourceId: mergePreview.source.id,
          revision: mergePreview.revision,
          confirmed: true,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.code);
      setEmail("");
      setPreview(null);
      setMergePreview(null);
      setMergeConfirmed(false);
      setReload((value) => value + 1);
      onMerged();
      toast.success(
        zh
          ? "重复账号已合并，原有邮箱可登录同一经纪人账号"
          : "Accounts merged. Existing emails now sign in to the same agent.",
      );
    } catch (err) {
      setError(errorText(err instanceof Error ? err.message : "UNAVAILABLE"));
      setMergePreview(null);
      setMergeConfirmed(false);
    } finally {
      setBusy(false);
    }
  };

  return (
    <EditPanel
      title={zh ? `${name} · 登录邮箱` : `${name} · Login emails`}
      description={
        zh
          ? "同一个经纪人可使用多个 Google 邮箱登录。"
          : "One agent can sign in with multiple Google email addresses."
      }
      dirty={Boolean(email.trim())}
      saving={busy}
      onClose={onClose}
      footer={
        <>
          <span className="text-xs text-ink-50">
            {zh ? "关联后立即生效" : "Links take effect immediately"}
          </span>
          <button
            className="admin-control"
            type="button"
            disabled={busy || Boolean(email.trim())}
            onClick={onClose}
          >
            {zh ? "完成" : "Done"}
          </button>
        </>
      }
    >
      <div className="space-y-6">
        <section aria-label={zh ? "已关联邮箱" : "Linked emails"}>
          <h3 className="mb-3 font-medium">
            {zh ? "已关联邮箱" : "Linked emails"}
          </h3>
          {loading ? (
            <p role="status">{zh ? "加载中…" : "Loading…"}</p>
          ) : loadError ? (
            <div role="alert">
              <p>{zh ? "邮箱列表加载失败。" : "Could not load emails."}</p>
              <button
                className="row-action"
                onClick={() => setReload((value) => value + 1)}
              >
                {zh ? "重试" : "Retry"}
              </button>
            </div>
          ) : (
            <ul className="divide-y divide-stone-200 rounded-xl border border-stone-200">
              {emails.map((address) => (
                <li
                  key={address.email}
                  className="flex flex-wrap items-center justify-between gap-2 px-4 py-3"
                >
                  <span className="min-w-0 break-all text-sm">
                    {address.email}
                  </span>
                  <span className="text-xs text-ink-50">
                    {address.isPrimary
                      ? zh
                        ? "主邮箱"
                        : "Primary"
                      : !address.canSignIn || !address.verifiedAt
                        ? zh
                          ? "未启用登录"
                          : "Sign-in unavailable"
                        : address.source === "admin_assigned"
                          ? zh
                            ? "管理员关联"
                            : "Linked by admin"
                          : zh
                            ? "登录别名"
                            : "Login alias"}
                  </span>
                </li>
              ))}
              {!emails.length && (
                <li className="px-4 py-3 text-sm">
                  {zh
                    ? "暂未找到邮箱记录，请刷新或联系技术支持。"
                    : "No email records found. Refresh or contact support."}
                </li>
              )}
            </ul>
          )}
        </section>
        <section className="space-y-3">
          <h3 className="font-medium">
            {zh ? "关联另一个邮箱" : "Link another email"}
          </h3>
          <p className="text-sm text-ink-50">
            {zh
              ? "确认属于同一经纪人后，将此邮箱关联到现有账号。主邮箱和现有资料保持不变。"
              : "Confirm this email belongs to the same person, then link it to this account. The primary email and existing records are retained."}
          </p>
          <form
            className="flex flex-wrap gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              void check();
            }}
          >
            <label className="min-w-0 flex-1">
              <span className="sr-only">
                {zh ? "新登录邮箱" : "New login email"}
              </span>
              <input
                className="admin-control w-full"
                type="email"
                required
                maxLength={254}
                autoComplete="off"
                placeholder="agent@example.com"
                value={email}
                disabled={busy}
                onChange={(event) => {
                  setEmail(event.target.value);
                  setPreview(null);
                  setMergePreview(null);
                  setMergeConfirmed(false);
                  setConfirmed(false);
                  setError("");
                }}
              />
            </label>
            <button
              className="admin-control"
              type="submit"
              disabled={busy || loading || loadError || !email.trim()}
            >
              {busy
                ? zh
                  ? "处理中…"
                  : "Working…"
                : zh
                  ? "检查邮箱"
                  : "Check email"}
            </button>
          </form>
          {error && (
            <p className="text-sm text-red-700" role="alert">
              {error}
            </p>
          )}
          {preview && (
            <div
              className="space-y-3 rounded-xl border border-stone-200 bg-stone-50 p-4"
              aria-live="polite"
            >
              {preview.state === "available" ? (
                <>
                  <p className="break-all text-sm">
                    <strong>{preview.email}</strong>{" "}
                    {zh ? "将关联到" : "will be linked to"}{" "}
                    <strong>
                      {preview.target.name} · #{preview.target.id}
                    </strong>
                  </p>
                  <p className="text-sm text-ink-50">
                    {preview.target.isAdmin
                      ? zh
                        ? "该账号拥有管理员权限，使用新邮箱登录也会获得管理员权限。"
                        : "This account has administrator access, including when signing in with this email."
                      : zh
                        ? "使用新邮箱登录后，将进入这个经纪人的现有账号。"
                        : "Signing in with this email will open this agent’s existing account."}
                  </p>
                  {preview.target.accountStatus !== "active" && (
                    <p className="text-sm text-ink-50">
                      {zh
                        ? "此账号尚未开通或已停用；关联邮箱不会开通账号。"
                        : "This account is pending or inactive; linking an email does not activate it."}
                    </p>
                  )}
                  <label className="flex items-start gap-2 text-sm">
                    <input
                      type="checkbox"
                      className="mt-1 size-4 shrink-0 accent-stone-700"
                      checked={confirmed}
                      disabled={busy}
                      onChange={(event) => setConfirmed(event.target.checked)}
                    />
                    <span>
                      {zh
                        ? "我已核实此邮箱属于该经纪人，同意授予此账号的登录权限。"
                        : "I have verified this email belongs to this person and approve sign-in access to this account."}
                    </span>
                  </label>
                  <button
                    type="button"
                    className="admin-control"
                    disabled={!confirmed || busy}
                    onClick={() => void link()}
                  >
                    {zh ? "确认关联" : "Confirm link"}
                  </button>
                </>
              ) : preview.state === "conflict" ? (
                <>
                  <p className="font-medium">
                    {zh
                      ? "这个邮箱已属于另一个账号"
                      : "This email belongs to another account"}
                  </p>
                  {preview.owners
                    .filter((owner) => owner.id !== agentId)
                    .map((owner) => (
                      <div key={owner.id} className="break-all text-sm">
                        <p>
                          {owner.name} · #{owner.id}
                        </p>
                        <p className="text-ink-50">{owner.email}</p>
                        <Link
                          className="row-action inline-block"
                          href={`/admin/agents/${owner.id}`}
                        >
                          {zh ? "查看该账号" : "View account"}
                        </Link>
                      </div>
                    ))}
                  <p className="text-sm text-ink-50">
                    {zh
                      ? "如果属于同一人，可先检查重复账号，再将其邮箱和登录身份合并到当前经纪人。"
                      : "If this is the same person, review the duplicate account and merge its emails and login identities into this agent."}
                  </p>
                  {preview.owners
                    .filter((owner) => owner.id !== agentId)
                    .map((owner) => (
                      <button
                        key={owner.id}
                        type="button"
                        className="admin-control"
                        disabled={busy}
                        onClick={() => void checkMerge(owner.id)}
                      >
                        {zh
                          ? `检查并合并账号 #${owner.id}`
                          : `Review and merge account #${owner.id}`}
                      </button>
                    ))}
                  {mergePreview && (
                    <AgentMergeReview
                      preview={mergePreview}
                      confirmed={mergeConfirmed}
                      busy={busy}
                      onConfirm={setMergeConfirmed}
                      onMerge={() => void merge()}
                    />
                  )}
                </>
              ) : (
                <p className="text-sm">
                  {errorText(
                    {
                      linked: "ALREADY_LINKED",
                      pending: "EMAIL_PENDING",
                      reserved: "RESERVED_ADMIN_EMAIL",
                    }[preview.state],
                  )}
                </p>
              )}
            </div>
          )}
        </section>
      </div>
    </EditPanel>
  );
}
