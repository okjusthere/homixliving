"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Btn, Card } from "@/components/homix/primitives";
import { CardHeader } from "@/components/homix/page-kit";
import { tone } from "@/components/homix/tokens";
import type { AdminAgentRow } from "@/lib/homixweb";
import { useLocale } from "@/lib/i18n-client";

const WEB = "https://www.homixny.com";

type PortalRosterCandidate = {
  id: number;
  name: string;
  email: string;
};

type MergeDraft = {
  duplicate: AdminAgentRow;
  keepProfileId: string;
};

const M = {
  en: {
    unreachable: "The public website is temporarily unavailable. Try again later. If this continues, verify HOMIXWEB_REVALIDATE_URL and AGENTS_REVALIDATE_SECRET.",
    operationFailed: "Operation failed",
    visibilitySaved: (name: string, visible: boolean) => `${name} is now ${visible ? "visible" : "hidden by an administrator"}.`,
    reorderFailed: "Unable to save the new order.",
    choosePortalAgent: "Select a Portal agent to link.",
    linkFailed: "Unable to link the profile.",
    linked: (profile: string, agent: string) => `${profile} is now linked to ${agent}.`,
    chooseKeep: "Select the website profile to keep.",
    portalAgentMissing: "The linked Portal agent is no longer on the active roster.",
    mergeFailed: "Unable to replace the linked profile.",
    merged: (keep: string, deleted: string, agent: string) => `Kept /${keep}, deleted duplicate /${deleted}, and linked the profile to ${agent}.`,
    title: (count: number) => `Advisors (${count})`,
    subtitle: "Manage website visibility, order, account links, and public profiles in one place.",
    moveUp: "Move up",
    moveDown: "Move down",
    unnamed: "(unnamed)",
    linkedTitle: "Linked to a Portal account and available for self-service editing",
    linkedBadge: "Linked",
    agentHiddenTitle: "Hidden by the advisor; click to make it visible again",
    visibilityTitle: "Change website visibility",
    visible: "Visible",
    agentHidden: "Advisor hidden",
    adminHidden: "Admin hidden",
    linkAria: (name: string) => `Link ${name} to a Portal agent`,
    selectPortalAgent: "Select Portal agent",
    link: "Link",
    replace: "Replace linked profile",
    edit: "Edit",
    loading: "Loading website roster…",
    empty: "The roster is empty.",
    websiteRoster: "Website roster",
    replaceTitle: "Replace linked profile",
    close: "Close",
    chooseExisting: "Select the existing profile to keep",
    selectUnlinked: "Select an unlinked profile",
    keepWhich: "Profile to keep",
    deleteWhich: "Duplicate profile to delete",
    notSelected: "Not selected",
    mergeBody: "The selected profile keeps its URL, order, visibility, and existing content. Empty fields may be filled from the duplicate, which is then permanently deleted.",
    cancel: "Cancel",
    replacing: "Replacing…",
    confirmReplace: "Replace link and delete duplicate",
  },
  zh: {
    unreachable: "暂时无法连接对外网站（www.homixny.com）。请稍后重试；如持续失败，请检查 HOMIXWEB_REVALIDATE_URL 与 AGENTS_REVALIDATE_SECRET。",
    operationFailed: "操作失败",
    visibilitySaved: (name: string, visible: boolean) => `${name} 已${visible ? "在官网显示" : "由管理员隐藏"}。`,
    reorderFailed: "排序保存失败。",
    choosePortalAgent: "请选择要关联的 Portal 经纪人。",
    linkFailed: "关联失败。",
    linked: (profile: string, agent: string) => `${profile} 已关联到 ${agent}。`,
    chooseKeep: "请选择要保留的官网主页。",
    portalAgentMissing: "关联的 Portal 经纪人已不在当前在职名册中。",
    mergeFailed: "更换关联主页失败。",
    merged: (keep: string, deleted: string, agent: string) => `已保留 /${keep}，删除重复主页 /${deleted}，并改绑到 ${agent}。`,
    title: (count: number) => `经纪人（${count}）`,
    subtitle: "在同一处管理官网显示状态、顺序、账号关联与公开资料。",
    moveUp: "上移",
    moveDown: "下移",
    unnamed: "（未命名）",
    linkedTitle: "已关联 Portal 账号，可自助编辑",
    linkedBadge: "已关联",
    agentHiddenTitle: "经纪人自行隐藏；点击可由管理员重新显示",
    visibilityTitle: "切换官网显示状态",
    visible: "公开",
    agentHidden: "经纪人隐藏",
    adminHidden: "管理员隐藏",
    linkAria: (name: string) => `将 ${name} 关联到 Portal 经纪人`,
    selectPortalAgent: "选择 Portal 经纪人",
    link: "关联",
    replace: "更换关联主页",
    edit: "编辑",
    loading: "正在读取官网名册…",
    empty: "名册为空。",
    websiteRoster: "官网名册",
    replaceTitle: "更换关联主页",
    close: "关闭",
    chooseExisting: "选择要保留的既有主页",
    selectUnlinked: "请选择未关联主页",
    keepWhich: "保留哪个主页",
    deleteWhich: "删除哪个重复主页",
    notSelected: "尚未选择",
    mergeBody: "系统会保留所选主页的链接、排序、显示状态和已有内容，仅用重复主页补齐空白资料；随后永久删除重复主页。",
    cancel: "取消",
    replacing: "正在更换…",
    confirmReplace: "确认更换并删除重复主页",
  },
} as const;

