"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowUpRight, FileSignature, RefreshCw, Search } from "lucide-react";
import { PageHeader, FilterTabs, Toolbar } from "@/components/homix/page-kit";
import { useLocale } from "@/lib/i18n-client";
import type { SigningRequest } from "@/lib/signing-contract";
import { categories, errorText, signingButton, signingFetch } from "./client";
import { SigningCreate } from "./create";

export function SigningWorkspace() {
  const locale = useLocale(),
    zh = locale === "zh",
    params = useSearchParams(),
    router = useRouter();
  const category = params.get("category") || "all",
    query = params.get("query") || "",
    page = Math.max(1, Number(params.get("page") || 1));
  const [search, setSearch] = useState(query),
    [data, setData] = useState<{
      items: SigningRequest[];
      count: number;
      truncated: boolean;
    } | null>(null);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const mode = params.get("new");
  const change = useCallback(
    (values: Record<string, string>) => {
      const next = new URLSearchParams(params.toString());
      for (const [key, value] of Object.entries(values)) {
        if (value && value !== "all") next.set(key, value);
        else next.delete(key);
      }
      router.replace(`/signing${next.size ? `?${next}` : ""}`, {
        scroll: false,
      });
    },
    [params, router],
  );
  const load = useCallback(async () => {
    setBusy(true);
    setError("");
    try {
      const queryParams = new URLSearchParams({ query, page: String(page) });
      if (category !== "all") queryParams.set("category", category);
      setData(await signingFetch(`requests?${queryParams}`));
    } catch (e) {
      setError(errorText(e, zh));
    } finally {
      setBusy(false);
    }
  }, [query, category, page, zh]);
  useEffect(() => {
    void load();
  }, [load]);
  useEffect(() => {
    const refresh = () => {
      void load();
    };
    window.addEventListener("focus", refresh);
    return () => window.removeEventListener("focus", refresh);
  }, [load]);
  const back = params.toString();
  return (
    <div className="mx-auto w-full max-w-7xl space-y-6 px-4 py-7 sm:px-8">
      <PageHeader
        eyebrow={zh ? "交易支持" : "Transaction support"}
        title={zh ? "文件签署" : "File signing"}
        description={
          zh
            ? "使用公司标准文件包，填写客户资料并发送，跟进每位签署人的进度。"
            : "Use company packages, enter client details and follow every signature."
        }
      />
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {(["buyer", "seller", "commercial", "company_file"] as const).map(
          (kind) => (
            <button
              key={kind}
              type="button"
              onClick={() => change({ new: kind })}
              className="flex items-center gap-3 rounded-lg border border-line bg-white p-4 text-left hover:bg-paper-deep"
            >
              <FileSignature size={21} aria-hidden />
              <div className="min-w-0 flex-1">
                <p className="font-medium">
                  {kind === "company_file"
                    ? "Company File"
                    : kind === "buyer"
                      ? zh
                        ? "买家签署包"
                        : "Buyer package"
                      : kind === "commercial"
                        ? zh
                          ? "商业及其他"
                          : "Commercial & other"
                        : zh
                          ? "卖家 / Listing 签署包"
                          : "Seller / Listing package"}
                </p>
                <p className="mt-1 text-xs text-ink-50">
                  {kind === "company_file"
                    ? zh
                      ? "公司内部材料"
                      : "Internal company documents"
                    : zh
                      ? "公司模板，资料填一次"
                      : "Company templates, one set of details"}
                </p>
              </div>
              <ArrowUpRight size={16} aria-hidden />
            </button>
          ),
        )}
      </div>
      {(mode === "buyer" ||
        mode === "seller" ||
        mode === "commercial" ||
        mode === "company_file") && (
        <SigningCreate
          key={mode}
          mode={mode}
          onClose={() => change({ new: "", from: "" })}
        />
      )}
      <Toolbar>
        <FilterTabs
          options={Object.entries(categories[locale]).map(([id, label]) => ({
            id,
            label,
          }))}
          value={category}
          onChange={(value) => change({ category: value, page: "" })}
        />
        <form
          onSubmit={(event) => {
            event.preventDefault();
            change({ query: search, page: "" });
          }}
          className="flex w-full items-center gap-2 sm:w-auto"
        >
          <label className="flex flex-1 items-center gap-2 rounded-md border border-line bg-white px-3 py-2">
            <Search size={16} aria-hidden />
            <input
              aria-label={
                zh ? "搜索客户、房产、文件" : "Search client, property or file"
              }
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={
                zh ? "客户、房产、文件名" : "Client, property or file"
              }
              className="w-full min-w-0 bg-transparent text-sm outline-none"
            />
          </label>
          <button className={signingButton} type="submit">
            {zh ? "搜索" : "Search"}
          </button>
          <button
            className={signingButton}
            type="button"
            aria-label={zh ? "刷新列表" : "Refresh list"}
            onClick={() => void load()}
            disabled={busy}
          >
            <RefreshCw size={16} aria-hidden />
          </button>
        </form>
      </Toolbar>
      {error && (
        <p
          role="alert"
          className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm"
        >
          {error}
        </p>
      )}
      <section
        aria-busy={busy}
        className="overflow-hidden rounded-lg border border-line bg-white"
      >
        <div className="border-b border-line px-4 py-3 text-sm text-ink-50">
          {busy
            ? zh
              ? "正在读取…"
              : "Loading…"
            : `${data?.count ?? 0} ${zh ? "项任务" : "requests"}`}
        </div>
        {data?.items.length === 0 && !busy && (
          <div className="px-5 py-12 text-center">
            <FileSignature
              className="mx-auto mb-3 text-ink-50"
              size={28}
              aria-hidden
            />
            <p>
              {zh
                ? "当前筛选下没有签署任务"
                : "No signing requests match these filters"}
            </p>
            <p className="mt-2 text-sm text-ink-50">
              {zh
                ? "从上方选择公司签署包或上传自己的 PDF。"
                : "Choose a company package above or upload your PDF."}
            </p>
          </div>
        )}
        <ul className="divide-y divide-line">
          {data?.items.map((item) => {
            const recipients = item.parts
              .flatMap((part) => part.document?.recipients || [])
              .filter((r) => r.role !== "CC");
            const signed = recipients.filter(
              (r) => r.signingStatus === "SIGNED",
            ).length;
            return (
              <li key={item.id}>
                <Link
                  href={`/signing/${item.id}${back ? `?back=${encodeURIComponent(back)}` : ""}`}
                  className="grid gap-3 px-4 py-4 hover:bg-paper sm:grid-cols-[minmax(0,1fr)_10rem_9rem] sm:items-center"
                >
                  <div className="min-w-0">
                    <p className="truncate font-medium">{item.title}</p>
                    <p className="mt-1 truncate text-sm text-ink-50">
                      {[item.business.customer, item.business.property]
                        .filter(Boolean)
                        .join(" · ") ||
                        (zh
                          ? "未关联客户或房产"
                          : "No client or property reference")}
                    </p>
                  </div>
                  <div className="flex items-center gap-3 sm:block">
                    <p className="text-sm">
                      {categories[locale][item.category]}
                    </p>
                    <p className="mt-1 text-xs text-ink-50">
                      {recipients.length
                        ? `${signed}/${recipients.length} ${zh ? "位已完成" : "completed"}`
                        : zh
                          ? "待设置签署人"
                          : "Set recipients"}
                    </p>
                  </div>
                  <div className="flex justify-between gap-2 text-xs text-ink-50 sm:block sm:text-right">
                    <time dateTime={item.updatedAt}>
                      {new Date(item.updatedAt).toLocaleDateString(
                        locale === "zh" ? "zh-CN" : "en-US",
                      )}
                    </time>
                    <p className="mt-1 text-sm text-ink">
                      {item.category === "draft"
                        ? zh
                          ? "继续准备 →"
                          : "Continue →"
                        : item.category === "completed"
                          ? zh
                            ? "下载文件 →"
                            : "Download →"
                          : zh
                            ? "查看进度 →"
                            : "View progress →"}
                    </p>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      </section>
      {data?.truncated && (
        <p className="text-sm text-ink-50">
          {zh
            ? "显示最近 500 项，请通过客户或文件名缩小范围。"
            : "Showing the latest 500 matches. Narrow the search by client or document."}
        </p>
      )}
      {(data?.count ?? 0) > 30 && (
        <div className="flex justify-end gap-3">
          <button
            className={signingButton}
            disabled={page <= 1}
            onClick={() => change({ page: String(page - 1) })}
          >
            {zh ? "上一页" : "Previous"}
          </button>
          <span className="self-center text-sm">{page}</span>
          <button
            className={signingButton}
            disabled={page * 30 >= (data?.count ?? 0)}
            onClick={() => change({ page: String(page + 1) })}
          >
            {zh ? "下一页" : "Next"}
          </button>
        </div>
      )}
    </div>
  );
}
