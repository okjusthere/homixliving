"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { ArrowLeft, Download, ExternalLink, RefreshCw } from "lucide-react";
import { PageHeader } from "@/components/homix/page-kit";
import { useLocale } from "@/lib/i18n-client";
import type { SigningRequest } from "@/lib/signing-contract";
import { signingErrorMessage } from "@/lib/signing-contract";
import {
  categories,
  errorText,
  nativeStatus,
  signingButton,
  signingFetch,
  signingInput,
} from "./client";

export function SigningDetail({ id }: { id: string }) {
  const locale = useLocale(),
    zh = locale === "zh",
    search = useSearchParams();
  const back = search.get("back") || "";
  const [item, setItem] = useState<SigningRequest | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState<
      "send" | "remind" | "cancel" | "discard" | null
    >(null),
    [reason, setReason] = useState("");
  const inFlight = useRef(false);
  const load = useCallback(
    async (refresh = false) => {
      if (inFlight.current) return;
      inFlight.current = true;
      setBusy(true);
      setError("");
      try {
        setItem(
          await signingFetch<SigningRequest>(
            `requests/${id}${refresh ? "/refresh" : ""}`,
            refresh ? {} : undefined,
          ),
        );
      } catch (e) {
        setError(errorText(e, zh));
      } finally {
        inFlight.current = false;
        setBusy(false);
      }
    },
    [id, zh],
  );
  useEffect(() => {
    void load(true);
  }, [load]);
  useEffect(() => {
    const refresh = () => {
      void load(true);
    };
    window.addEventListener("focus", refresh);
    return () => window.removeEventListener("focus", refresh);
  }, [load]);
  async function command() {
    if (!confirm || inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setError("");
    try {
      setItem(
        await signingFetch<SigningRequest>(`requests/${id}/commands`, {
          action: confirm,
          reason: reason || undefined,
        }),
      );
      setConfirm(null);
      setReason("");
    } catch (e) {
      setError(errorText(e, zh));
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }
  async function access(
    partId: string,
    kind: "editor" | "signer",
    recipientId?: number,
  ) {
    if (inFlight.current) return;
    inFlight.current = true;
    // Open synchronously for browser popup policies, then navigate only to the
    // authorized URL returned by the server. The Portal tab stays at this task.
    const tab = window.open("about:blank", "_blank");
    if (tab) tab.opener = null;
    setBusy(true);
    setError("");
    try {
      const { url } = await signingFetch<{ url: string }>(
        `requests/${id}/parts/${partId}/access`,
        { kind, recipientId },
      );
      if (tab) tab.location.replace(url);
      else window.location.assign(url);
    } catch (e) {
      tab?.close();
      setError(errorText(e, zh));
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }
  const filesUrl = (partId: string, kind: string, itemId?: string) =>
    `/api/signing/requests/${id}/parts/${partId}/files?${new URLSearchParams({ kind, ...(itemId ? { itemId } : {}) })}`;
  const isDraft = item?.parts.some(
    (part) =>
      part.document?.status === "DRAFT" ||
      part.operationState === "prepared" ||
      part.operationState === "failed",
  );
  const isPending = item?.parts.some(
    (part) => part.document?.status === "PENDING",
  );
  return (
    <div className="mx-auto max-w-6xl space-y-6 px-4 py-7 sm:px-8">
      <Link
        href={`/signing${back ? `?${new URLSearchParams(back)}` : ""}`}
        className="inline-flex items-center gap-2 text-sm text-ink-50"
      >
        <ArrowLeft size={16} aria-hidden />
        {zh ? "返回文件签署" : "Back to signing"}
      </Link>
      <PageHeader
        title={item?.title || (zh ? "签署任务" : "Signing request")}
        description={
          item
            ? [item.business.customer, item.business.property]
                .filter(Boolean)
                .join(" · ")
            : undefined
        }
        actions={
          <button
            className={signingButton}
            disabled={busy}
            onClick={() => void load(true)}
          >
            <RefreshCw size={16} aria-hidden />
            {zh ? "检查最新状态" : "Refresh status"}
          </button>
        }
      />
      {error && (
        <p
          role="alert"
          className="rounded-md border border-amber-200 bg-amber-50 p-4 text-sm"
        >
          {error}
        </p>
      )}
      {!item && !error && (
        <p aria-busy="true">
          {zh ? "读取签署进度…" : "Loading signing progress…"}
        </p>
      )}
      {item && (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-line bg-white p-4">
            <div>
              <p className="font-medium">{categories[locale][item.category]}</p>
              <p className="mt-1 text-sm text-ink-50">
                {zh
                  ? "签署和编辑在 Documenso 完成，回到这里可继续跟进。"
                  : "Edit and sign in Documenso, then return here to follow progress."}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              {isDraft && (
                <button
                  disabled={busy}
                  className={`${signingButton} !bg-homix-accent !text-white`}
                  onClick={() => setConfirm("send")}
                >
                  {zh ? "核对并发送" : "Review and send"}
                </button>
              )}
              {isPending && (
                <button
                  disabled={busy}
                  className={signingButton}
                  onClick={() => setConfirm("remind")}
                >
                  {zh ? "提醒未签署人" : "Remind pending recipients"}
                </button>
              )}
              {isPending && (
                <button
                  disabled={busy}
                  className={signingButton}
                  onClick={() => setConfirm("cancel")}
                >
                  {zh ? "取消邀请" : "Cancel invitation"}
                </button>
              )}
              {isDraft && !isPending && (
                <button
                  disabled={busy}
                  className={signingButton}
                  onClick={() => setConfirm("discard")}
                >
                  {zh ? "放弃草稿" : "Discard draft"}
                </button>
              )}
            </div>
          </div>
          {confirm && (
            <section className="rounded-lg border border-line bg-white p-5">
              <h2 className="font-medium">
                {confirm === "send"
                  ? zh
                    ? "确认发送以下文件与收件人"
                    : "Confirm these files and recipients"
                  : confirm === "remind"
                    ? zh
                      ? "向当前待签署人发送提醒"
                      : "Send a reminder to current pending recipients"
                    : zh
                      ? "登记撤销原因"
                      : "Record a cancellation reason"}
              </h2>
              {confirm === "send" && (
                <div className="my-3 space-y-3 text-sm">
                  {item.parts
                    .filter((part) => part.document?.status === "DRAFT")
                    .map((part) => (
                      <div key={part.id}>
                        <p>
                          {part.document?.files
                            .map((file) => file.title)
                            .join(" · ")}
                        </p>
                        <p className="break-words text-ink-50">
                          {part.document?.recipients
                            .map((r) => `${r.name} <${r.email}>`)
                            .join(" · ") ||
                            (zh
                              ? "缺少签署人，请先编辑。"
                              : "No recipients. Edit the draft first.")}
                        </p>
                      </div>
                    ))}
                </div>
              )}
              {["cancel", "discard"].includes(confirm) && (
                <label className="mt-3 block text-sm">
                  {zh
                    ? "原因（至少 5 个字符）"
                    : "Reason (at least 5 characters)"}
                  <textarea
                    className={signingInput}
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                  />
                </label>
              )}
              <div className="mt-4 flex gap-2">
                <button
                  className={`${signingButton} !bg-homix-accent !text-white`}
                  disabled={
                    busy ||
                    (["cancel", "discard"].includes(confirm) &&
                      reason.trim().length < 5)
                  }
                  onClick={() => void command()}
                >
                  {zh ? "确认操作" : "Confirm"}
                </button>
                <button
                  className={signingButton}
                  disabled={busy}
                  onClick={() => setConfirm(null)}
                >
                  {zh ? "返回检查" : "Back to review"}
                </button>
              </div>
            </section>
          )}
          {item.parts.map((part) => (
            <section
              key={part.id}
              className="rounded-lg border border-line bg-white"
            >
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-4">
                <div>
                  <h2 className="font-medium">
                    {part.document?.title ||
                      `${zh ? "文件组" : "Document group"} ${part.index + 1}`}
                  </h2>
                  <p className="mt-1 text-sm text-ink-50">
                    {part.operationState === "discarded"
                      ? zh
                        ? "草稿已放弃"
                        : "Draft discarded"
                      : part.document
                        ? nativeStatus[locale][part.document.status]
                        : zh
                          ? "正在准备 / 核对创建结果"
                          : "Preparing / reconciling creation"}
                  </p>
                </div>
                {part.canEdit && (
                  <button
                    className={signingButton}
                    disabled={busy}
                    onClick={() => void access(part.id, "editor")}
                  >
                    {zh ? "继续编辑" : "Continue editing"}
                    <ExternalLink size={14} aria-hidden />
                  </button>
                )}
              </div>
              {part.error && (
                <p
                  role="status"
                  className="m-4 rounded-md bg-amber-50 p-3 text-sm"
                >
                  {signingErrorMessage(part.error, zh)}
                </p>
              )}
              {part.document?.expired && (
                <p
                  role="status"
                  className="m-4 rounded-md bg-amber-50 p-3 text-sm"
                >
                  {zh
                    ? "有签署入口已过期。提醒未签署人可更新邀请有效期。"
                    : "A signing link has expired. Remind pending recipients to renew the invitation."}
                </p>
              )}
              <div className="grid gap-6 p-4 md:grid-cols-2">
                <div>
                  <h3 className="mb-3 text-sm font-medium">
                    {zh ? "签署人" : "Recipients"}
                  </h3>
                  <ul className="space-y-3">
                    {part.document?.recipients.map((recipient) => (
                      <li
                        key={recipient.id}
                        className="flex flex-wrap items-center justify-between gap-2"
                      >
                        <div className="min-w-0">
                          <p className="text-sm">
                            {recipient.name}{" "}
                            {part.document?.signingOrder === "SEQUENTIAL" &&
                            recipient.signingOrder
                              ? `· ${zh ? "第" : "Order "}${recipient.signingOrder}${zh ? "位" : ""}`
                              : ""}
                          </p>
                          <p className="break-all text-xs text-ink-50">
                            {recipient.email}
                          </p>
                        </div>
                        <div className="text-xs">
                          {recipient.signingStatus === "SIGNED"
                            ? zh
                              ? "已完成"
                              : "Completed"
                            : recipient.signingStatus === "REJECTED"
                              ? zh
                                ? "已拒绝"
                                : "Declined"
                              : zh
                                ? "待处理"
                                : "Pending"}
                        </div>
                        {recipient.canSign && (
                          <button
                            className={`${signingButton} text-xs`}
                            disabled={busy}
                            onClick={() =>
                              void access(part.id, "signer", recipient.id)
                            }
                          >
                            {zh ? "本人继续签署" : "Continue as myself"}
                          </button>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
                <div>
                  <h3 className="mb-3 text-sm font-medium">
                    {zh ? "合同文件" : "Contract files"}
                  </h3>
                  <ul className="space-y-3">
                    {part.document?.files.map((file) => (
                      <li key={file.id}>
                        <p className="mb-2 break-words text-sm">{file.title}</p>
                        <div className="flex flex-wrap gap-3 text-xs">
                          <a
                            className="inline-flex items-center gap-1 underline"
                            href={filesUrl(part.id, "original", file.id)}
                          >
                            <Download size={13} aria-hidden />
                            {zh ? "原件" : "Original"}
                          </a>
                          {part.document?.completionFilesReady && (
                            <a
                              className="underline"
                              href={filesUrl(part.id, "signed", file.id)}
                            >
                              {zh ? "已签完成件" : "Signed document"}
                            </a>
                          )}
                        </div>
                      </li>
                    ))}
                  </ul>
                  {part.document?.completionFilesReady && (
                    <div className="mt-4 flex flex-wrap gap-3 border-t border-line pt-3 text-xs">
                      <a
                        className="underline"
                        href={filesUrl(part.id, "certificate")}
                      >
                        {zh ? "完成证明" : "Completion certificate"}
                      </a>
                      <a
                        className="underline"
                        href={filesUrl(part.id, "audit-log")}
                      >
                        {zh ? "签署审计" : "Signing audit"}
                      </a>
                    </div>
                  )}
                </div>
              </div>
            </section>
          ))}
          <section className="rounded-lg border border-line bg-white p-4">
            <h2 className="mb-3 font-medium">{zh ? "处理记录" : "Activity"}</h2>
            <ol className="space-y-3">
              {item.events.map((event, index) => (
                <li
                  key={`${event.createdAt}-${index}`}
                  className="flex flex-wrap justify-between gap-2 border-t border-line py-2 text-sm"
                >
                  <span>
                    {eventLabel(event.event, zh)}
                    {event.actorAgentId ? ` · #${event.actorAgentId}` : ""}
                  </span>
                  <time
                    className="text-xs text-ink-50"
                    dateTime={event.createdAt}
                  >
                    {new Date(event.createdAt).toLocaleString(
                      locale === "zh" ? "zh-CN" : "en-US",
                    )}
                  </time>
                </li>
              ))}
            </ol>
          </section>
        </>
      )}
    </div>
  );
}
function eventLabel(event: string, zh: boolean) {
  const labels: Record<string, [string, string]> = {
    "request.prepared": ["已准备草稿", "Draft prepared"],
    "provider.state_refreshed": ["签署状态已更新", "Signing status updated"],
    "request.send_requested": ["已请求发送", "Sending requested"],
    "request.remind_requested": ["已请求提醒", "Reminder requested"],
    "request.cancel_requested": ["已请求取消", "Cancellation requested"],
    "request.discard_requested": ["已放弃草稿", "Draft discarded"],
    "request.local_draft_discarded": [
      "已放弃未发起草稿",
      "Unsubmitted draft discarded",
    ],
  };
  return (
    labels[event]?.[zh ? 0 : 1] ||
    (zh ? "签署操作已记录" : "Signing activity recorded")
  );
}
