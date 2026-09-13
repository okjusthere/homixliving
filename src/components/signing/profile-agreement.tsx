"use client";
import { useEffect, useState } from "react";
import { useLocale } from "@/lib/i18n-client";
import type { HrFileManifest } from "@/lib/signing-hr-files";
export function ProfileAgreement({
  manualContractId,
}: {
  manualContractId?: string | null;
}) {
  const zh = useLocale() === "zh";
  const [files, setFiles] = useState<HrFileManifest | null>(null),
    [error, setError] = useState(false);
  useEffect(() => {
    if (manualContractId) return;
    let current = true;
    void fetch("/api/onboarding/agreement/documents", { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error();
        const data = await response.json();
        if (current) setFiles(data);
      })
      .catch(() => {
        if (current) setError(true);
      });
    return () => {
      current = false;
    };
  }, [manualContractId]);
  return (
    <section className="rounded-xl border border-stone-200 bg-white p-5 space-y-3">
      <h2 className="text-lg font-medium">
        {zh ? "我的入职合同" : "My onboarding agreement"}
      </h2>
      {manualContractId ? (
        <a
          href={`/api/onboarding/contracts/${manualContractId}`}
          className="text-sm underline"
          target="_blank"
          rel="noopener noreferrer"
        >
          {zh
            ? "查看已核验的线下 / 历史合同 ↗"
            : "View verified offline / historical contract ↗"}
        </a>
      ) : error ? (
        <p className="text-sm">
          {zh
            ? "暂时无法读取合同，请稍后刷新。"
            : "Could not load your agreement. Refresh shortly."}
        </p>
      ) : !files ? (
        <p role="status">{zh ? "正在读取…" : "Loading…"}</p>
      ) : (
        <>
          {files.documents.map((file) => (
            <div key={file.id}>
              <p className="text-sm font-medium">{file.name}</p>
              <a
                className="mr-4 text-sm underline"
                href={file.originalUrl}
                target="_blank"
                rel="noopener noreferrer"
              >
                {zh ? "原合同" : "Original"}
              </a>
              {file.signedUrl && (
                <a
                  className="text-sm underline"
                  href={file.signedUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {zh ? "签署完成件" : "Signed copy"}
                </a>
              )}
            </div>
          ))}
          {files.completionFiles.map((file) => (
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
          {files.documents.length > 0 &&
            files.documents.some((file) => !file.signedUrl) && (
              <p className="text-sm text-stone-500">
                {zh
                  ? "所有必需签署完成并封存后，将在这里提供完成件。"
                  : "Completed copies appear here after all required signatures and sealing."}
              </p>
            )}
        </>
      )}
    </section>
  );
}
