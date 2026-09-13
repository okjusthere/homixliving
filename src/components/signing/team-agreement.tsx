"use client";
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useLocale } from "@/lib/i18n-client";
import {
  signingErrorMessage,
  type SigningRequest,
} from "@/lib/signing-contract";
import type { HrFileManifest } from "@/lib/signing-hr-files";

export function TeamAgreement({ applicationId }: { applicationId: number }) {
  const zh = useLocale() === "zh",
    router = useRouter();
  const [detail, setDetail] = useState<{
    configured: boolean;
    agreementStatus: string;
    signing: SigningRequest | null;
    files: HrFileManifest | null;
  } | null>(null);
  const [busy, setBusy] = useState(false),
    [message, setMessage] = useState(""),
    [restart, setRestart] = useState(false),
    [fallback, setFallback] = useState<string | null>(null);
  const endpoint = `/api/team-leader-applications/${applicationId}/agreement`;
  const load = useCallback(async () => {
    const response = await fetch(endpoint, { cache: "no-store" }),
      result = await response.json();
    if (!response.ok) throw new Error(signingErrorMessage(result.error, zh));
    setDetail(result);
  }, [endpoint, zh]);
  useEffect(() => {
    const refresh = () => {
      void load().catch((error) => setMessage(error.message));
    };
    refresh();
    window.addEventListener("focus", refresh);
    return () => window.removeEventListener("focus", refresh);
  }, [load]);
  const action = async (
    kind: "prepare" | "recover" | "continue" | "resend",
  ) => {
    const tab =
      kind === "continue" ? window.open("about:blank", "_blank") : null;
    if (tab) tab.opener = null;
    setBusy(true);
    setMessage("");
    setFallback(null);
    try {
      const response = await fetch(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: kind }),
        }),
        result = await response.json();
      if (!response.ok) throw new Error(signingErrorMessage(result.error, zh));
      if (result.url) {
        if (tab && !tab.closed) tab.location.replace(result.url);
        else setFallback(result.url);
      } else
        setMessage(
          kind === "resend" ||
            (kind === "recover" && detail?.agreementStatus === "expired")
            ? zh
              ? "签署邀请已重发，已保存进度会保留。"
              : "Invitation resent. Saved progress is retained."
            : zh
              ? "合同已准备，请继续签署。"
              : "Agreement prepared. Continue signing.",
        );
      setRestart(false);
      await load();
      router.refresh();
    } catch (error) {
      tab?.close();
      setMessage((error as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const status = detail?.agreementStatus;
  const unsigned = detail?.signing?.parts.some((part) =>
    part.document?.recipients.some(
      (r) =>
        r.actor === "owner" &&
        r.role === "SIGNER" &&
        r.signingStatus === "NOT_SIGNED",
    ),
  );
  return (
    <div className="space-y-3">
      {!detail ? (
        <p role="status">{zh ? "正在读取合同…" : "Loading agreement…"}</p>
      ) : !detail.configured ? (
        <p>
          {zh
            ? "管理员尚未发布适用的 Team Leader 合同包。"
            : "An administrator must publish the applicable Team Leader package."}
        </p>
      ) : (
        <>
          <div className="flex flex-wrap gap-2">
            {["not_started", "preparing"].includes(status!) && (
              <button
                className="admin-control"
                disabled={busy}
                onClick={() => void action("prepare")}
              >
                {zh ? "准备签署合同" : "Prepare agreement"}
              </button>
            )}
            {status === "expired" && (
              <button
                className="admin-control"
                disabled={busy}
                onClick={() => void action("recover")}
              >
                {zh ? "续期签署链接" : "Renew signing link"}
              </button>
            )}
            {status === "sent" && unsigned && (
              <button
                className="admin-control"
                disabled={busy}
                onClick={() => void action("continue")}
              >
                {zh ? "继续本人签署 ↗" : "Continue my signature ↗"}
              </button>
            )}
            {status === "sent" && unsigned && (
              <button
                className="admin-control"
                disabled={busy}
                onClick={() => void action("resend")}
              >
                {zh ? "重发签署邀请" : "Resend invitation"}
              </button>
            )}
            {["voided", "declined"].includes(status!) && (
              <button
                className="admin-control"
                disabled={busy}
                onClick={() => setRestart(true)}
              >
                {zh ? "重新发起合同" : "Restart agreement"}
              </button>
            )}
            <button
              className="admin-control"
              disabled={busy}
              onClick={() =>
                void load().catch((error) => setMessage(error.message))
              }
            >
              {zh ? "检查状态" : "Refresh status"}
            </button>
          </div>
          {restart && (
            <div className="rounded-lg border p-3">
              <p className="text-sm">
                {zh
                  ? "旧任务已取消或拒签。确认后按已批准资料新建合同，需要重新签署；旧记录会保留。"
                  : "The previous request was cancelled or rejected. Create a replacement from approved details and sign again; history is retained."}
              </p>
              <button
                className="admin-control mt-2"
                disabled={busy}
                onClick={() => void action("recover")}
              >
                {zh ? "确认重新发起" : "Confirm restart"}
              </button>
              <button
                className="admin-control ml-2"
                onClick={() => setRestart(false)}
              >
                {zh ? "返回" : "Back"}
              </button>
            </div>
          )}
          {detail.signing?.parts.map((part) => (
            <div key={part.id} className="text-sm">
              <p className="font-medium">{part.document?.title}</p>
              {part.document?.recipients
                .filter((r) => r.role !== "CC")
                .map((r) => (
                  <p key={r.id}>
                    {r.name} ·{" "}
                    {r.signingStatus === "SIGNED"
                      ? zh
                        ? "已签署"
                        : "Signed"
                      : zh
                        ? "待签署"
                        : "Awaiting signature"}
                  </p>
                ))}
            </div>
          ))}
          {status === "completed" && (
            <p className="text-green-800">
              {zh ? "合同签署完成。" : "Agreement completed."}
            </p>
          )}
          {detail.files?.documents.map((file) => (
            <a
              className="block text-sm underline"
              key={file.id}
              href={file.signedUrl || file.originalUrl}
              target="_blank"
              rel="noopener noreferrer"
            >
              {file.signedUrl
                ? zh
                  ? "已签文件"
                  : "Signed file"
                : zh
                  ? "原合同"
                  : "Original"}{" "}
              · {file.name}
            </a>
          ))}
          {detail.files?.completionFiles.map((file) => (
            <a
              className="block text-sm underline"
              key={file.url}
              href={file.url}
              target="_blank"
              rel="noopener noreferrer"
            >
              {file.kind === "certificate"
                ? zh
                  ? "完成证书"
                  : "Certificate"
                : zh
                  ? "签署审计"
                  : "Audit log"}{" "}
              · {file.name}
            </a>
          ))}
        </>
      )}
      {message && (
        <p role="status" className="text-sm">
          {message}
        </p>
      )}
      {fallback && (
        <a
          className="underline"
          href={fallback}
          target="_blank"
          rel="noopener noreferrer"
        >
          {zh ? "打开签署页面 ↗" : "Open signing ↗"}
        </a>
      )}
    </div>
  );
}
