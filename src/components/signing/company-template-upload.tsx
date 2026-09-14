"use client";

import { useState } from "react";
import { useLocale } from "@/lib/i18n-client";
import { errorText, signingButton, signingInput } from "./client";

type UploadResult = { id: string; title: string; editorUrl: string };
type Attempt = {
  uploadId: string;
  title: string;
  uploads: { id: string; name: string }[];
  connectionId: string;
};

async function post<T>(path: string, body: unknown): Promise<T> {
  const response = await fetch(`/api/admin/signing/${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || "UPLOAD_FAILED");
  return result;
}

export function CompanyTemplateUpload({
  connections,
  onUploaded,
}: {
  connections: { id: string; companyKey: string | null; nativeEmail: string }[];
  onUploaded: (connectionId: string) => Promise<void>;
}) {
  const zh = useLocale() === "zh";
  const [connectionId, setConnectionId] = useState("");
  const [title, setTitle] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState<Attempt | null>(null);
  const [result, setResult] = useState<UploadResult | null>(null);

  async function upload() {
    setBusy(true);
    setError("");
    try {
      let prepared = attempt;
      if (!prepared) {
        if (
          !files.length ||
          files.length > 10 ||
          files.some(
            (file) =>
              !file.name.toLowerCase().endsWith(".pdf") ||
              file.type !== "application/pdf" ||
              file.size > 25 * 1024 * 1024,
          ) ||
          files.reduce((n, file) => n + file.size, 0) > 100 * 1024 * 1024
        )
          throw new Error("INVALID_UPLOAD");
        const uploads: Attempt["uploads"] = [];
        for (const file of files) {
          const staged = await post<{ uploadId: string; uploadUrl: string }>(
            `connections/${connectionId}/template-uploads`,
            { fileName: file.name, byteSize: file.size },
          );
          const response = await fetch(staged.uploadUrl, {
            method: "PUT",
            headers: { "Content-Type": "application/pdf" },
            body: file,
          });
          if (!response.ok) throw new Error("UPLOAD_FAILED");
          uploads.push({ id: staged.uploadId, name: file.name });
        }
        prepared = {
          uploadId: crypto.randomUUID(),
          title,
          uploads,
          connectionId,
        };
        setAttempt(prepared);
      }
      const { connectionId: companyConnection, ...payload } = prepared;
      const created = await post<UploadResult>(
        `connections/${companyConnection}/templates`,
        payload,
      );
      setResult(created);
      await onUploaded(companyConnection);
    } catch (e) {
      setError(errorText(e, zh));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-lg border border-line bg-white p-5">
      <h2 className="font-medium">
        {zh ? "上传公司标准文件" : "Upload company documents"}
      </h2>
      <p className="mt-2 text-sm text-ink-50">
        {zh
          ? "上传后由公司配置签署人和字段，再发布为买家、卖家或 Listing 文件包。上传和配置不会发送签署邀请。"
          : "Upload PDFs, configure recipients and fields as the company, then publish a buyer, seller or Listing package. Uploading does not send invitations."}
      </p>
      {error && (
        <p role="alert" className="mt-3 text-sm text-red-700">
          {error}
        </p>
      )}
      {result ? (
        <div className="mt-4 space-y-3">
          <p>
            {zh ? "公司模板已保存：" : "Company template saved: "}
            {result.title}
          </p>
          <a
            className={signingButton}
            href={result.editorUrl}
            target="_blank"
            rel="noopener noreferrer"
          >
            {zh ? "配置签署人和字段" : "Configure recipients and fields"}
          </a>
          <p className="text-sm text-ink-50">
            {zh
              ? "使用对应公司的签署管理账号完成配置，保存后回到下方刷新模板并发布。普通经纪人无需此账号。"
              : "Configure with the company's signing administrator account, then refresh the template below and publish. Agents do not need that account."}
          </p>
          <button
            type="button"
            className={signingButton}
            onClick={() => {
              setResult(null);
              setAttempt(null);
              setFiles([]);
              setTitle("");
            }}
          >
            {zh ? "上传另一套文件" : "Upload another set"}
          </button>
        </div>
      ) : (
        <form
          className="mt-4 space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            void upload();
          }}
        >
          <fieldset
            disabled={busy || Boolean(attempt)}
            className="grid gap-4 sm:grid-cols-2"
          >
            <label className="text-sm">
              {zh ? "所属公司" : "Company"}
              <select
                required
                className={signingInput}
                value={connectionId}
                onChange={(event) => setConnectionId(event.target.value)}
              >
                <option value="">{zh ? "选择公司" : "Select company"}</option>
                {connections.map((company) => (
                  <option key={company.id} value={company.id}>
                    {company.companyKey === "homix_living"
                      ? "Homix Living"
                      : "Homix Realty"}{" "}
                    · {company.nativeEmail}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-sm">
              {zh ? "模板名称" : "Template title"}
              <input
                required
                maxLength={200}
                className={signingInput}
                value={title}
                onChange={(event) => setTitle(event.target.value)}
              />
            </label>
            <label className="text-sm sm:col-span-2">
              {zh
                ? "选择 PDF（最多 10 份，每份 25 MB，总计 100 MB）"
                : "PDFs (up to 10, 25 MB each, 100 MB total)"}
              <input
                required
                type="file"
                multiple
                accept="application/pdf,.pdf"
                className={signingInput}
                onChange={(event) =>
                  setFiles(Array.from(event.target.files || []))
                }
              />
            </label>
          </fieldset>
          <button
            type="submit"
            disabled={busy || !connections.length}
            className={signingButton}
          >
            {busy
              ? zh
                ? "上传中…"
                : "Uploading…"
              : attempt
                ? zh
                  ? "检查并继续本次上传"
                  : "Check and resume upload"
                : zh
                  ? "上传到公司模板库"
                  : "Upload to company templates"}
          </button>
        </form>
      )}
    </section>
  );
}
