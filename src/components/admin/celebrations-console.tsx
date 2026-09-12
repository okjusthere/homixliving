"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useLocale } from "@/lib/i18n-client";
import { useListQuery } from "./list-controls";
import { EditPanel } from "./edit-panel";
import type {
  BirthdayChange,
  BirthdayFilter,
  BirthdayList,
  BirthdayRow,
  BirthdaySettings,
  CelebrationKind,
  ImportRow,
} from "@/lib/celebrations/types";

const endpoint = "/api/admin/celebrations";
const running = ["queued", "preparing", "generating", "saving"];
const statusLabels: Record<string, [string, string]> = {
  missing: ["Missing date", "待补日期"],
  excluded: ["Excluded", "不参与"],
  planned: ["Awaiting preparation", "待准备"],
  blocked: ["Needs attention", "待处理"],
  queued: ["Queued", "排队中"],
  preparing: ["Preparing", "准备中"],
  generating: ["Generating", "制作中"],
  saving: ["Saving", "保存中"],
  succeeded: ["Ready to review", "海报已做好"],
  failed: ["Failed", "制作失败"],
  needs_review: ["Verify result", "结果待核查"],
  celebrated: ["Celebrated", "已庆祝"],
};
async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Unable to complete request");
  return data;
}
export function CelebrationsConsole({ kind }: { kind: CelebrationKind }) {
  const zh = useLocale() === "zh",
    t = (en: string, cn: string) => (zh ? cn : en);
  const localError = (value: string) => {
    const parts = value.split(" / ");
    return zh ? parts[0] : parts.slice(1).join(" / ") || value;
  };
  const { params, update } = useListQuery();
  const filter = (
    ["today", "upcoming", "month", "missing", "all"].includes(
      params.get("period") || "",
    )
      ? params.get("period")
      : "today"
  ) as BirthdayFilter;
  const q = params.get("q") || "",
    page = params.get("page") || "1";
  const [data, setData] = useState<BirthdayList | null>(null),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const [version, setVersion] = useState(0),
    [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false);
  const [edit, setEdit] = useState<BirthdayRow | null>(null),
    [draft, setDraft] = useState<BirthdayChange | null>(null);
  const [importOpen, setImportOpen] = useState(false),
    [importRows, setImportRows] = useState<ImportRow[] | null>(null);
  const [settings, setSettings] = useState<BirthdaySettings | null>(null),
    [preview, setPreview] = useState<BirthdayRow | null>(null),
    [regenerate, setRegenerate] = useState<BirthdayRow | null>(null);
  useEffect(() => {
    const abort = new AbortController();
    const timer = setTimeout(
      () => {
        setLoading(true);
        api<BirthdayList>(
          `${endpoint}?${new URLSearchParams({ kind, filter, q, page })}`,
          { signal: abort.signal },
        )
          .then((v) => {
            setData(v);
            setError("");
          })
          .catch((e) => {
            if (!abort.signal.aborted) setError(e.message);
          })
          .finally(() => {
            if (!abort.signal.aborted) setLoading(false);
          });
      },
      q ? 200 : 0,
    );
    return () => {
      clearTimeout(timer);
      abort.abort();
    };
  }, [kind, filter, q, page, version]);
  const inProgress = data?.rows.some((r) => running.includes(r.status));
  useEffect(() => {
    if (!inProgress) return;
    const timer = setInterval(() => setVersion((v) => v + 1), 12000);
    return () => clearInterval(timer);
  }, [inProgress]);
  const refresh = () => setVersion((v) => v + 1);
  async function act(body: Record<string, unknown>, success?: () => void) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await api(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      success?.();
      refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }
  const beginEdit = (row: BirthdayRow) => {
    setError("");
    setEdit(row);
    setDraft({
      agentId: row.agentId,
      kind,
      joinedOn: row.joinedOn,
      month: row.month,
      day: row.day,
      enabled: row.enabled,
      revision: row.revision,
    });
  };
  const prepare = (row: BirthdayRow, retry = false) =>
    act(
      {
        action: "prepare",
        kind,
        agentId: row.agentId,
        revision: row.revision,
        ...(retry ? { retryGenerationId: row.generationId } : {}),
      },
      () => {
        setRegenerate(null);
        setNotice(
          t(
            "Preparation checked. See the status below.",
            "已检查准备任务，请查看下方状态。",
          ),
        );
      },
    );
  const tabs: [BirthdayFilter, string, string][] = [
    [
      "today",
      kind === "birthday" ? "Today’s birthdays" : "Today’s anniversaries",
      kind === "birthday" ? "今天生日" : "今天入职纪念日",
    ],
    ["upcoming", "Next 7 days", "未来 7 天"],
    ["month", "This month", "本月"],
    ["missing", "Missing dates", "待补资料"],
    ["all", "All active agents", "全部在职"],
  ];
  const validRows = importRows?.filter((r) => r.change) || [];
  const panelError = error ? (
    <p role="alert" className="admin-notice is-error">
      {localError(error)}
    </p>
  ) : null;
  return (
    <section
      className="space-y-4"
      aria-label={t("Company celebrations", "公司庆祝事项")}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="max-w-xl text-sm text-ink-70 space-y-1">
          <p>
            {kind === "birthday"
              ? t(
                  "Birthday greetings from the company. Only month and day are stored.",
                  "以公司名义送上生日祝福，只保存生日月和日。",
                )
              : t(
                  "Celebrate each full year together using the actual joining date.",
                  "按真实入职日期，庆祝每一个完整的同行周年。",
                )}
          </p>
          <p className="text-xs">
            {data
              ? t(
                  `${data.settings.enabled ? "Auto preparation on" : "Auto preparation paused"} · ${data.settings.leadDays} days ahead · New York time`,
                  `${data.settings.enabled ? "自动准备已开启" : "自动准备已暂停"} · 提前 ${data.settings.leadDays} 天 · 纽约时间`,
                )
              : t("Loading settings…", "正在读取设置…")}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            className="admin-control"
            onClick={() => {
              setError("");
              setImportRows(null);
              setImportOpen(true);
            }}
          >
            {t("Import roster", "导入名册")}
          </button>
          <button
            className="admin-control"
            disabled={!data}
            onClick={() => {
              setError("");
              setSettings(data!.settings);
            }}
          >
            {t("Preparation settings", "准备设置")}
          </button>
          <button
            className="admin-control"
            disabled={busy || loading}
            onClick={() =>
              act({ action: "scan" }, () =>
                setNotice(
                  t(
                    "Checked upcoming birthdays and anniversaries.",
                    "已检查近期生日与入职纪念日。",
                  ),
                ),
              )
            }
          >
            {busy ? t("Working…", "处理中…") : t("Check now", "立即检查")}
          </button>
        </div>
      </div>
      <div
        className="flex flex-wrap gap-2"
        aria-label={t("Date filters", "日期筛选")}
      >
        {tabs.map(([id, en, cn]) => (
          <button
            key={id}
            className={`admin-control ${filter === id ? "celebration-filter-active" : ""}`}
            aria-pressed={filter === id}
            onClick={() => update({ period: id, page: null }, true)}
          >
            {t(en, cn)}{" "}
            {data && (
              <span className="ml-1 text-ink-50 tabular-nums">
                {data.counts[id]}
              </span>
            )}
          </button>
        ))}
      </div>
      <label className="block max-w-md">
        <span className="sr-only">{t("Search agent", "搜索经纪人")}</span>
        <input
          className="admin-control w-full"
          placeholder={t(
            "Search name, email or account ID",
            "搜索姓名、邮箱或账号 ID",
          )}
          value={q}
          onChange={(e) => update({ q: e.target.value, page: null })}
        />
      </label>
      {error && !edit && !importOpen && !settings && !regenerate && panelError}
      {notice && (
        <p role="status" className="admin-notice">
          {notice}
        </p>
      )}
      <div
        className="rounded-lg border border-line bg-white"
        aria-busy={loading}
      >
        {loading && !data ? (
          <p className="p-8 text-sm">{t("Loading roster…", "正在读取名册…")}</p>
        ) : !data ? (
          <div className="p-8">
            <button className="admin-control" onClick={refresh}>
              {t("Retry", "重新加载")}
            </button>
          </div>
        ) : data.rows.length === 0 ? (
          <div className="p-8 space-y-3">
            <p>
              {q
                ? t("No matching agents.", "没有匹配的经纪人。")
                : filter === "missing"
                  ? t(
                      "All active agents have dates on file.",
                      "所有在职经纪人的日期已补齐。",
                    )
                  : t(
                      "No celebrations in this view.",
                      "当前筛选暂无庆祝事项。",
                    )}
            </p>
            {data.counts.missing > 0 && filter !== "missing" && (
              <>
                <p className="text-sm text-ink-50">
                  {t(
                    `${data.counts.missing} agents still need dates. Add them individually or import the HR roster.`,
                    `${data.counts.missing} 位经纪人仍缺日期，可以逐人补充或导入 HR 名册。`,
                  )}
                </p>
                <button
                  className="admin-control"
                  onClick={() =>
                    update({ period: "missing", q: null, page: null })
                  }
                >
                  {t("Complete missing dates", "去补资料")}
                </button>
              </>
            )}
          </div>
        ) : (
          <table className="celebration-table">
            <thead>
              <tr>
                <th>{t("Agent", "经纪人")}</th>
                <th>
                  {kind === "birthday"
                    ? t("Birthday", "生日")
                    : t("Anniversary", "入职纪念日")}
                </th>
                <th>{t("Preparation", "准备状态")}</th>
                <th>{t("Actions", "操作")}</th>
              </tr>
            </thead>
            <tbody>
              {data.rows.map((row) => (
                <tr key={row.agentId}>
                  <td>
                    <button
                      className="text-left font-medium hover:underline"
                      onClick={() => beginEdit(row)}
                    >
                      {row.name}
                    </button>
                    <div className="text-xs text-ink-50 break-all mt-1">
                      {row.email} · #{row.agentId}
                    </div>
                  </td>
                  <td>
                    <span>{row.month ? `${row.month}/${row.day}` : "—"}</span>
                    {row.years !== null && (
                      <span className="ml-2 text-ink-50">
                        {t(`${row.years} years`, `${row.years} 周年`)}
                      </span>
                    )}
                    <div className="text-xs text-ink-50 mt-1">
                      {row.days === 0
                        ? t("Today", "今天")
                        : row.days !== null
                          ? row.days > 0
                            ? t(`In ${row.days} days`, `${row.days} 天后`)
                            : t("Earlier this month", "本月已过")
                          : t("Date needed", "待补日期")}
                    </div>
                  </td>
                  <td>
                    <span
                      className={`celebration-status ${row.status === "succeeded" || row.status === "celebrated" ? "is-ready" : ""}`}
                    >
                      {t(
                        ...(statusLabels[row.status] || [
                          row.status,
                          row.status,
                        ]),
                      )}
                    </span>
                    {row.error && (
                      <p className="text-xs text-ink-50 mt-2 max-w-sm">
                        {localError(row.error)}
                      </p>
                    )}
                    {row.status === "needs_review" && (
                      <Link
                        className="text-xs underline block mt-1"
                        href="/admin/content?tab=generations"
                      >
                        {t("Review generation result", "核查生成结果")} →
                      </Link>
                    )}
                  </td>
                  <td>
                    <div className="flex flex-wrap gap-2">
                      {row.assetId && (
                        <button
                          className="admin-control"
                          onClick={() => {
                            setError("");
                            setPreview(row);
                          }}
                        >
                          {t("View poster", "查看海报")}
                        </button>
                      )}
                      {row.enabled &&
                        row.month &&
                        row.days !== null &&
                        row.days >= 0 &&
                        ["planned", "blocked", "failed"].includes(
                          row.status,
                        ) && (
                          <button
                            className="admin-control"
                            disabled={busy}
                            onClick={() =>
                              row.generationId
                                ? setRegenerate(row)
                                : prepare(row)
                            }
                          >
                            {row.status === "failed"
                              ? t("Retry", "重试")
                              : t("Prepare now", "立即准备")}
                          </button>
                        )}
                      <button
                        className="admin-control"
                        disabled={busy}
                        onClick={() => beginEdit(row)}
                      >
                        {t("Edit date", "维护日期")}
                      </button>
                      {row.status === "celebrated" && (
                        <button
                          className="text-xs underline"
                          disabled={busy}
                          onClick={() =>
                            act({
                              action: "celebrated",
                              eventId: row.eventId,
                              value: false,
                            })
                          }
                        >
                          {t("Undo mark", "撤销标记")}
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      {data && data.total > 0 && (
        <div className="flex justify-between items-center text-sm gap-3">
          <span>{t(`${data.total} agents`, `${data.total} 位经纪人`)}</span>
          <div className="flex gap-3 items-center">
            <button
              className="admin-control"
              disabled={data.page <= 1 || loading}
              onClick={() => update({ page: String(data.page - 1) })}
            >
              {t("Previous", "上一页")}
            </button>
            <span>
              {data.page} / {Math.ceil(data.total / 25)}
            </span>
            <button
              className="admin-control"
              disabled={data.page * 25 >= data.total || loading}
              onClick={() => update({ page: String(data.page + 1) })}
            >
              {t("Next", "下一页")}
            </button>
          </div>
        </div>
      )}
      <p className="text-xs text-ink-50">
        {t(
          "Admin-only drafts. Review before sharing. February 29 is observed on February 28 in non-leap years.",
          "海报为管理员内部草稿，分享前请检查。2 月 29 日在非闰年按 2 月 28 日庆祝。",
        )}
      </p>
      {edit && draft && (
        <EditPanel
          title={edit.name}
          description={edit.email}
          onClose={() => {
            setEdit(null);
            setDraft(null);
          }}
          saving={busy}
          dirty={
            draft.month !== edit.month ||
            draft.day !== edit.day ||
            draft.enabled !== edit.enabled ||
            draft.joinedOn !== edit.joinedOn
          }
          footer={
            <button
              className="admin-control"
              disabled={busy}
              onClick={() =>
                act({ action: "save", changes: [draft] }, () => {
                  setEdit(null);
                  setDraft(null);
                })
              }
            >
              {busy ? t("Saving…", "保存中…") : t("Save date", "保存日期")}
            </button>
          }
        >
          <div className="space-y-5">
            {panelError}
            {kind === "birthday" ? (
              <div className="grid grid-cols-2 gap-4">
                <label>
                  {t("Month", "生日月")}
                  <input
                    className="admin-control w-full mt-2"
                    type="number"
                    min={1}
                    max={12}
                    value={draft.month ?? ""}
                    onChange={(e) =>
                      setDraft({
                        ...draft,
                        month: e.target.value ? Number(e.target.value) : null,
                      })
                    }
                  />
                </label>
                <label>
                  {t("Day", "生日 日")}
                  <input
                    className="admin-control w-full mt-2"
                    type="number"
                    min={1}
                    max={31}
                    value={draft.day ?? ""}
                    onChange={(e) =>
                      setDraft({
                        ...draft,
                        day: e.target.value ? Number(e.target.value) : null,
                      })
                    }
                  />
                </label>
              </div>
            ) : (
              <label className="block">
                {t("Actual joining date", "真实入职日期")}
                <input
                  type="date"
                  className="admin-control w-full mt-2"
                  max={data?.today}
                  value={draft.joinedOn || ""}
                  onChange={(e) => {
                    const d = e.target.value;
                    setDraft({
                      ...draft,
                      joinedOn: d || null,
                      month: d ? Number(d.slice(5, 7)) : null,
                      day: d ? Number(d.slice(8, 10)) : null,
                    });
                  }}
                />
              </label>
            )}
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={draft.enabled}
                onChange={(e) =>
                  setDraft({ ...draft, enabled: e.target.checked })
                }
              />
              {t("Include in company celebrations", "参与公司庆祝")}
            </label>
            <p className="text-sm text-ink-50">
              {kind === "birthday"
                ? t(
                    "No birth year or age is collected.",
                    "不收集出生年份和年龄。",
                  )
                : t(
                    "Use the HR-confirmed joining date, not the account creation date.",
                    "请使用 HR 确认的入职日期，不是账号注册日期。",
                  )}
            </p>
            <button
              className="text-sm underline"
              onClick={() =>
                setDraft({ ...draft, month: null, day: null, joinedOn: null })
              }
            >
              {t("Clear date", "清空日期")}
            </button>
          </div>
        </EditPanel>
      )}
      {importOpen && (
        <EditPanel
          title={t("Import HR roster", "导入 HR 名册")}
          onClose={() => setImportOpen(false)}
          saving={busy}
          dirty={validRows.length > 0}
          footer={
            importRows && (
              <button
                className="admin-control"
                disabled={busy || !validRows.length}
                onClick={() =>
                  act(
                    { action: "save", changes: validRows.map((r) => r.change) },
                    () => {
                      setImportOpen(false);
                      setImportRows(null);
                      setNotice(
                        t(
                          `Imported ${validRows.length} dates.`,
                          `已导入 ${validRows.length} 条日期资料。`,
                        ),
                      );
                    },
                  )
                }
              >
                {t(
                  `Confirm ${validRows.length} valid rows`,
                  `确认导入 ${validRows.length} 条有效资料`,
                )}
              </button>
            )
          }
        >
          <div className="space-y-4">
            {panelError}
            <p className="text-sm">
              {t(
                "Upload .xlsx (first worksheet) or UTF-8 .csv, up to 2 MB / 1,000 rows. Match by exact primary email or account ID.",
                "上传 .xlsx（首个工作表）或 UTF-8 .csv，最多 2 MB、1,000 行。按系统主邮箱或账号 ID 精确匹配。",
              )}
            </p>
            <p className="text-xs text-ink-50">
              {kind === "birthday"
                ? t(
                    "Columns: email, birthday_month, birthday_day. A birthday column (MM/DD) or an Excel date also works; birth years are discarded.",
                    "表头：email、birthday_month、birthday_day。也支持 birthday 列（月/日）或 Excel 日期，出生年份会丢弃。",
                  )
                : t(
                    "Columns: email, joined_on (YYYY-MM-DD or an Excel date).",
                    "表头：email、joined_on（YYYY-MM-DD 或 Excel 日期）。",
                  )}
            </p>
            <a
              className="admin-control inline-flex"
              href={`${endpoint}/import?kind=${kind}`}
            >
              {t("Download CSV template", "下载 CSV 模板")}
            </a>
            <label className="block">
              {t("Roster file", "名册文件")}
              <input
                className="block mt-2 text-sm max-w-full"
                type="file"
                accept=".xlsx,.csv"
                disabled={busy}
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  setImportRows(null);
                  setError("");
                  setBusy(true);
                  try {
                    const form = new FormData();
                    form.set("file", file);
                    const result = await api<{ rows: ImportRow[] }>(
                      `${endpoint}/import?kind=${kind}`,
                      { method: "POST", body: form },
                    );
                    setImportRows(result.rows);
                  } catch (e) {
                    setError(e instanceof Error ? e.message : String(e));
                  } finally {
                    setBusy(false);
                  }
                }}
              />
            </label>
            {busy && <p role="status">{t("Processing…", "处理中…")}</p>}
            {importRows && (
              <>
                <p className="text-sm">
                  {t(
                    `${validRows.length} valid · ${importRows.length - validRows.length} need correction. Only valid rows will be imported.`,
                    `${validRows.length} 条有效 · ${importRows.length - validRows.length} 条需修正。只导入有效资料。`,
                  )}
                </p>
                <ul className="divide-y divide-line">
                  {importRows.map((r) => (
                    <li key={r.row} className="py-3 text-sm">
                      <p>
                        {t("Row", "第")}
                        {r.row} · {r.name || r.email || "—"}
                      </p>
                      {r.error ? (
                        <p className="text-amber-800 text-xs mt-1">
                          {localError(r.error)}
                        </p>
                      ) : (
                        <p className="text-xs text-ink-50 mt-1">
                          {r.email} · {r.previous} →{" "}
                          {kind === "anniversary"
                            ? r.change?.joinedOn
                            : `${r.change?.month}/${r.change?.day}`}
                        </p>
                      )}
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>
        </EditPanel>
      )}
      {settings && (
        <EditPanel
          title={t("Company celebration settings", "公司庆祝准备设置")}
          description={t(
            "Shared by birthdays and work anniversaries.",
            "生日与入职纪念日共用此设置。",
          )}
          onClose={() => setSettings(null)}
          saving={busy}
          dirty={JSON.stringify(settings) !== JSON.stringify(data?.settings)}
          footer={
            <button
              className="admin-control"
              disabled={busy}
              onClick={() =>
                act({ action: "settings", settings }, () => setSettings(null))
              }
            >
              {t("Save settings", "保存设置")}
            </button>
          }
        >
          <div className="space-y-5">
            {panelError}
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={settings.enabled}
                onChange={(e) =>
                  setSettings({ ...settings, enabled: e.target.checked })
                }
              />
              {t("Automatically prepare upcoming posters", "自动准备近期海报")}
            </label>
            <label className="block">
              {t("Days ahead (1–30)", "提前天数（1–30）")}
              <input
                type="number"
                min={1}
                max={30}
                className="admin-control block mt-2"
                value={settings.leadDays}
                onChange={(e) =>
                  setSettings({ ...settings, leadDays: Number(e.target.value) })
                }
              />
            </label>
            <label className="block">
              {t(
                "Company daily image limit (1–50)",
                "公司每日生成上限（1–50 张）",
              )}
              <input
                type="number"
                min={1}
                max={50}
                className="admin-control block mt-2"
                value={settings.dailyLimit}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    dailyLimit: Number(e.target.value),
                  })
                }
              />
            </label>
            <label className="block">
              {t("Poster language", "海报语言")}
              <select
                className="admin-control block mt-2"
                value={settings.language}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    language: e.target.value as "zh" | "en",
                  })
                }
              >
                <option value="zh">中文</option>
                <option value="en">English</option>
              </select>
            </label>
            <p className="text-sm text-ink-50">
              {t(
                "Checks every morning. Pausing stops new automatic preparations; existing jobs finish. Manual generation remains available. Posters are never automatically posted or emailed.",
                "每天早晨检查一次。暂停后不再创建自动任务，已排队任务会继续，仍可手动制作。系统不会自动对外发布或发邮件。",
              )}
            </p>
            <Link
              className="text-sm underline"
              href="/admin/content?tab=templates"
            >
              {t("Manage poster templates", "管理海报模板")} →
            </Link>
          </div>
        </EditPanel>
      )}
      {preview && (
        <EditPanel
          title={preview.name}
          description={t(
            "Check the name, portrait and wording before sharing.",
            "分享前请检查姓名、头像与祝福文案。",
          )}
          onClose={() => setPreview(null)}
          saving={busy}
          footer={
            <div className="flex flex-wrap gap-2">
              <a
                className="admin-control"
                href={`/api/content/assets/${preview.assetId}?download=1`}
              >
                {t("Download poster", "下载海报")}
              </a>
              {preview.status !== "celebrated" && (
                <button
                  className="admin-control"
                  disabled={busy}
                  onClick={() =>
                    act(
                      {
                        action: "celebrated",
                        eventId: preview.eventId,
                        value: true,
                      },
                      () => setPreview(null),
                    )
                  }
                >
                  {t("Mark celebrated", "标记已庆祝")}
                </button>
              )}
              {preview.status !== "celebrated" && (
                <button
                  className="admin-control"
                  onClick={() => {
                    setRegenerate(preview);
                    setPreview(null);
                  }}
                >
                  {t("Regenerate", "重新制作")}
                </button>
              )}
            </div>
          }
        >
          {panelError}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={`/api/content/assets/${preview.assetId}`}
            alt={t(
              `Celebration poster for ${preview.name}`,
              `${preview.name} 的庆祝海报`,
            )}
            className="w-full rounded-lg"
          />
        </EditPanel>
      )}
      {regenerate && (
        <EditPanel
          title={t("Regenerate poster", "重新制作海报")}
          description={regenerate.name}
          onClose={() => setRegenerate(null)}
          saving={busy}
          footer={
            <button
              className="admin-control"
              disabled={busy}
              onClick={() => prepare(regenerate, true)}
            >
              {t("Generate a new version", "确认制作新版本")}
            </button>
          }
        >
          {panelError}
          <p className="text-sm">
            {t(
              "This uses one company image generation. The new version replaces the current poster in this list; the previous version remains in the administrator generation history.",
              "这会使用一次公司海报生成额度。新版本会替换当前列表中的海报，旧版本保留在管理员生成记录中。",
            )}
          </p>
        </EditPanel>
      )}
    </section>
  );
}
