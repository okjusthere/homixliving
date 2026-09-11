"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import {
  ArrowDown,
  ArrowUp,
  GripVertical,
  MoreHorizontal,
  Search,
} from "lucide-react";
import { toast } from "sonner";
import { useLocale } from "@/lib/i18n-client";
import type { AdminAgentRow, PublicProfile } from "@/lib/homixweb";
import {
  matchesAgentSearch,
  moveListItem,
  paginate,
  websiteLinkState,
} from "@/lib/agent-list";
import { useListQuery, ListPagination } from "@/components/admin/list-controls";
import { EditPanel } from "@/components/admin/edit-panel";
import { PublicProfileEditor } from "@/app/profile/public/editor";

const WEB = "https://www.homixny.com/agents/";
type Candidate = {
  id: number;
  name: string;
  email: string;
  accountStatus: "active" | "pending" | "inactive";
};
type RosterResponse = {
  ok?: boolean;
  error?: string;
  linked?: boolean;
  notice?: string;
};

function ProfilePanel({
  id,
  onClose,
  onSaved,
  returnTo,
}: {
  id: string;
  onClose: () => void;
  onSaved: () => void;
  returnTo: string;
}) {
  const zh = useLocale() === "zh";
  const [profile, setProfile] = useState<PublicProfile | null>(null);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/admin/roster/${encodeURIComponent(id)}`, {
      signal: controller.signal,
    })
      .then(async (r) => {
        if (!r.ok)
          throw new Error(r.status === 404 ? "missing" : "unavailable");
        const data = await r.json();
        setProfile(data.profile);
        setError("");
      })
      .catch((e) => {
        if (!controller.signal.aborted) setError(e.message);
      });
    return () => controller.abort();
  }, [id, attempt]);
  return (
    <EditPanel
      title={profile?.name || (zh ? "官网资料" : "Website profile")}
      description={
        zh ? "修改保存后同步到官网" : "Saved changes sync to the public website"
      }
      onClose={onClose}
      dirty={dirty}
      saving={saving}
    >
      {error ? (
        <div role="alert" className="admin-notice">
          <p>
            {zh
              ? error === "missing"
                ? "该官网档案已不存在。"
                : "暂时无法读取官网资料。"
              : error === "missing"
                ? "This profile no longer exists."
                : "Website profile unavailable."}
          </p>
          <button
            className="admin-control mt-3"
            onClick={() => setAttempt((v) => v + 1)}
          >
            {zh ? "重试" : "Retry"}
          </button>
        </div>
      ) : !profile ? (
        <div className="admin-empty" role="status">
          {zh ? "正在读取资料…" : "Loading profile…"}
        </div>
      ) : (
        <>
          <Link
            className="mb-4 inline-block text-xs underline"
            href={`/admin/agents/website/${encodeURIComponent(id)}?returnTo=${encodeURIComponent(returnTo)}`}
          >
            {zh ? "打开完整编辑页" : "Open full editor"} ↗
          </Link>
          <PublicProfileEditor
            linked
            unreachable={false}
            profile={profile}
            targetAgentId={profile.portal_agent_id || 0}
            isOwn={false}
            canCreate={false}
            agentName={profile.name || profile.slug}
            agentPhone={profile.phone}
            agentLicense={profile.license_number}
            adminPublicId={id}
            compact
            onDirtyChange={setDirty}
            onSavingChange={setSaving}
            onSaved={onSaved}
            identityEditHref={
              profile.portal_agent_id
                ? `/admin/agents?agent=${profile.portal_agent_id}`
                : undefined
            }
          />
        </>
      )}
    </EditPanel>
  );
}

export function RosterConsole({
  initialAgents: agents,
  portalAgents,
  unreachable,
  loading = false,
  onAgentsChange,
  onRetry,
  portalUnavailable = false,
}: {
  initialAgents: AdminAgentRow[];
  portalAgents: Candidate[];
  unreachable: boolean;
  loading?: boolean;
  onAgentsChange: React.Dispatch<React.SetStateAction<AdminAgentRow[]>>;
  onRetry: () => Promise<unknown>;
  portalUnavailable?: boolean;
}) {
  const zh = useLocale() === "zh";
  const { params, update, href } = useListQuery();
  const q = params.get("q") || "";
  const visibility = [
    "visible",
    "admin_hidden",
    "agent_hidden",
    "unknown",
  ].includes(params.get("visibility") || "")
    ? params.get("visibility")!
    : "";
  const linkFilter = ["linked", "unlinked", "broken"].includes(
    params.get("link") || "",
  )
    ? params.get("link")!
    : "";
  const [busy, setBusy] = useState<Record<string, boolean>>({});
  const locks = useRef(new Set<string>());
  const [notice, setNotice] = useState<{ error: boolean; text: string } | null>(
    null,
  );
  const [linkTarget, setLinkTarget] = useState<AdminAgentRow | null>(null);
  const [candidateQuery, setCandidateQuery] = useState("");
  const [candidateId, setCandidateId] = useState<number | null>(null);
  const [mergeTarget, setMergeTarget] = useState<AdminAgentRow | null>(null);
  const [keepId, setKeepId] = useState("");
  const [order, setOrder] = useState<string[] | null>(null);
  const originalOrder = useRef<string[]>([]);
  const [dragging, setDragging] = useState<string | null>(null);
  const anyBusy = Object.values(busy).some(Boolean);
  const filtered = agents.filter(
    (a) =>
      (!visibility ||
        (visibility === "unknown"
          ? a.visibility_status == null
          : a.visibility_status === visibility)) &&
      (!linkFilter || websiteLinkState(a) === linkFilter) &&
      matchesAgentSearch(q, [
        a.name,
        a.slug,
        a.email,
        a.license_number,
        a.linked_portal_agent?.name,
        a.linked_portal_agent?.email,
      ]),
  );
  const pagination = paginate(filtered, params.get("page"), params.get("size"));
  const byId = useMemo(() => new Map(agents.map((a) => [a.id, a])), [agents]);
  const orderedRows = order
    ? order.flatMap((id) => (byId.has(id) ? [byId.get(id)!] : []))
    : pagination.items;
  const usedIds = new Set(
    agents.map((a) => a.portal_agent_id).filter((id) => id != null),
  );
  const candidates = portalAgents.filter(
    (a) =>
      !usedIds.has(a.id) &&
      matchesAgentSearch(candidateQuery, [a.name, a.email, String(a.id)]),
  );
  const selectedCandidate = portalAgents.find((a) => a.id === candidateId);
  const keepProfile = agents.find((a) => a.id === keepId);
  const allCounts = {
    linked: agents.filter((a) => websiteLinkState(a) === "linked").length,
    unlinked: agents.filter((a) => websiteLinkState(a) === "unlinked").length,
    broken: agents.filter((a) => websiteLinkState(a) === "broken").length,
  };
  const returnQuery = new URLSearchParams(params);
  returnQuery.delete("profile");
  const returnTo = `/admin/agents?${returnQuery}`;
  const label = (a: AdminAgentRow) =>
    a.visibility_status === "visible"
      ? zh
        ? "公开"
        : "Visible"
      : a.visibility_status === "agent_hidden"
        ? zh
          ? "经纪人隐藏"
          : "Agent hidden"
        : a.visibility_status === "admin_hidden"
          ? zh
            ? "管理员隐藏"
            : "Admin hidden"
          : zh
            ? "未设定 · 不公开"
            : "Unset · hidden";
  const setLock = (id: string, value: boolean) => {
    if (value) locks.current.add(id);
    else locks.current.delete(id);
    setBusy((prev) => ({ ...prev, [id]: value }));
  };
  async function readRoster() {
    const r = await fetch("/api/admin/roster", {
      cache: "no-store",
      signal: AbortSignal.timeout(15000),
    });
    if (!r.ok) throw new Error();
    const data = await r.json();
    if (!Array.isArray(data.agents)) throw new Error();
    onAgentsChange(data.agents);
    return data.agents as AdminAgentRow[];
  }
  async function post(body: Record<string, unknown>) {
    const r = await fetch("/api/admin/roster", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(25000),
    });
    const data: RosterResponse = await r.json().catch(() => ({}));
    return { ok: r.ok && !!data.ok, data };
  }
  async function reconcileFailure() {
    try {
      await readRoster();
      return true;
    } catch {
      return false;
    }
  }
  async function toggle(a: AdminAgentRow) {
    if (locks.current.has(a.id)) return;
    setLock(a.id, true);
    setNotice(null);
    const next = a.visibility_status === "visible" ? "admin_hidden" : "visible";
    try {
      const result = await post({
        action: "visibility",
        id: a.id,
        visibilityStatus: next,
      });
      if (!result.ok) throw new Error();
      onAgentsChange((prev) =>
        prev.map((row) =>
          row.id === a.id ? { ...row, visibility_status: next } : row,
        ),
      );
      toast.success(
        zh
          ? `${a.name || a.slug} 已${next === "visible" ? "公开" : "隐藏"}`
          : `${a.name || a.slug}: ${next === "visible" ? "visible" : "hidden"}`,
      );
    } catch {
      const verified = await reconcileFailure();
      setNotice({
        error: true,
        text: zh
          ? verified
            ? "请求未成功确认，已重新读取官网状态，请检查后再操作。"
            : "无法确认保存结果，请重新读取名册后再操作。"
          : verified
            ? "Request not confirmed. Website status has been reloaded; review before retrying."
            : "Could not confirm the result. Reload the roster before retrying.",
      });
    } finally {
      setLock(a.id, false);
    }
  }
  async function saveLink() {
    if (!linkTarget || !candidateId || locks.current.has(linkTarget.id)) return;
    const target = linkTarget;
    setLock(target.id, true);
    setNotice(null);
    try {
      const result = await post({
        action: "link",
        id: target.id,
        portalAgentId: candidateId,
      });
      const refreshed = await reconcileFailure();
      if (!result.ok) {
        setNotice({
          error: true,
          text: result.data.linked
            ? zh
              ? "账号已关联，但身份资料尚未同步完整。请核对关联账号资料后重新保存。"
              : "Account linked, but identity sync is incomplete. Review and save the linked account details."
            : zh
              ? "关联未确认；请检查最新名册后再试。"
              : "Link not confirmed; review the refreshed roster before retrying.",
        });
      } else {
        setNotice({
          error: !refreshed || !!result.data.notice,
          text: !refreshed
            ? zh
              ? "关联已保存，名册读取失败，请刷新核对。"
              : "Link saved; reload the roster to verify."
            : result.data.notice
              ? zh
                ? "关联已保存，官网返回了身份核验提示，请查看完整档案。"
                : "Link saved with an identity verification notice. Review the full profile."
              : zh
                ? "账号关联已保存。"
                : "Account link saved.",
        });
      }
      setLinkTarget(null);
    } catch {
      await reconcileFailure();
      setLinkTarget(null);
      setNotice({
        error: true,
        text: zh
          ? "关联结果暂未确认，请先核对名册再重试。"
          : "Link result unknown. Review the roster before retrying.",
      });
    } finally {
      setLock(target.id, false);
    }
  }
  async function merge() {
    if (
      !mergeTarget ||
      !keepProfile ||
      !mergeTarget.portal_agent_id ||
      locks.current.has(mergeTarget.id)
    )
      return;
    const target = mergeTarget;
    setLock(target.id, true);
    setNotice(null);
    try {
      const result = await post({
        action: "merge_link",
        keepProfileId: keepProfile.id,
        deleteProfileId: target.id,
        portalAgentId: target.portal_agent_id,
      });
      const refreshed = await reconcileFailure();
      setNotice({
        error: !result.ok || !refreshed || !!result.data.notice,
        text: !result.ok
          ? zh
            ? "合并结果未确认，请核对最新名册，勿直接重复提交。"
            : "Merge not confirmed. Review the latest roster before another attempt."
          : result.data.notice
            ? zh
              ? "重复主页已合并，身份资料同步仍需核对。"
              : "Profiles merged; identity synchronization needs review."
            : refreshed
              ? zh
                ? "重复主页已合并。"
                : "Duplicate profile merged."
              : zh
                ? "合并已保存，名册读取失败，请刷新核对。"
                : "Merge saved; reload the roster to verify.",
      });
    } catch {
      await reconcileFailure();
      setNotice({
        error: true,
        text: zh
          ? "合并结果暂未确认，请先重新读取名册。"
          : "Merge result unknown. Reload the roster first.",
      });
    } finally {
      setMergeTarget(null);
      setKeepId("");
      setLock(target.id, false);
    }
  }
  async function beginOrder() {
    setLock("reorder", true);
    setNotice(null);
    try {
      const rows = await readRoster();
      originalOrder.current = rows.map((a) => a.id);
      setOrder([...originalOrder.current]);
    } catch {
      setNotice({
        error: true,
        text: zh
          ? "无法读取完整顺序，请重试。"
          : "Could not load the complete order. Please retry.",
      });
    } finally {
      setLock("reorder", false);
    }
  }
  async function saveOrder() {
    if (!order || locks.current.has("reorder")) return;
    setLock("reorder", true);
    setNotice(null);
    try {
      const result = await post({ action: "reorder", ids: order });
      if (!result.ok) throw new Error();
      const refreshed = await reconcileFailure();
      setOrder(null);
      setNotice({
        error: !refreshed,
        text: refreshed
          ? zh
            ? "官网顺序已保存。"
            : "Website order saved."
          : zh
            ? "顺序已保存，暂时无法重新读取，请刷新核对。"
            : "Order saved; reload to verify the current roster.",
      });
    } catch {
      await reconcileFailure();
      setNotice({
        error: true,
        text: zh
          ? "排序未成功确认，草稿已保留。请核对官网当前状态；名册有增减时需取消并重新调整。"
          : "Order not confirmed; draft retained. Review website order. If profiles were added or removed, cancel and start again.",
      });
    } finally {
      setLock("reorder", false);
    }
  }
  useEffect(() => {
    if (!order) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [order]);
  const move = (from: number, to: number) =>
    setOrder((prev) => (prev ? moveListItem(prev, from, to) : prev));
  const profileId = params.get("profile");
  return (
    <div className="space-y-4">
      {notice && (
        <div
          className={`admin-notice ${notice.error ? "is-error" : ""}`}
          role={notice.error ? "alert" : "status"}
        >
          {notice.text}
        </div>
      )}
      {unreachable && (
        <div className="admin-notice is-error" role="alert">
          {zh ? "暂时无法读取官网名册。" : "Website roster unavailable."}{" "}
          <button className="underline" onClick={() => void onRetry()}>
            {zh ? "重试" : "Retry"}
          </button>
        </div>
      )}
      {order ? (
        <div className="roster-order-toolbar">
          <div>
            <strong>{zh ? "调整官网顺序" : "Arrange website order"}</strong>
            <p>
              {zh
                ? "完整名册（包含隐藏项）。拖动或输入目标位置，完成后统一保存。"
                : "Full roster, including hidden profiles. Drag or enter a position, then save."}
            </p>
          </div>
          <div className="flex gap-2">
            <button
              className="admin-control"
              disabled={busy.reorder}
              onClick={() => setOrder(null)}
            >
              {zh ? "取消" : "Cancel"}
            </button>
            <button
              className="admin-control primary"
              disabled={
                busy.reorder || order.join() === originalOrder.current.join()
              }
              onClick={() => void saveOrder()}
            >
              {busy.reorder
                ? zh
                  ? "保存中…"
                  : "Saving…"
                : zh
                  ? "保存顺序"
                  : "Save order"}
            </button>
          </div>
        </div>
      ) : (
        <>
          <div className="roster-toolbar">
            <label className="list-search">
              <Search size={16} aria-hidden />
              <input
                aria-label={zh ? "搜索官网名册" : "Search website roster"}
                placeholder={
                  zh
                    ? "搜索姓名、主页链接、关联邮箱、执照…"
                    : "Search name, slug, linked email, license…"
                }
                value={q}
                onChange={(e) => update({ q: e.target.value, page: null })}
              />
            </label>
            <select
              className="admin-control"
              aria-label={zh ? "官网显示" : "Website visibility"}
              value={visibility}
              onChange={(e) =>
                update({ visibility: e.target.value, page: null })
              }
            >
              {[
                ["", "全部显示状态", "All visibility"],
                ["visible", "公开", "Visible"],
                ["admin_hidden", "管理员隐藏", "Admin hidden"],
                ["agent_hidden", "经纪人隐藏", "Agent hidden"],
                ["unknown", "未设定", "Unset"],
              ].map(([id, cn, en]) => (
                <option key={id} value={id}>
                  {zh ? cn : en}
                </option>
              ))}
            </select>
            <button
              className="admin-control"
              disabled={loading || anyBusy || unreachable || !agents.length}
              onClick={() => void beginOrder()}
            >
              {zh ? "调整顺序" : "Arrange order"}
            </button>
          </div>
          <div
            className="list-filter-row"
            aria-label={zh ? "关联状态筛选" : "Account link filters"}
          >
            {[
              ["", zh ? "全部" : "All", agents.length],
              ["linked", zh ? "已关联" : "Linked", allCounts.linked],
              ["unlinked", zh ? "未关联" : "Unlinked", allCounts.unlinked],
              ["broken", zh ? "关联异常" : "Broken links", allCounts.broken],
            ].map(([id, text, count]) => (
              <button
                key={String(id)}
                className="list-filter"
                aria-pressed={linkFilter === id}
                onClick={() => update({ link: String(id), page: null })}
              >
                {text}
                <span>{loading && !agents.length ? "—" : count}</span>
              </button>
            ))}
          </div>
        </>
      )}
      {loading && !agents.length ? (
        <div
          className="list-skeleton"
          role="status"
          aria-label={zh ? "正在读取名册" : "Loading roster"}
        >
          {Array.from({ length: 7 }, (_, i) => (
            <div key={i} />
          ))}
        </div>
      ) : (
        <div className="agent-list-surface">
          <table
            className={`agent-table roster-table ${order ? "is-ordering" : ""}`}
          >
            <thead>
              <tr>
                <th>{zh ? "顺序" : "Order"}</th>
                <th>{zh ? "官网档案" : "Website profile"}</th>
                <th>{zh ? "关联账号" : "Linked account"}</th>
                <th>{zh ? "官网显示" : "Visibility"}</th>
                <th>
                  <span className="sr-only">{zh ? "操作" : "Actions"}</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {orderedRows.map((a, index) => (
                <tr
                  key={a.id}
                  draggable={!!order && !busy.reorder}
                  onDragStart={(e) => {
                    if (!order) return;
                    setDragging(a.id);
                    e.dataTransfer.setData("text/plain", a.id);
                  }}
                  onDragOver={(e) => {
                    if (order && dragging) e.preventDefault();
                  }}
                  onDrop={(e) => {
                    e.preventDefault();
                    if (order && dragging) move(order.indexOf(dragging), index);
                    setDragging(null);
                  }}
                  onDragEnd={() => setDragging(null)}
                >
                  <td className="roster-position">
                    {order ? (
                      <GripVertical size={16} aria-hidden />
                    ) : (
                      <span className="tabular-nums">
                        {agents.findIndex((row) => row.id === a.id) + 1}
                      </span>
                    )}
                  </td>
                  <td className="roster-identity">
                    <div className="flex min-w-0 items-center gap-3">
                      <div className="roster-avatar">
                        {a.photo_url ? (
                          <Image
                            src={a.photo_url}
                            alt=""
                            width={38}
                            height={42}
                            unoptimized
                          />
                        ) : (
                          (a.name || a.slug).slice(0, 2).toUpperCase()
                        )}
                      </div>
                      <div className="min-w-0">
                        <button
                          className="font-medium text-left break-words"
                          disabled={!!order}
                          onClick={() => update({ profile: a.id }, true)}
                        >
                          {a.name || a.slug}
                        </button>
                        <a
                          className="secondary block"
                          href={`${WEB}${encodeURIComponent(a.slug)}`}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          /{a.slug} ↗
                        </a>
                      </div>
                    </div>
                  </td>
                  <td className="roster-account">
                    {a.linked_portal_agent ? (
                      <>
                        <Link
                          className="block truncate"
                          href={`/admin/agents/${a.linked_portal_agent.id}?returnTo=${encodeURIComponent(href)}`}
                        >
                          {a.linked_portal_agent.name}
                        </Link>
                        <div className="secondary break-all">
                          {a.linked_portal_agent.email}
                        </div>
                        {a.linked_portal_agent.account_status !== "active" && (
                          <span className="text-xs text-amber-800">
                            {zh ? "关联账号未启用" : "Linked account inactive"}
                          </span>
                        )}
                      </>
                    ) : a.portal_agent_id != null ? (
                      <span className="text-xs text-amber-800">
                        {zh ? "关联异常" : "Broken link"} · #{a.portal_agent_id}
                      </span>
                    ) : (
                      <button
                        className="row-action"
                        disabled={portalUnavailable || !!order}
                        onClick={() => {
                          setLinkTarget(a);
                          setCandidateId(null);
                          setCandidateQuery("");
                        }}
                      >
                        {zh ? "关联账号" : "Link account"}
                      </button>
                    )}
                  </td>
                  <td className="roster-visibility">
                    <button
                      role="switch"
                      aria-checked={a.visibility_status === "visible"}
                      aria-label={`${a.name || a.slug} · ${zh ? "官网显示" : "Website visibility"}`}
                      className="visibility-control"
                      disabled={!!order || busy[a.id] || unreachable}
                      onClick={() => void toggle(a)}
                    >
                      <span
                        className={`visibility-track ${a.visibility_status === "visible" ? "is-on" : ""}`}
                      />
                      <span>{label(a)}</span>
                    </button>
                  </td>
                  <td className="roster-actions">
                    {order ? (
                      <div className="order-controls">
                        <label>
                          <span className="sr-only">
                            {zh
                              ? `${a.name} 移到第几位`
                              : `Position for ${a.name}`}
                          </span>
                          <input
                            key={`${a.id}-${index}`}
                            className="admin-control order-position"
                            type="number"
                            min={1}
                            max={order.length}
                            defaultValue={index + 1}
                            disabled={busy.reorder}
                            onBlur={(e) => {
                              const n = Number(e.target.value);
                              if (
                                Number.isInteger(n) &&
                                n >= 1 &&
                                n <= order.length
                              )
                                move(index, n - 1);
                              else e.target.value = String(index + 1);
                            }}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") e.currentTarget.blur();
                            }}
                          />
                        </label>
                        <button
                          className="row-action"
                          aria-label={
                            zh ? `${a.name} 置顶` : `Move ${a.name} to top`
                          }
                          disabled={index === 0 || busy.reorder}
                          onClick={() => move(index, 0)}
                        >
                          <ArrowUp size={16} />
                        </button>
                        <button
                          className="row-action"
                          aria-label={
                            zh ? `${a.name} 置底` : `Move ${a.name} to bottom`
                          }
                          disabled={index === order.length - 1 || busy.reorder}
                          onClick={() => move(index, order.length - 1)}
                        >
                          <ArrowDown size={16} />
                        </button>
                      </div>
                    ) : (
                      <div className="flex justify-end gap-1">
                        <button
                          className="row-action"
                          disabled={busy[a.id]}
                          onClick={() => update({ profile: a.id }, true)}
                        >
                          {zh ? "编辑" : "Edit"}
                        </button>
                        {a.portal_agent_id != null &&
                          a.linked_portal_agent?.account_status ===
                            "active" && (
                            <details className="row-menu">
                              <summary
                                aria-label={`${a.name} · ${zh ? "更多操作" : "More actions"}`}
                              >
                                <MoreHorizontal size={18} />
                              </summary>
                              <button
                                className="admin-control"
                                disabled={anyBusy || portalUnavailable}
                                onClick={(e) => {
                                  e.currentTarget
                                    .closest("details")
                                    ?.removeAttribute("open");
                                  setMergeTarget(a);
                                  setKeepId("");
                                }}
                              >
                                {zh
                                  ? "合并重复主页"
                                  : "Merge duplicate profile"}
                              </button>
                            </details>
                          )}
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!orderedRows.length && !unreachable && (
            <div className="admin-empty">
              <p>
                {zh ? "没有匹配的官网档案。" : "No matching website profiles."}
              </p>
              {!!agents.length && (
                <button
                  className="admin-control mt-3"
                  onClick={() =>
                    update({
                      q: null,
                      visibility: null,
                      link: null,
                      page: null,
                    })
                  }
                >
                  {zh ? "清除筛选" : "Clear filters"}
                </button>
              )}
            </div>
          )}
          {!order && (
            <ListPagination
              total={filtered.length}
              {...pagination}
              size={
                params.get("size") === "all"
                  ? "all"
                  : params.get("size") === "50"
                    ? "50"
                    : "25"
              }
              onChange={update}
            />
          )}
        </div>
      )}
      {order && (
        <p className="text-xs text-ink-50">
          {zh
            ? "排序期间请避免多人同时调整；官网暂不支持版本冲突校验。"
            : "Avoid simultaneous reordering; the website does not yet support order version checks."}
        </p>
      )}
      {profileId && (
        <ProfilePanel
          key={profileId}
          id={profileId}
          returnTo={returnTo}
          onClose={() => update({ profile: null })}
          onSaved={() => {
            update({ profile: null });
            toast.success(zh ? "官网资料已保存" : "Website profile saved");
            void readRoster().catch(() =>
              setNotice({
                error: true,
                text: zh
                  ? "资料已保存，名单读取失败，请重试。"
                  : "Profile saved; retry loading the roster.",
              }),
            );
          }}
        />
      )}
      {linkTarget && (
        <EditPanel
          title={zh ? "关联 Portal 账号" : "Link Portal account"}
          description={linkTarget.name || linkTarget.slug}
          onClose={() => setLinkTarget(null)}
          saving={busy[linkTarget.id]}
          footer={
            <button
              className="admin-control primary"
              disabled={
                !candidateId || busy[linkTarget.id] || portalUnavailable
              }
              onClick={() => void saveLink()}
            >
              {zh ? "确认关联" : "Confirm link"}
            </button>
          }
        >
          <p className="mb-4 text-sm text-ink-70">
            {zh
              ? "关联后，姓名、电话与执照将从该账号同步到官网；该账号可自助编辑主页。"
              : "Name, phone and license will sync from this account. The agent can then edit their website profile."}
          </p>
          <input
            className="admin-control mb-3 w-full"
            aria-label={zh ? "搜索可关联账号" : "Search available accounts"}
            placeholder={
              zh
                ? "搜索姓名、邮箱或账号 ID"
                : "Search name, email or account ID"
            }
            value={candidateQuery}
            onChange={(e) => setCandidateQuery(e.target.value)}
          />
          <div className="candidate-list">
            {candidates.map((a) => (
              <label key={a.id} className="candidate-row">
                <input
                  type="radio"
                  name="portal-account"
                  value={a.id}
                  checked={candidateId === a.id}
                  onChange={() => setCandidateId(a.id)}
                />
                <span>
                  <strong>{a.name}</strong>
                  <span className="block text-xs text-ink-50 break-all">
                    {a.email} · #{a.id}
                  </span>
                </span>
              </label>
            ))}
          </div>
          {!candidates.length && (
            <p className="admin-empty">
              {zh
                ? "没有匹配的在职、未关联账号。"
                : "No matching active, unlinked accounts."}
            </p>
          )}
          {selectedCandidate && (
            <p className="mt-4 text-sm">
              {zh ? "将关联：" : "Selected: "}
              {selectedCandidate.name} · {selectedCandidate.email}
            </p>
          )}
        </EditPanel>
      )}
      {mergeTarget && (
        <EditPanel
          title={zh ? "合并重复主页" : "Merge duplicate profiles"}
          saving={busy[mergeTarget.id]}
          onClose={() => setMergeTarget(null)}
          footer={
            <button
              className="admin-control danger"
              disabled={!keepProfile || busy[mergeTarget.id]}
              onClick={() => void merge()}
            >
              {zh ? "合并并删除重复主页" : "Merge and delete duplicate"}
            </button>
          }
        >
          <p className="mb-5 text-sm leading-6">
            {zh
              ? "保留所选主页的链接、顺序、显示状态与已有资料；空白项可由重复主页补齐。重复主页将永久删除，此操作无法撤销。"
              : "Keep the selected profile’s URL, order, visibility and existing content. Empty fields may be filled from the duplicate. The duplicate is permanently deleted; this cannot be undone."}
          </p>
          <label className="block text-sm">
            {zh
              ? "选择保留的未关联主页"
              : "Choose the unlinked profile to keep"}
            <select
              className="admin-control mt-2 w-full"
              value={keepId}
              onChange={(e) => setKeepId(e.target.value)}
            >
              <option value="">{zh ? "请选择" : "Select profile"}</option>
              {agents
                .filter((a) => a.portal_agent_id == null)
                .map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name} · /{a.slug}
                  </option>
                ))}
            </select>
          </label>
          <div className="merge-comparison">
            <section>
              <h3>{zh ? "保留" : "Keep"}</h3>
              <strong>{keepProfile?.name || "—"}</strong>
              <p>/{keepProfile?.slug || "—"}</p>
              <p>{keepProfile ? label(keepProfile) : ""}</p>
            </section>
            <section>
              <h3>{zh ? "永久删除" : "Permanently delete"}</h3>
              <strong>{mergeTarget.name}</strong>
              <p>/{mergeTarget.slug}</p>
              <p>{mergeTarget.linked_portal_agent?.email}</p>
            </section>
          </div>
          <p className="text-sm">
            {zh ? "关联账号保持为：" : "Account remains: "}
            {mergeTarget.linked_portal_agent?.name} · #
            {mergeTarget.portal_agent_id}
          </p>
        </EditPanel>
      )}
    </div>
  );
}
