"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Btn, Card } from "@/components/homix/primitives";
import { CardHeader } from "@/components/homix/page-kit";
import { tone } from "@/components/homix/tokens";
import type { AdminAgentRow } from "@/lib/homixweb";

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
          暂时无法连接对外网站(www.homixny.com)。稍后重试;若持续,检查
          HOMIXWEB_REVALIDATE_URL / AGENTS_REVALIDATE_SECRET 是否已配置。
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
    const { ok, out } = await post({
      action: "visibility",
      id: a.id,
      visibilityStatus: next,
    });
    setBusy(null);
    if (!ok) return setMsg({ ok: false, text: out?.error || "操作失败" });
    setAgents((prev) => {
      const updated = prev.map((x) =>
        x.id === a.id ? { ...x, visibility_status: next } : x,
      );
      onAgentsChange?.(updated);
      return updated;
    });
    setMsg({ ok: true, text: `${a.name} 已${next === "visible" ? "显示" : "由管理员隐藏"}` });
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
    const { ok, out } = await post({ action: "reorder", ids: next.map((x) => x.id) });
    setBusy(null);
    if (!ok) {
      setAgents(prev); // revert on failure
      onAgentsChange?.(prev);
      setMsg({ ok: false, text: out?.error || "排序失败" });
    }
  }

  async function linkProfile(a: AdminAgentRow) {
    const portalAgentId = Number(selectedLinks[a.id]);
    const portalAgent = availablePortalAgents.find(
      (candidate) => candidate.id === portalAgentId,
    );
    if (!portalAgent) {
      setMsg({ ok: false, text: "请选择要关联的 Portal 经纪人。" });
      return;
    }

    setBusy(`link:${a.id}`);
    setMsg(null);
    const { ok, out } = await post({
      action: "link",
      id: a.id,
      portalAgentId,
    });
    setBusy(null);
    if (!ok) {
      setMsg({ ok: false, text: out.error || "关联失败" });
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
      text: `${a.name} 已关联到 ${portalAgent.name}。${out.notice || ""}`.trim(),
    });
  }

  async function replaceLinkedProfile() {
    if (!mergeDraft || !keepProfile || mergeDraft.duplicate.portal_agent_id == null) {
      setMsg({ ok: false, text: "请选择要保留的官网主页。" });
      return;
    }
    const portalAgentId = mergeDraft.duplicate.portal_agent_id;
    const portalAgent = portalAgents.find((candidate) => candidate.id === portalAgentId);
    if (!portalAgent) {
      setMsg({ ok: false, text: "关联的 Portal 经纪人已不在当前在职名册中。" });
      return;
    }

    setBusy(`merge:${mergeDraft.duplicate.id}`);
    setMsg(null);
    const { ok, out } = await post({
      action: "merge_link",
      portalAgentId,
      keepProfileId: keepProfile.id,
      deleteProfileId: mergeDraft.duplicate.id,
    });
    setBusy(null);
    if (!ok) {
      setMsg({ ok: false, text: out.error || "更换关联主页失败" });
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
      text: `已保留 /${keepProfile.slug}，删除重复主页 /${mergeDraft.duplicate.slug}，并改绑到 ${portalAgent.name}。${out.notice || ""}`.trim(),
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
          title={`经纪人（${agents.length}）`}
          subtitle="在同一处管理官网显示状态、顺序、账号关联与公开资料"
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
                  aria-label="上移"
                >
                  ▲
                </button>
                <button
                  type="button"
                  onClick={() => move(idx, 1)}
                  disabled={idx === agents.length - 1 || busy !== null}
                  className="mt-1 text-[11px] leading-none disabled:opacity-30"
                  style={{ color: tone.ink50 }}
                  aria-label="下移"
                >
                  ▼
                </button>
              </div>

              {/* Identity */}
              <div className="min-w-[180px] flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-[13.5px]" style={{ color: tone.ink }}>
                    {a.name || "(未命名)"}
                  </span>
                  {a.portal_agent_id != null && (
                    <span
                      className="rounded px-1.5 py-0.5 text-[10.5px]"
                      style={{ background: "#EEF3E6", color: "#5C6B3A" }}
                      title="已关联 portal 账号,可自助编辑"
                    >
                      已关联
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
                    ? "经纪人自行隐藏；点击可由管理员重新显示"
                    : "点击切换官网显示状态"
                }
              >
                {a.visibility_status === "visible"
                  ? "● 公开"
                  : a.visibility_status === "agent_hidden"
                    ? "○ 经纪人隐藏"
                    : "○ 管理员隐藏"}
              </button>

              {/* Actions */}
              <div className="flex flex-wrap items-center justify-end gap-2">
                {a.portal_agent_id == null && availablePortalAgents.length > 0 && (
                  <>
                    <select
                      aria-label={`关联 ${a.name || a.slug} 到 Portal 经纪人`}
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
                      <option value="">选择 Portal 经纪人</option>
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
                      关联
                    </Btn>
                  </>
                )}
                {a.portal_agent_id != null && unlinkedPublicProfiles.length > 0 && (
                  <Btn
                    variant="outline"
                    onClick={() => setMergeDraft({ duplicate: a, keepProfileId: "" })}
                    disabled={busy !== null}
                  >
                    更换关联主页
                  </Btn>
                )}
                <Btn variant="outline" onClick={() => router.push(`/roster/${a.id}`)}>
                  编辑
                </Btn>
              </div>
            </div>
          ))}
          {loading && agents.length === 0 && (
            <div className="px-5 py-8 text-center text-[13px]" style={{ color: tone.ink50 }}>
              正在读取官网名册…
            </div>
          )}
          {!loading && agents.length === 0 && (
            <div className="px-5 py-8 text-center text-[13px]" style={{ color: tone.ink50 }}>
              名册为空。
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
                  官网名册
                </div>
                <h2
                  id="replace-profile-title"
                  className="mt-1 font-serif text-[26px] leading-tight"
                  style={{ color: tone.ink }}
                >
                  更换关联主页
                </h2>
              </div>
              <button
                type="button"
                aria-label="关闭"
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
                  选择要保留的既有主页
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
                  <option value="">请选择未关联主页</option>
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
                    保留哪个主页
                  </div>
                  <div className="mt-2 text-[13.5px] font-medium" style={{ color: tone.ink }}>
                    {keepProfile?.name || "尚未选择"}
                  </div>
                  <div className="mt-1 break-all font-mono text-[11.5px]" style={{ color: tone.ink50 }}>
                    {keepProfile ? `/${keepProfile.slug}` : "—"}
                  </div>
                </div>
                <div className="rounded-lg border px-4 py-3" style={{ borderColor: tone.roseSoft }}>
                  <div className="text-[10.5px] uppercase tracking-[0.1em]" style={{ color: tone.rose }}>
                    删除哪个重复主页
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
                系统会保留所选主页的链接、排序、显示状态和已有内容，仅用重复主页补齐空白资料；随后删除重复主页。删除后不可恢复。
              </p>
            </div>

            <div
              className="flex flex-col-reverse gap-2 px-5 py-4 sm:flex-row sm:justify-end sm:px-7"
              style={{ borderTop: `1px solid ${tone.line}`, background: tone.paper }}
            >
              <Btn variant="outline" onClick={() => setMergeDraft(null)} disabled={busy !== null}>
                取消
              </Btn>
              <Btn
                variant="danger"
                onClick={() => void replaceLinkedProfile()}
                disabled={busy !== null || !keepProfile}
              >
                {busy?.startsWith("merge:") ? "正在更换…" : "确认更换并删除重复主页"}
              </Btn>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
