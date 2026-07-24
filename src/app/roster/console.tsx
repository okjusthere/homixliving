"use client";

import { useMemo, useState } from "react";
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

export function RosterConsole({
  initialAgents,
  portalAgents,
  unreachable,
}: {
  initialAgents: AdminAgentRow[];
  portalAgents: PortalRosterCandidate[];
  unreachable: boolean;
}) {
  const router = useRouter();
  const [agents, setAgents] = useState<AdminAgentRow[]>(initialAgents);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [selectedLinks, setSelectedLinks] = useState<Record<string, string>>({});
  const availablePortalAgents = useMemo(() => {
    const linkedIds = new Set(
      agents
        .map((agent) => agent.portal_agent_id)
        .filter((id): id is number => id != null),
    );
    return portalAgents.filter((agent) => !linkedIds.has(agent.id));
  }, [agents, portalAgents]);

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
    const next = a.visibility_status === "visible" ? "admin_hidden" : "visible";
    const { ok, out } = await post({
      action: "visibility",
      id: a.id,
      visibilityStatus: next,
    });
    setBusy(null);
    if (!ok) return setMsg({ ok: false, text: out?.error || "操作失败" });
    setAgents((prev) =>
      prev.map((x) => (x.id === a.id ? { ...x, visibility_status: next } : x)),
    );
    setMsg({ ok: true, text: `${a.name} 已${next === "visible" ? "显示" : "由管理员隐藏"}` });
  }

  async function move(idx: number, dir: -1 | 1) {
    const j = idx + dir;
    if (j < 0 || j >= agents.length) return;
    const prev = agents;
    const next = agents.slice();
    [next[idx], next[j]] = [next[j], next[idx]];
    setAgents(next);
    setBusy("reorder");
    setMsg(null);
    const { ok, out } = await post({ action: "reorder", ids: next.map((x) => x.id) });
    setBusy(null);
    if (!ok) {
      setAgents(prev); // revert on failure
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
    setAgents((prev) =>
      prev.map((agent) =>
        agent.id === a.id
          ? {
              ...agent,
              name: portalAgent.name,
              portal_agent_id: portalAgentId,
            }
          : agent,
      ),
    );
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
          subtitle="新增和停用请前往“经纪人”；这里管理官网显示状态与顺序"
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
                <Btn variant="outline" onClick={() => router.push(`/roster/${a.id}`)}>
                  编辑
                </Btn>
              </div>
            </div>
          ))}
          {agents.length === 0 && (
            <div className="px-5 py-8 text-center text-[13px]" style={{ color: tone.ink50 }}>
              名册为空。
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}
