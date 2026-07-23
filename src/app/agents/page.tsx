"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { toast } from "sonner";
import { Btn, Card, EditorialInput, Icons, LabeledField, Pill } from "@/components/homix/primitives";
import { PageHeader, Toolbar, SearchInput, CardHeader } from "@/components/homix/page-kit";
import { fmtMoney, tone } from "@/components/homix/tokens";
import { DEFAULT_AGENT_SPLIT_PCT, splitLabel } from "@/lib/splits";
import { useLocale } from "@/lib/i18n-client";
import type { Agent, Team } from "@/db/schema";

const M = {
  en: {
    agentApproved: "Agent approved",
    couldNotApprove: "Could not approve",
    confirmIgnore: "Ignore this request? The account will stay inactive and be removed from pending approvals.",
    agentIgnored: "Request ignored",
    couldNotIgnore: "Could not ignore",
    confirmRevoke: "Revoke this agent's access?",
    accessRevoked: "Access revoked",
    couldNotRevoke: "Could not revoke",
    nameRequired: "Name is required",
    saveFailed: "Save failed",
    agentSaved: "Agent saved",
    agentCreated: "Agent created",
    loading: "Loading…",
    eyebrow: "Team",
    title: "Agents",
    descPrefix: "",
    activeBrokerSingular: "active broker",
    activeBrokerPlural: "active brokers",
    across: "across",
    teamSingular: "team",
    teamPlural: "teams",
    addAgent: "Add Agent",
    searchPlaceholder: "Search name, team, license, email…",
    pendingApprovals: "Pending approvals",
    pendingSubtitle: "New brokers awaiting activation",
    noEmail: "no email",
    joined: "joined",
    edit: "Edit",
    ignore: "Ignore",
    approve: "Approve",
    noAgentsYet: "No agents yet",
    addFirstAgent: "Add your first agent",
    unassigned: "Unassigned",
    rentalMtd: "Rental MTD",
    mtdTake: "MTD Take",
    noEmailCap: "No email",
    noLicense: "No license #",
    newEyebrow: "New",
    addAgentTitle: "Add agent",
    labelName: "Name *",
    labelTeam: "Team",
    labelEmail: "Email",
    labelPhone: "Phone",
    labelLicense: "License #",
    labelLicenseExpires: "License expires",
    labelKeep: "Agent keep %",
    labelCompany: "Licensed company",
    labelJoined: "Joined",
    labelNotes: "Notes",
    namePlaceholder: "e.g. Alice Chen",
    revokeAccess: "Revoke access",
    cancel: "Cancel",
    saving: "Saving…",
    save: "Save",
  },
  zh: {
    agentApproved: "经纪人已批准",
    couldNotApprove: "无法批准",
    confirmIgnore: "确定忽略这条申请？该账号会保持未激活，并从待审批列表移除。",
    agentIgnored: "已忽略申请",
    couldNotIgnore: "无法忽略",
    confirmRevoke: "确定撤销该经纪人的访问权限？",
    accessRevoked: "已撤销访问权限",
    couldNotRevoke: "无法撤销",
    nameRequired: "请填写姓名",
    saveFailed: "保存失败",
    agentSaved: "经纪人已保存",
    agentCreated: "经纪人已创建",
    loading: "加载中…",
    eyebrow: "团队",
    title: "经纪人",
    descPrefix: "共 ",
    activeBrokerSingular: "名在职经纪人",
    activeBrokerPlural: "名在职经纪人",
    across: "，分布于 ",
    teamSingular: "个团队",
    teamPlural: "个团队",
    addAgent: "添加经纪人",
    searchPlaceholder: "搜索姓名、团队、执照、邮箱…",
    pendingApprovals: "待审批",
    pendingSubtitle: "等待激活的新经纪人",
    noEmail: "无邮箱",
    joined: "加入于",
    edit: "编辑",
    ignore: "忽略",
    approve: "批准",
    noAgentsYet: "暂无经纪人",
    addFirstAgent: "添加第一位经纪人",
    unassigned: "未分配",
    rentalMtd: "本月租赁",
    mtdTake: "本月收入",
    noEmailCap: "无邮箱",
    noLicense: "无执照号",
    newEyebrow: "新建",
    addAgentTitle: "添加经纪人",
    labelName: "姓名 *",
    labelTeam: "团队",
    labelEmail: "邮箱",
    labelPhone: "电话",
    labelLicense: "执照号",
    labelLicenseExpires: "执照到期日",
    labelKeep: "经纪人分成 %",
    labelCompany: "持照公司",
    labelJoined: "加入日期",
    labelNotes: "备注",
    namePlaceholder: "例如 Alice Chen",
    revokeAccess: "撤销权限",
    cancel: "取消",
    saving: "保存中…",
    save: "保存",
  },
} as const;

