"use client";

import { useState } from "react";
import type { SigningPackage } from "@/lib/signing-contract";
import { errorText, signingButton, signingInput } from "./client";

export function PackageComposer({
  packages,
  zh,
  onPublished,
}: {
  packages: SigningPackage[];
  zh: boolean;
  onPublished: () => Promise<void>;
}) {
  const [scenario, setScenario] = useState("buyer");
  const [documentIds, setDocumentIds] = useState<string[]>([]);
  const [title, setTitle] = useState("");
  const [key, setKey] = useState("");
  const [version, setVersion] = useState(1);
  const [order, setOrder] = useState("PARALLEL");
  const [reviewed, setReviewed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const documents = packages.filter(
    (p) => p.catalog_kind === "document" && p.scenario === scenario,
  );
  const selected = documentIds
    .map((id) => documents.find((p) => p.id === id))
    .filter((p): p is SigningPackage => Boolean(p));
  const companies = selected.length
    ? (selected[0].applicable_company_keys?.length
        ? selected[0].applicable_company_keys
        : [selected[0].company_key]
      ).filter((c) =>
        selected.every((p) =>
          (p.applicable_company_keys?.length
            ? p.applicable_company_keys
            : [p.company_key]
          ).includes(c),
        ),
      )
    : [];
  function changeIds(ids: string[]) {
    setDocumentIds(ids);
    setReviewed(false);
  }
  async function publish() {
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch("/api/admin/signing/packages/compose", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          packageKey: key,
          version,
          title,
          scenario,
          companyKey: selected[0].company_key,
          applicableCompanyKeys: companies,
          documentIds,
          signingOrder: order,
          reviewed,
        }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error);
      changeIds([]);
      await onPublished();
      setMessage(
        zh
          ? "文件包已发布，引用的每份文件版本已固定。"
          : "Package published with pinned document versions.",
      );
    } catch (error) {
      setMessage(errorText(error, zh));
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="rounded-lg border border-line bg-white p-5">
      <h2 className="font-medium">
        {zh
          ? "用已审核文件配置文件包"
          : "Compose a package from approved documents"}
      </h2>
      <p className="mt-2 text-sm leading-6 text-ink-50">
        {zh
          ? "先在下方逐份审核文件，再选择版本和顺序。客户使用统一入口，签署完成的 PDF 仍逐份保存；更新模板不会改变已经发出的任务。"
          : "Approve individual documents below, then select their versions and order. Clients use one signing entry and completed PDFs remain separate. Template updates do not change existing requests."}
      </p>
      <form
        className="mt-4 space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          void publish();
        }}
      >
        <fieldset disabled={busy} className="grid gap-4 sm:grid-cols-2">
          <label className="text-sm">
            {zh ? "使用场景" : "Scenario"}
            <select
              className={signingInput}
              value={scenario}
              onChange={(e) => {
                setScenario(e.target.value);
                changeIds([]);
              }}
            >
              <option value="buyer">{zh ? "买家" : "Buyer"}</option>
              <option value="seller">
                {zh ? "卖家 / Listing" : "Seller / Listing"}
              </option>
              <option value="commercial">
                {zh ? "商业及其他" : "Commercial & other"}
              </option>
              <option value="company_file">Company File</option>
            </select>
          </label>
          <label className="text-sm">
            {zh ? "名称" : "Title"}
            <input
              required
              className={signingInput}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </label>
          <label className="text-sm">
            {zh ? "固定用途编号" : "Stable package key"}
            <input
              required
              pattern="[a-zA-Z0-9][a-zA-Z0-9_.:-]*"
              className={signingInput}
              value={key}
              onChange={(e) => setKey(e.target.value)}
            />
          </label>
          <label className="text-sm">
            {zh ? "新版本号" : "New version"}
            <input
              required
              min={1}
              type="number"
              className={signingInput}
              value={version}
              onChange={(e) => setVersion(Number(e.target.value))}
            />
          </label>
          <label className="text-sm sm:col-span-2">
            {zh ? "添加已审核版本" : "Add an approved version"}
            <select
              className={signingInput}
              value=""
              onChange={(e) => {
                if (e.target.value) changeIds([...documentIds, e.target.value]);
              }}
            >
              <option value="">{zh ? "选择文件" : "Choose a document"}</option>
              {documents
                .filter(
                  (p) =>
                    !documentIds.includes(p.id) &&
                    (!selected.length ||
                      p.company_key === selected[0].company_key),
                )
                .map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.title} · v{p.version}
                  </option>
                ))}
            </select>
          </label>
        </fieldset>
        {!documents.length && (
          <p className="text-sm text-ink-50">
            {zh
              ? "此场景还没有独立审核的文件。"
              : "No independently approved documents for this scenario yet."}
          </p>
        )}
        <ol className="space-y-2">
          {selected.map((p, i) => (
            <li
              key={p.id}
              className="flex flex-wrap items-center gap-2 rounded-md bg-paper p-3 text-sm"
            >
              <span className="mr-auto">
                {i + 1}. {p.title} · v{p.version}
              </span>
              <button
                type="button"
                className={signingButton}
                disabled={busy || i === 0}
                aria-label={`${zh ? "上移" : "Move up"} ${p.title}`}
                onClick={() => {
                  const ids = [...documentIds];
                  [ids[i - 1], ids[i]] = [ids[i], ids[i - 1]];
                  changeIds(ids);
                }}
              >
                ↑
              </button>
              <button
                type="button"
                className={signingButton}
                disabled={busy}
                onClick={() =>
                  changeIds(documentIds.filter((id) => id !== p.id))
                }
              >
                {zh ? "移除" : "Remove"}
              </button>
            </li>
          ))}
        </ol>
        <label className="block text-sm">
          {zh ? "签署顺序" : "Signing order"}
          <select
            disabled={busy}
            className={signingInput}
            value={order}
            onChange={(e) => {
              setOrder(e.target.value);
              setReviewed(false);
            }}
          >
            <option value="PARALLEL">
              {zh ? "所有人可同时办理" : "Everyone can sign in parallel"}
            </option>
            <option value="SEQUENTIAL">
              {zh
                ? "按角色首次出现顺序依次办理"
                : "Sequential, in order of first role appearance"}
            </option>
          </select>
        </label>
        {selected.length > 0 && (
          <p className="text-sm text-ink-50">
            {zh ? "适用公司" : "Companies"}: {companies.join(" · ")}
            <br />
            {zh ? "参与角色" : "Roles"}:{" "}
            {[
              ...new Map(
                selected
                  .flatMap((p) => p.definition.flatMap((d) => d.roles))
                  .map((r) => [r.key, r]),
              ).values(),
            ]
              .map(
                (r) =>
                  `${r.label}${r.optional ? (zh ? "（可选）" : " (optional)") : ""}`,
              )
              .join(" → ")}
          </p>
        )}
        <label className="flex items-start gap-2 text-sm">
          <input
            required
            disabled={busy}
            type="checkbox"
            checked={reviewed}
            onChange={(e) => setReviewed(e.target.checked)}
          />
          {zh
            ? "已核对文件版本、适用公司、参与角色和顺序。"
            : "I reviewed the document versions, companies, roles and order."}
        </label>
        <button
          type="submit"
          className={signingButton}
          disabled={busy || !reviewed || !selected.length || !companies.length}
        >
          {zh ? "发布文件包" : "Publish package"}
        </button>
        {message && (
          <p role="status" className="text-sm">
            {message}
          </p>
        )}
      </form>
    </section>
  );
}