export function RosterConsole({
  initialAgents,
  portalAgents,
  unreachable,
  loading = false,
  onAgentsChange,
}: {
  initialAgents: AdminAgentRow[];
  portalAgents: PortalRosterCandidate[];
  unreachable: boolean;
  loading?: boolean;
  onAgentsChange?: (agents: AdminAgentRow[]) => void;
}) {
  const router = useRouter();
  const locale = useLocale();
  const t = M[locale];
  const [agents, setAgents] = useState<AdminAgentRow[]>(initialAgents);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [selectedLinks, setSelectedLinks] = useState<Record<string, string>>({});
  const [mergeDraft, setMergeDraft] = useState<MergeDraft | null>(null);

  useEffect(() => {
    setAgents(initialAgents);
  }, [initialAgents]);
  const availablePortalAgents = useMemo(() => {
    const linkedIds = new Set(
      agents
        .map((agent) => agent.portal_agent_id)
        .filter((id): id is number => id != null),
    );
    return portalAgents.filter((agent) => !linkedIds.has(agent.id));
  }, [agents, portalAgents]);
  const unlinkedPublicProfiles = useMemo(
    () => agents.filter((agent) => agent.portal_agent_id == null),
    [agents],
  );
  const keepProfile = mergeDraft
    ? agents.find((agent) => agent.id === mergeDraft.keepProfileId) ?? null
    : null;

  if (unreachable) {
    return (
      <Card className="p-6">
        <p className="text-[13.5px]" style={{ color: tone.rose }}>
          {t.unreachable}
        </p>
      </Card>
    );
  }

  type RosterResp = {
    ok?: boolean;
    error?: string;
    id?: string;
    portalAgentId?: number;
    notice?: string;
    kept?: { id: string; slug: string; name: string | null };
    deleted?: { id: string; slug: string; name: string | null };
  };
  async function post(body: Record<string, unknown>): Promise<{ ok: boolean; out: RosterResp }> {
    const res = await fetch("/api/admin/roster", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    const out: RosterResp = await res.json().catch(() => ({}));
    return { ok: res.ok && !!out?.ok, out };
  }

  async function toggleVisible(a: AdminAgentRow) {
    setBusy(a.id);
    setMsg(null);
    const next: "visible" | "admin_hidden" =
      a.visibility_status === "visible" ? "admin_hidden" : "visible";
    const { ok } = await post({
      action: "visibility",
      id: a.id,
      visibilityStatus: next,
    });
    setBusy(null);
    if (!ok) return setMsg({ ok: false, text: t.operationFailed });
    setAgents((prev) => {
      const updated = prev.map((x) =>
        x.id === a.id ? { ...x, visibility_status: next } : x,
      );
      onAgentsChange?.(updated);
      return updated;
    });
    setMsg({ ok: true, text: t.visibilitySaved(a.name || a.slug, next === "visible") });
  }

  async function move(idx: number, dir: -1 | 1) {
    const j = idx + dir;
    if (j < 0 || j >= agents.length) return;
    const prev = agents;
    const next = agents.slice();
    [next[idx], next[j]] = [next[j], next[idx]];
    setAgents(next);
    onAgentsChange?.(next);
    setBusy("reorder");
    setMsg(null);
    const { ok } = await post({ action: "reorder", ids: next.map((x) => x.id) });
    setBusy(null);
    if (!ok) {
      setAgents(prev); // revert on failure
      onAgentsChange?.(prev);
      setMsg({ ok: false, text: t.reorderFailed });
    }
  }

  async function linkProfile(a: AdminAgentRow) {
    const portalAgentId = Number(selectedLinks[a.id]);
    const portalAgent = availablePortalAgents.find(
      (candidate) => candidate.id === portalAgentId,
    );
    if (!portalAgent) {
      setMsg({ ok: false, text: t.choosePortalAgent });
      return;
    }

    setBusy(`link:${a.id}`);
    setMsg(null);
    const { ok } = await post({
      action: "link",
      id: a.id,
      portalAgentId,
    });
    setBusy(null);
    if (!ok) {
      setMsg({ ok: false, text: t.linkFailed });
      return;
    }
    setAgents((prev) => {
      const updated = prev.map((agent) =>
        agent.id === a.id
          ? {
              ...agent,
              name: portalAgent.name,
              portal_agent_id: portalAgentId,
            }
          : agent,
      );
      onAgentsChange?.(updated);
      return updated;
    });
    setSelectedLinks((prev) => {
      const next = { ...prev };
      delete next[a.id];
      return next;
    });
    setMsg({
      ok: true,
      text: t.linked(a.name || a.slug, portalAgent.name),
    });
  }

  async function replaceLinkedProfile() {
    if (!mergeDraft || !keepProfile || mergeDraft.duplicate.portal_agent_id == null) {
      setMsg({ ok: false, text: t.chooseKeep });
      return;
    }
    const portalAgentId = mergeDraft.duplicate.portal_agent_id;
    const portalAgent = portalAgents.find((candidate) => candidate.id === portalAgentId);
    if (!portalAgent) {
      setMsg({ ok: false, text: t.portalAgentMissing });
      return;
    }

    setBusy(`merge:${mergeDraft.duplicate.id}`);
    setMsg(null);
    const { ok } = await post({
      action: "merge_link",
      portalAgentId,
      keepProfileId: keepProfile.id,
      deleteProfileId: mergeDraft.duplicate.id,
    });
    setBusy(null);
    if (!ok) {
      setMsg({ ok: false, text: t.mergeFailed });
      return;
    }

    setAgents((prev) => {
      const updated = prev
        .filter((agent) => agent.id !== mergeDraft.duplicate.id)
        .map((agent) =>
          agent.id === keepProfile.id
            ? { ...agent, name: portalAgent.name, portal_agent_id: portalAgentId }
            : agent,
        );
      onAgentsChange?.(updated);
      return updated;
    });
    setMergeDraft(null);
    setMsg({
      ok: true,
      text: t.merged(keepProfile.slug, mergeDraft.duplicate.slug, portalAgent.name),
    });
  }

  return (
    <div className="space-y-5">
      {msg && (
        <div className="text-[12.5px]" style={{ color: msg.ok ? tone.green : tone.rose }}>
          {msg.text}
        </div>
      )}

      {/* Roster */}
      <Card className="flex flex-col">
        <CardHeader
          title={t.title(agents.length)}
          subtitle={t.subtitle}
        />
        <div className="divide-y" style={{ borderColor: tone.line }}>
          {agents.map((a, idx) => (
            <div key={a.id} className="flex flex-wrap items-center gap-3 px-5 py-3">
              {/* Order controls */}
              <div className="flex flex-col">
                <button
                  type="button"
                  onClick={() => move(idx, -1)}
                  disabled={idx === 0 || busy !== null}
                  className="text-[11px] leading-none disabled:opacity-30"
                  style={{ color: tone.ink50 }}
                  aria-label={t.moveUp}
                >
                  ▲
                </button>
                <button
                  type="button"
                  onClick={() => move(idx, 1)}
                  disabled={idx === agents.length - 1 || busy !== null}
                  className="mt-1 text-[11px] leading-none disabled:opacity-30"
                  style={{ color: tone.ink50 }}
                  aria-label={t.moveDown}
                >
                  ▼
                </button>
              </div>

              {/* Identity */}
              <div className="min-w-[180px] flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-[13.5px]" style={{ color: tone.ink }}>
                    {a.name || t.unnamed}
                  </span>
                  {a.portal_agent_id != null && (
                    <span
                      className="rounded px-1.5 py-0.5 text-[10.5px]"
                      style={{ background: "#EEF3E6", color: "#5C6B3A" }}
                      title={t.linkedTitle}
                    >
                      {t.linkedBadge}
                    </span>
                  )}
                </div>
                <a
                  href={`${WEB}/agents/${a.slug}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[12px]"
                  style={{ color: tone.ink50 }}
                >
                  /{a.slug} ↗
                </a>
              </div>

              {/* Visibility state */}
              <button
                type="button"
                onClick={() => toggleVisible(a)}
                disabled={busy !== null}
                className="rounded-full px-2.5 py-1 text-[11.5px]"
                style={
                  a.visibility_status === "visible"
                    ? { background: "#EEF3E6", color: "#5C6B3A" }
                    : { background: "#F3F0EA", color: tone.ink50 }
                }
                title={
                  a.visibility_status === "agent_hidden"
                    ? t.agentHiddenTitle
                    : t.visibilityTitle
                }
              >
                {a.visibility_status === "visible"
                  ? `● ${t.visible}`
                  : a.visibility_status === "agent_hidden"
                    ? `○ ${t.agentHidden}`
                    : `○ ${t.adminHidden}`}
              </button>

              {/* Actions */}
              <div className="flex flex-wrap items-center justify-end gap-2">
                {a.portal_agent_id == null && availablePortalAgents.length > 0 && (
                  <>
                    <select
                      aria-label={t.linkAria(a.name || a.slug)}
                      value={selectedLinks[a.id] || ""}
                      onChange={(event) =>
                        setSelectedLinks((prev) => ({
                          ...prev,
                          [a.id]: event.target.value,
                        }))
                      }
                      disabled={busy !== null}
                      className="h-9 max-w-[230px] rounded border bg-white px-2 text-[12px] disabled:opacity-50"
                      style={{ borderColor: tone.line, color: tone.ink }}
                    >
                      <option value="">{t.selectPortalAgent}</option>
                      {availablePortalAgents.map((agent) => (
                        <option key={agent.id} value={agent.id}>
                          {agent.name} · {agent.email}
                        </option>
                      ))}
                    </select>
                    <Btn
                      variant="outline"
                      onClick={() => void linkProfile(a)}
                      disabled={busy !== null || !selectedLinks[a.id]}
                    >
                      {t.link}
                    </Btn>
                  </>
                )}
                {a.portal_agent_id != null && unlinkedPublicProfiles.length > 0 && (
                  <Btn
                    variant="outline"
                    onClick={() => setMergeDraft({ duplicate: a, keepProfileId: "" })}
                    disabled={busy !== null}
                  >
                    {t.replace}
                  </Btn>
                )}
                <Btn variant="outline" onClick={() => router.push(`/roster/${a.id}`)}>
                  {t.edit}
                </Btn>
              </div>
            </div>
          ))}
          {loading && agents.length === 0 && (
            <div className="px-5 py-8 text-center text-[13px]" style={{ color: tone.ink50 }}>
              {t.loading}
            </div>
          )}
          {!loading && agents.length === 0 && (
            <div className="px-5 py-8 text-center text-[13px]" style={{ color: tone.ink50 }}>
              {t.empty}
            </div>
          )}
        </div>
      </Card>

      {mergeDraft && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-8"
          style={{ background: "rgba(26, 24, 20, 0.48)", backdropFilter: "blur(4px)" }}
          onClick={() => busy === null && setMergeDraft(null)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="replace-profile-title"
            className="flex max-h-[90vh] w-full max-w-xl flex-col overflow-hidden rounded-2xl"
            style={{
              background: tone.card,
              border: `1px solid ${tone.line}`,
              boxShadow: "0 30px 80px -20px rgba(0,0,0,0.35)",
            }}
            onClick={(event) => event.stopPropagation()}
          >
            <div
              className="flex items-start justify-between gap-4 px-5 py-5 sm:px-7 sm:py-6"
              style={{ borderBottom: `1px solid ${tone.line}` }}
            >
              <div>
                <div className="text-[11px] uppercase tracking-[0.14em]" style={{ color: tone.ink50 }}>
                  {t.websiteRoster}
                </div>
                <h2
                  id="replace-profile-title"
                  className="mt-1 font-serif text-[26px] leading-tight"
                  style={{ color: tone.ink }}
                >
                  {t.replaceTitle}
                </h2>
              </div>
              <button
                type="button"
                aria-label={t.close}
                onClick={() => setMergeDraft(null)}
                disabled={busy !== null}
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-lg disabled:opacity-50 sm:h-8 sm:w-8"
                style={{ background: tone.paperDeep, color: tone.ink70 }}
              >
                ×
              </button>
            </div>

            <div className="flex-1 space-y-5 overflow-auto px-5 py-5 sm:px-7 sm:py-6">
              <label className="block">
                <span className="text-[11px] uppercase tracking-[0.1em]" style={{ color: tone.ink50 }}>
                  {t.chooseExisting}
                </span>
                <select
                  value={mergeDraft.keepProfileId}
                  onChange={(event) =>
                    setMergeDraft((current) =>
                      current ? { ...current, keepProfileId: event.target.value } : current,
                    )
                  }
                  disabled={busy !== null}
                  className="mt-2 h-11 w-full rounded-lg border bg-white px-3 text-[13px] outline-none disabled:opacity-50"
                  style={{ borderColor: tone.line, color: tone.ink }}
                >
                  <option value="">{t.selectUnlinked}</option>
                  {unlinkedPublicProfiles.map((profile) => (
                    <option key={profile.id} value={profile.id}>
                      {profile.name || profile.slug} · /{profile.slug}
                    </option>
                  ))}
                </select>
              </label>

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-lg border px-4 py-3" style={{ borderColor: tone.line }}>
                  <div className="text-[10.5px] uppercase tracking-[0.1em]" style={{ color: tone.green }}>
                    {t.keepWhich}
                  </div>
                  <div className="mt-2 text-[13.5px] font-medium" style={{ color: tone.ink }}>
                    {keepProfile?.name || t.notSelected}
                  </div>
                  <div className="mt-1 break-all font-mono text-[11.5px]" style={{ color: tone.ink50 }}>
                    {keepProfile ? `/${keepProfile.slug}` : "—"}
                  </div>
                </div>
                <div className="rounded-lg border px-4 py-3" style={{ borderColor: tone.roseSoft }}>
                  <div className="text-[10.5px] uppercase tracking-[0.1em]" style={{ color: tone.rose }}>
                    {t.deleteWhich}
                  </div>
                  <div className="mt-2 text-[13.5px] font-medium" style={{ color: tone.ink }}>
                    {mergeDraft.duplicate.name || mergeDraft.duplicate.slug}
                  </div>
                  <div className="mt-1 break-all font-mono text-[11.5px]" style={{ color: tone.ink50 }}>
                    /{mergeDraft.duplicate.slug}
                  </div>
                </div>
              </div>

              <p className="text-[12.5px] leading-relaxed" style={{ color: tone.ink50 }}>
                {t.mergeBody}
              </p>
            </div>

            <div
              className="flex flex-col-reverse gap-2 px-5 py-4 sm:flex-row sm:justify-end sm:px-7"
              style={{ borderTop: `1px solid ${tone.line}`, background: tone.paper }}
            >
              <Btn variant="outline" onClick={() => setMergeDraft(null)} disabled={busy !== null}>
                {t.cancel}
              </Btn>
              <Btn
                variant="danger"
                onClick={() => void replaceLinkedProfile()}
                disabled={busy !== null || !keepProfile}
              >
                {busy?.startsWith("merge:") ? t.replacing : t.confirmReplace}
              </Btn>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