type AgentRow = {
  agent: Agent;
  teamName: string | null;
  mtdDeals: number;
  mtdTake: number;
};

const emptyAgent: Partial<Agent> = {
  name: "",
  email: "",
  phone: "",
  licenseNumber: "",
  licenseExpiresAt: "",
  licensedCompany: "Homix Living Inc.",
  splitPct: DEFAULT_AGENT_SPLIT_PCT,
  teamId: null,
  isActive: true,
  joinedAt: "",
  notes: "",
};

function initials(name: string) {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join("");
}

export default function AgentsPage() {
  const t = M[useLocale()];
  const router = useRouter();
  const { data: session, status } = useSession();
  const [agents, setAgents] = useState<AgentRow[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [editAgent, setEditAgent] = useState<Partial<Agent> | null>(null);
  const [saving, setSaving] = useState(false);

  const fetchAgents = () => {
    setLoading(true);
    Promise.all([
      fetch("/api/agents").then((r) => r.json()),
      fetch("/api/teams").then((r) => (r.ok ? r.json() : [])),
    ])
      .then(([agentRows, teamRows]) => {
        setAgents(agentRows);
        setTeams(teamRows);
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    if (status === "authenticated" && !session.user.isAdmin) {
      router.replace("/");
      return;
    }
    if (status === "authenticated" && session.user.isAdmin) {
      fetchAgents();
    }
  }, [router, session?.user.isAdmin, status]);

  const pending = useMemo(
    () =>
      agents.filter(
        (row) =>
          row.agent.isActive === false &&
          (row.agent.approvalStatus || "pending") === "pending"
      ),
    [agents]
  );

  const filtered = useMemo(() => {
    const activeAgents = agents.filter((row) => row.agent.isActive !== false);
    if (!search) return activeAgents;
    const q = search.toLowerCase();
    return activeAgents.filter(
      ({ agent, teamName }) =>
        agent.name.toLowerCase().includes(q) ||
        (agent.email || "").toLowerCase().includes(q) ||
        (agent.licenseNumber || "").toLowerCase().includes(q) ||
        (teamName || "").toLowerCase().includes(q)
    );
  }, [agents, search]);

  const handleApprove = async (id: number) => {
    try {
      const res = await fetch(`/api/agents/${id}/approve`, { method: "POST" });
      if (!res.ok) throw new Error();
      toast.success(t.agentApproved);
      fetchAgents();
    } catch {
      toast.error(t.couldNotApprove);
    }
  };

  const handleIgnore = async (id: number) => {
    if (!confirm(t.confirmIgnore)) return;
    try {
      const res = await fetch(`/api/agents/${id}/ignore`, { method: "POST" });
      if (!res.ok) throw new Error();
      toast.success(t.agentIgnored);
      fetchAgents();
    } catch {
      toast.error(t.couldNotIgnore);
    }
  };

  const handleRevoke = async (id: number) => {
    if (!confirm(t.confirmRevoke)) return;
    try {
      const res = await fetch(`/api/agents/${id}/approve`, { method: "DELETE" });
      if (!res.ok) throw new Error();
      toast.success(t.accessRevoked);
      fetchAgents();
    } catch {
      toast.error(t.couldNotRevoke);
    }
  };

  const grouped = useMemo(() => {
    return filtered.reduce<Record<string, AgentRow[]>>((acc, row) => {
      const key = row.teamName || "Unassigned";
      if (!acc[key]) acc[key] = [];
      acc[key].push(row);
      return acc;
    }, {});
  }, [filtered]);

  const updateField = (field: keyof Agent, value: string | number | boolean | null) => {
    if (!editAgent) return;
    setEditAgent({ ...editAgent, [field]: value });
  };

  const closeDialog = () => {
    setEditAgent(null);
    setSaving(false);
  };

  const handleSave = async () => {
    if (!editAgent?.name?.trim()) {
      toast.error(t.nameRequired);
      return;
    }
    setSaving(true);
    try {
      // Strip env-managed fields the API doesn't accept (isAdmin is synced
      // from ADMIN_EMAILS at sign-in, not editable here). Keeps the wire
      // payload aligned with the API contract even though the backend now
      // ignores extras silently.
      const { isAdmin: _isAdmin, ...payload } = editAgent;
      void _isAdmin;
      const res = await fetch("/api/agents", {
        method: editAgent.id ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `Save failed (HTTP ${res.status})`);
      }
      toast.success(editAgent.id ? t.agentSaved : t.agentCreated);
      closeDialog();
      fetchAgents();
    } catch (err) {
      const msg = err instanceof Error ? err.message : t.saveFailed;
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  };

  if (status !== "authenticated" || !session?.user.isAdmin) {
    return (
      <div className="py-24 text-center text-[13px]" style={{ color: tone.ink50 }}>
        {t.loading}
      </div>
    );
  }

  return (
    <div className="space-y-7">
      <PageHeader
        eyebrow={t.eyebrow}
        title={t.title}
        description={`${t.descPrefix}${filtered.length} ${filtered.length === 1 ? t.activeBrokerSingular : t.activeBrokerPlural} ${t.across} ${Object.keys(grouped).length} ${Object.keys(grouped).length === 1 ? t.teamSingular : t.teamPlural}.`}
        actions={
          <Btn variant="primary" icon={<Icons.Plus />} onClick={() => setEditAgent(emptyAgent)}>
            {t.addAgent}
          </Btn>
        }
      />

      <Toolbar>
        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder={t.searchPlaceholder}
        />
      </Toolbar>

      {/* Pending approvals */}
      {pending.length > 0 && (
        <Card>
          <CardHeader
            title={t.pendingApprovals}
            subtitle={t.pendingSubtitle}
            action={<Pill tone="draft">{pending.length}</Pill>}
          />
          <div className="divide-y" style={{ borderColor: tone.lineSoft }}>
            {pending.map(({ agent }) => (
              <div
                key={agent.id}
                className="grid items-center px-6 py-4"
                style={{
                  gridTemplateColumns: "auto 1fr auto",
                  gap: 16,
                  borderBottom: `1px solid ${tone.lineSoft}`,
                }}
              >
                <div
                  className="w-10 h-10 rounded-full flex items-center justify-center font-medium"
                  style={{ background: tone.amberSoft, color: tone.amber, fontSize: 12 }}
                >
                  {initials(agent.name)}
                </div>
                <div>
                  <div className="text-[14px]" style={{ color: tone.ink }}>
                    {agent.name}
                  </div>
                  <div className="text-[12px] mt-0.5 font-mono" style={{ color: tone.ink50 }}>
                    {agent.email || t.noEmail}
                    {agent.joinedAt && (
                      <span> · {t.joined} {agent.joinedAt}</span>
                    )}
                  </div>
                </div>
                <div className="flex flex-wrap items-center justify-end gap-2">
                  <Btn
                    variant="outline"
                    size="sm"
                    onClick={() => setEditAgent(agent)}
                  >
                    {t.edit}
                  </Btn>
                  <Btn
                    variant="outline"
                    size="sm"
                    onClick={() => handleIgnore(agent.id)}
                  >
                    {t.ignore}
                  </Btn>
                  <Btn
                    variant="primary"
                    size="sm"
                    icon={<Icons.Check />}
                    onClick={() => handleApprove(agent.id)}
                  >
                    {t.approve}
                  </Btn>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {loading ? (
        <p className="text-[13px]" style={{ color: tone.ink50 }}>
          {t.loading}
        </p>
      ) : filtered.length === 0 ? (
        <Card>
          <div className="px-6 py-16 text-center">
            <div className="font-serif mb-2" style={{ fontSize: 24, color: tone.ink }}>
              {t.noAgentsYet}
            </div>
            <button
              type="button"
              onClick={() => setEditAgent(emptyAgent)}
              className="text-[13px] underline"
              style={{ color: tone.accent }}
            >
              {t.addFirstAgent}
            </button>
          </div>
        </Card>
      ) : (
        Object.entries(grouped)
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([teamName, rows]) => (
            <Card key={teamName}>
              <CardHeader title={teamName === "Unassigned" ? t.unassigned : teamName} action={<Pill tone="neutral">{rows.length}</Pill>} />
              <div className="p-6 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {rows.map(({ agent, mtdDeals, mtdTake }) => (
                  <Link
                    key={agent.id}
                    href={`/agents/${agent.id}`}
                    className="rounded-xl p-4 transition-colors hover:bg-[#FAF7F0]"
                    style={{ border: `1px solid ${tone.line}`, background: tone.card }}
                  >
                    <div className="flex items-start gap-3">
                      <div
                        className="w-11 h-11 rounded-full flex items-center justify-center font-serif shrink-0"
                        style={{ background: tone.accentSoft, color: tone.accent, fontSize: 18 }}
                      >
                        {initials(agent.name)}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="font-serif truncate" style={{ fontSize: 20, color: tone.ink }}>
                          {agent.name}
                        </div>
                        <div className="text-[11.5px] mt-1 font-mono truncate" style={{ color: tone.ink50 }}>
                          {agent.licenseNumber || t.noLicense}
                        </div>
                      </div>
                      <Pill tone="accent">{splitLabel(agent.splitPct)}</Pill>
                    </div>
                    <div className="mt-4 grid grid-cols-2 gap-3">
                      <div className="rounded-lg p-3" style={{ background: tone.paper }}>
                        <div className="text-[10px] uppercase tracking-[0.1em]" style={{ color: tone.ink50 }}>
                          {t.rentalMtd}
                        </div>
                        <div className="mt-1 font-serif" style={{ fontSize: 24, color: tone.ink }}>
                          {mtdDeals}
                        </div>
                      </div>
                      <div className="rounded-lg p-3" style={{ background: tone.paper }}>
                        <div className="text-[10px] uppercase tracking-[0.1em]" style={{ color: tone.ink50 }}>
                          {t.mtdTake}
                        </div>
                        <div className="mt-1 font-serif" style={{ fontSize: 24, color: tone.ink }}>
                          ${fmtMoney(Number(mtdTake || 0))}
                        </div>
                      </div>
                    </div>
                    <div className="mt-4 text-[12px]" style={{ color: tone.ink50 }}>
                      {agent.email || t.noEmailCap} {agent.phone ? `· ${agent.phone}` : ""}
                    </div>
                  </Link>
                ))}
              </div>
            </Card>
          ))
      )}

      {editAgent && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-8" style={{ background: "rgba(26, 24, 20, 0.4)", backdropFilter: "blur(4px)" }} onClick={closeDialog}>
          <div className="w-full max-w-2xl rounded-2xl max-h-[90vh] overflow-hidden flex flex-col" style={{ background: tone.card, border: `1px solid ${tone.line}`, boxShadow: "0 30px 80px -20px rgba(0,0,0,0.3)" }} onClick={(e) => e.stopPropagation()}>
            <div className="px-8 py-6 flex items-center justify-between" style={{ borderBottom: `1px solid ${tone.line}` }}>
              <div>
                <div className="text-[11px] uppercase tracking-[0.14em]" style={{ color: tone.ink50 }}>
                  {t.newEyebrow}
                </div>
                <div className="font-serif" style={{ fontSize: 26, color: tone.ink, marginTop: 2 }}>
                  {t.addAgentTitle}
                </div>
              </div>
              <button onClick={closeDialog} className="w-8 h-8 rounded-full flex items-center justify-center" style={{ background: tone.paperDeep, color: tone.ink70 }}>
                x
              </button>
            </div>
            <div className="flex-1 overflow-auto px-8 py-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <LabeledField label={t.labelName}>
                  <EditorialInput value={editAgent.name || ""} onChange={(v) => updateField("name", v)} placeholder={t.namePlaceholder} />
                </LabeledField>
                <LabeledField label={t.labelTeam}>
                  <select
                    value={editAgent.teamId || ""}
                    onChange={(e) => updateField("teamId", e.target.value ? Number(e.target.value) : null)}
                    className="w-full h-10 rounded-lg px-3 text-[13.5px] outline-none"
                    style={{ background: tone.card, border: `1px solid ${tone.line}`, color: tone.ink }}
                  >
                    <option value="">{t.unassigned}</option>
                    {teams.map((team) => (
                      <option key={team.id} value={team.id}>
                        {team.name}
                      </option>
                    ))}
                  </select>
                </LabeledField>
                <LabeledField label={t.labelEmail}>
                  <EditorialInput value={editAgent.email || ""} onChange={(v) => updateField("email", v)} placeholder="agent@homixny.com" mono />
                </LabeledField>
                <LabeledField label={t.labelPhone}>
                  <EditorialInput value={editAgent.phone || ""} onChange={(v) => updateField("phone", v)} placeholder="(917) 555-0101" mono />
                </LabeledField>
                <LabeledField label={t.labelLicense}>
                  <EditorialInput value={editAgent.licenseNumber || ""} onChange={(v) => updateField("licenseNumber", v)} mono />
                </LabeledField>
                <LabeledField label={t.labelLicenseExpires}>
                  <EditorialInput value={editAgent.licenseExpiresAt || ""} onChange={(v) => updateField("licenseExpiresAt", v)} type="date" mono />
                </LabeledField>
                <LabeledField label={t.labelKeep}>
                  <EditorialInput value={editAgent.splitPct ?? DEFAULT_AGENT_SPLIT_PCT} onChange={(v) => updateField("splitPct", Number(v))} type="number" mono />
                </LabeledField>
                <LabeledField label={t.labelCompany}>
                  <EditorialInput value={editAgent.licensedCompany || ""} onChange={(v) => updateField("licensedCompany", v)} />
                </LabeledField>
                <LabeledField label={t.labelJoined}>
                  <EditorialInput value={editAgent.joinedAt || ""} onChange={(v) => updateField("joinedAt", v)} type="date" mono />
                </LabeledField>
              </div>
              <LabeledField label={t.labelNotes}>
                <textarea
                  value={editAgent.notes || ""}
                  onChange={(e) => updateField("notes", e.target.value)}
                  rows={3}
                  className="w-full rounded-lg p-3 text-[13.5px] outline-none"
                  style={{ background: tone.card, border: `1px solid ${tone.line}`, color: tone.ink, resize: "vertical" }}
                />
              </LabeledField>
            </div>
            <div className="px-8 py-5 flex items-center justify-between gap-2" style={{ borderTop: `1px solid ${tone.line}`, background: tone.paper }}>
              <div>
                {editAgent.id && editAgent.isActive && (
                  <Btn
                    variant="danger"
                    size="sm"
                    onClick={() => {
                      handleRevoke(editAgent.id!);
                      closeDialog();
                    }}
                  >
                    {t.revokeAccess}
                  </Btn>
                )}
              </div>
              <div className="flex items-center gap-2">
                <Btn variant="outline" onClick={closeDialog}>
                  {t.cancel}
                </Btn>
                <Btn variant="primary" onClick={handleSave} disabled={saving}>
                  {saving ? t.saving : editAgent.id ? t.save : t.addAgentTitle}
                </Btn>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
