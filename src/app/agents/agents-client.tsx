"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Btn, Card, EditorialInput, Icons, LabeledField, Pill } from "@/components/homix/primitives";
import { PageHeader, Toolbar, SearchInput, CardHeader, FilterTabs } from "@/components/homix/page-kit";
import { fmtMoney, tone } from "@/components/homix/tokens";
import { DEFAULT_AGENT_SPLIT_PCT, splitLabel } from "@/lib/splits";
import { useLocale } from "@/lib/i18n-client";
import { computeOnboarding } from "@/lib/onboarding-progress";
import {
  AGENT_PLANS,
  AGENT_PRACTICES,
  PLAN_LABELS,
  PLAN_SPLIT_PCT,
  PRACTICE_LABELS,
  normalizeAgentPlan,
} from "@/lib/agent-plans";
import type { Agent, Team } from "@/db/schema";
import type { AdminAgentRow } from "@/lib/homixweb";
import { RosterConsole } from "../roster/console";

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
    accountsView: "Accounts & onboarding",
    publicView: "Website roster",
    publicTitle: "Website roster",
    publicDescription: "Control website visibility, order, account links, and public profiles.",
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
    existingPublicProfile: "Existing website profile (optional)",
    noExistingPublicProfile: "No existing profile — approve and create one",
    loadingPublicProfiles: "Loading website profiles…",
    inactiveAgents: "Inactive agents",
    inactiveSubtitle: "Former or disabled accounts; history is retained",
    reactivate: "Reactivate",
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
    editEyebrow: "Edit",
    addAgentTitle: "Add agent",
    editAgentTitle: "Edit agent",
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
    labelLegalName: "Legal name",
    legalNamePlaceholder: "As it appears on the license",
    labelReferredBy: "Referred by",
    noReferrer: "No referrer",
    colAgent: "Agent",
    colContact: "Contact",
    colTeamSplit: "Team / Split",
    colMtd: "MTD",
    referredByShort: "Referred by",
    setupIncompleteHint: "Setup incomplete — profile still publishes; this is just a heads-up.",
    referralLeaders: "Referrals",
    referralLeadersSub: "Who brought whom into the brokerage",
    labelPlan: "Commission plan",
    labelPractice: "Practice area",
    colPlan: "Plan",
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
    accountsView: "账号与入职",
    publicView: "官网名册",
    publicTitle: "官网名册",
    publicDescription: "统一管理官网显示状态、顺序、账号关联和公开资料。",
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
    existingPublicProfile: "关联既有官网经纪人（可选）",
    noExistingPublicProfile: "没有既有档案——批准并创建官网主页",
    loadingPublicProfiles: "正在读取官网经纪人…",
    inactiveAgents: "已停用经纪人",
    inactiveSubtitle: "离职或停用账号；历史成交和付款记录仍会保留",
    reactivate: "重新启用",
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
    editEyebrow: "编辑",
    addAgentTitle: "添加经纪人",
    editAgentTitle: "编辑经纪人",
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
    labelLegalName: "法定姓名",
    legalNamePlaceholder: "与执照上一致",
    labelReferredBy: "推荐人",
    noReferrer: "无推荐人",
    colAgent: "经纪人",
    colContact: "联系方式",
    colTeamSplit: "团队 / 分成",
    colMtd: "本月",
    referredByShort: "推荐人",
    setupIncompleteHint: "资料未齐全——主页照常展示，这里只是提醒。",
    referralLeaders: "推荐榜",
    referralLeadersSub: "谁把谁带进了公司",
    labelPlan: "佣金方案",
    labelPractice: "业务类型",
    colPlan: "方案",
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
  /** Payout readiness (presence only — never the bank digits themselves). */
  hasPayout?: boolean;
  hasW9?: boolean;
};

type AdminView = "accounts" | "public";

const emptyAgent: Partial<Agent> = {
  name: "",
  email: "",
  phone: "",
  licenseNumber: "",
  licenseExpiresAt: "",
  licensedCompany: "Homix Living Inc.",
  splitPct: DEFAULT_AGENT_SPLIT_PCT,
  teamId: null,
  accountStatus: "active",
  joinedAt: "",
  notes: "",
  plan: "standard",
  practice: null,
};

function initials(name: string) {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join("");
}

/** Roster headshot. Falls back to initials when the agent has no linked
 *  website profile, or when the website roster couldn't be reached. */
function Avatar({ name, src }: { name: string; src?: string | null }) {
  return (
    <div
      className="h-10 w-10 shrink-0 overflow-hidden rounded-full"
      style={{ background: tone.accentSoft }}
    >
      {src ? (
        // A plain <img>: these are remote Supabase URLs at a fixed 40px, so
        // there is nothing for next/image to optimize.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt="" className="h-full w-full object-cover" loading="lazy" />
      ) : (
        <div
          className="flex h-full w-full items-center justify-center font-serif"
          style={{ color: tone.accent, fontSize: 15 }}
        >
          {initials(name)}
        </div>
      )}
    </div>
  );
}

export default function AgentsConsole({ initialView }: { initialView: AdminView }) {
  const router = useRouter();
  const locale = useLocale();
  const t = M[locale];
  const [view, setView] = useState<AdminView>(initialView);
  const [agents, setAgents] = useState<AgentRow[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [publicAgents, setPublicAgents] = useState<AdminAgentRow[]>([]);
  const [publicRosterLoading, setPublicRosterLoading] = useState(true);
  const [publicRosterUnreachable, setPublicRosterUnreachable] = useState(false);
  const [approvalLinks, setApprovalLinks] = useState<Record<number, string>>({});
  const [approvalReferrers, setApprovalReferrers] = useState<Record<number, string>>({});
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [editAgent, setEditAgent] = useState<Partial<Agent> | null>(null);
  const [saving, setSaving] = useState(false);

  const fetchAgents = () => {
    setLoading(true);
    // Public roster is independent of the Portal queries. Load it alongside
    // them so a slow website cannot delay the account list, while a failed
    // Portal request cannot leave the website-roster view spinning forever.
    setPublicRosterLoading(true);
    void fetch("/api/admin/roster")
      .then(async (r) => {
        if (!r.ok) throw new Error("Website roster unavailable");
        return r.json();
      })
      .then((publicRoster) => {
        setPublicAgents(publicRoster.agents ?? []);
        setPublicRosterUnreachable(false);
      })
      .catch(() => {
        setPublicAgents([]);
        setPublicRosterUnreachable(true);
      })
      .finally(() => setPublicRosterLoading(false));

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
    fetchAgents();
  }, []);

  const selectView = (next: AdminView) => {
    setView(next);
    router.replace(next === "public" ? "/agents?view=public" : "/agents", {
      scroll: false,
    });
  };

  const pending = useMemo(
    () =>
      agents.filter(
        (row) =>
          row.agent.accountStatus === "pending"
      ),
    [agents]
  );

  const inactive = useMemo(
    () => agents.filter((row) => row.agent.accountStatus === "inactive"),
    [agents]
  );

  const unlinkedPublicAgents = useMemo(
    () =>
      publicAgents
        .filter((agent) => agent.portal_agent_id == null)
        .sort((a, b) => (a.name || a.slug).localeCompare(b.name || b.slug)),
    [publicAgents],
  );

  // portal agent id -> headshot from their linked website profile.
  const photoByAgentId = useMemo(() => {
    const map = new Map<number, string>();
    for (const p of publicAgents) {
      if (p.portal_agent_id != null && p.photo_url) map.set(p.portal_agent_id, p.photo_url);
    }
    return map;
  }, [publicAgents]);
  const photoFor = (id: number) => photoByAgentId.get(id);

  const publicByAgentId = useMemo(() => {
    const map = new Map<number, AdminAgentRow>();
    for (const p of publicAgents) {
      if (p.portal_agent_id != null) map.set(p.portal_agent_id, p);
    }
    return map;
  }, [publicAgents]);

  // How much of this agent's setup is still outstanding. Purely informational
  // — an incomplete profile still shows on the public site, since a
  // well-staffed roster matters more than every bio being polished.
  const setupFor = (row: AgentRow) => {
    const pub = publicByAgentId.get(row.agent.id);
    return computeOnboarding({
      accountStatus: row.agent.accountStatus,
      licenseNumber: row.agent.licenseNumber,
      hasPublicProfile: Boolean(pub),
      publicProfile: pub ? { photoUrl: pub.photo_url, bio: pub.bio } : null,
      payment: {
        // The API exposes readiness flags only, never the digits — synthesize
        // the shape the calculator expects.
        routingNumber: row.hasPayout ? "set" : null,
        accountNumber: row.hasPayout ? "set" : null,
        payeeName: row.hasPayout ? "set" : null,
        w9ObjectKey: row.hasW9 ? "set" : null,
      },
    });
  };

  // agent id -> display name, for rendering the referred-by column.
  const nameByAgentId = useMemo(() => {
    const map = new Map<number, string>();
    for (const { agent } of agents) map.set(agent.id, agent.name);
    return map;
  }, [agents]);
  const referrerName = (id: number | null | undefined) =>
    id == null ? null : nameByAgentId.get(id) ?? null;

  const filtered = useMemo(() => {
    const activeAgents = agents.filter((row) => row.agent.accountStatus === "active");
    if (!search) return activeAgents;
    const q = search.toLowerCase();
    return activeAgents.filter(
      ({ agent, teamName }) =>
        agent.name.toLowerCase().includes(q) ||
        // Searchable by the licence/tax name too — admins often only have that.
        (agent.legalName || "").toLowerCase().includes(q) ||
        (agent.email || "").toLowerCase().includes(q) ||
        (agent.licenseNumber || "").toLowerCase().includes(q) ||
        (teamName || "").toLowerCase().includes(q)
    );
  }, [agents, search]);

  const handleApprove = async (id: number) => {
    try {
      const publicProfileId = approvalLinks[id] || undefined;
      const referredByAgentId = approvalReferrers[id] || undefined;
      const res = await fetch(`/api/agents/${id}/approve`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ publicProfileId, referredByAgentId }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || t.couldNotApprove);
      toast.success(t.agentApproved);
      if (data.warning) toast.warning(data.warning);
      fetchAgents();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t.couldNotApprove);
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

  // Referrers ranked by how many people they've brought in.
  const referralLeaders = useMemo(() => {
    const byReferrer = new Map<number, { id: number; name: string; recruits: { id: number; name: string }[] }>();
    for (const { agent } of agents) {
      const refId = agent.referredByAgentId;
      if (refId == null) continue;
      const referrerName = nameByAgentId.get(refId);
      if (!referrerName) continue; // referrer no longer on the roster
      if (!byReferrer.has(refId)) byReferrer.set(refId, { id: refId, name: referrerName, recruits: [] });
      byReferrer.get(refId)!.recruits.push({ id: agent.id, name: agent.name });
    }
    return [...byReferrer.values()].sort(
      (a, b) => b.recruits.length - a.recruits.length || a.name.localeCompare(b.name),
    );
  }, [agents, nameByAgentId]);

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
      const data = await res.json().catch(() => ({}));
      toast.success(editAgent.id ? t.agentSaved : t.agentCreated);
      if (data.warning) toast.warning(data.warning);
      closeDialog();
      fetchAgents();
    } catch (err) {
      const msg = err instanceof Error ? err.message : t.saveFailed;
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-7">
      <PageHeader
        eyebrow={t.eyebrow}
        title={view === "public" ? t.publicTitle : t.title}
        description={
          view === "public"
            ? t.publicDescription
            : `${t.descPrefix}${filtered.length} ${filtered.length === 1 ? t.activeBrokerSingular : t.activeBrokerPlural} ${t.across} ${Object.keys(grouped).length} ${Object.keys(grouped).length === 1 ? t.teamSingular : t.teamPlural}.`
        }
        actions={view === "accounts" ? (
          <Btn variant="primary" icon={<Icons.Plus />} onClick={() => setEditAgent(emptyAgent)}>
            {t.addAgent}
          </Btn>
        ) : undefined}
      />

      <FilterTabs
        value={view}
        onChange={selectView}
        options={[
          { id: "accounts", label: t.accountsView, count: agents.length },
          { id: "public", label: t.publicView, count: publicAgents.length },
        ]}
      />

      {view === "public" && (
        <RosterConsole
          initialAgents={publicAgents}
          portalAgents={agents
            .filter(({ agent }) => agent.accountStatus === "active")
            .map(({ agent }) => ({ id: agent.id, name: agent.name, email: agent.email }))}
          unreachable={publicRosterUnreachable}
          loading={publicRosterLoading}
          onAgentsChange={setPublicAgents}
        />
      )}

      <div className={view === "accounts" ? "contents" : "hidden"}>
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
                className="grid items-start gap-4 px-5 py-4 sm:items-center sm:px-6 sm:[grid-template-columns:auto_1fr_auto]"
                style={{ borderBottom: `1px solid ${tone.lineSoft}` }}
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
                <div className="col-span-full flex min-w-0 flex-wrap items-center gap-2 sm:col-span-1 sm:justify-end">
                  <label className="flex w-full min-w-0 flex-col gap-1 sm:w-auto sm:flex-none">
                    <span className="text-[10.5px]" style={{ color: tone.ink50 }}>
                      {t.existingPublicProfile}
                    </span>
                    <select
                      value={approvalLinks[agent.id] || ""}
                      onChange={(event) =>
                        setApprovalLinks((current) => ({
                          ...current,
                          [agent.id]: event.target.value,
                        }))
                      }
                      disabled={publicRosterLoading}
                      className="h-9 w-full rounded border bg-white px-2 text-[12px] disabled:opacity-60 sm:max-w-[260px]"
                      style={{ borderColor: tone.line, color: tone.ink }}
                    >
                      <option value="">
                        {publicRosterLoading
                          ? t.loadingPublicProfiles
                          : t.noExistingPublicProfile}
                      </option>
                      {unlinkedPublicAgents.map((profile) => (
                        <option key={profile.id} value={profile.id}>
                          {profile.name || profile.slug} · /{profile.slug}
                        </option>
                      ))}
                    </select>
                  </label>
                  {/* Captured here because approval is the one moment an admin
                      is already looking at this person; asked for later, it
                      rarely gets filled in. Optional. */}
                  <label className="flex w-full min-w-0 flex-col gap-1 sm:w-auto sm:flex-none">
                    <span className="text-[10.5px]" style={{ color: tone.ink50 }}>
                      {t.labelReferredBy}
                    </span>
                    <select
                      value={approvalReferrers[agent.id] || ""}
                      onChange={(event) =>
                        setApprovalReferrers((current) => ({
                          ...current,
                          [agent.id]: event.target.value,
                        }))
                      }
                      className="h-9 w-full rounded border bg-white px-2 text-[12px] sm:max-w-[180px]"
                      style={{ borderColor: tone.line, color: tone.ink }}
                    >
                      <option value="">{t.noReferrer}</option>
                      {agents
                        .filter(({ agent: a }) => a.accountStatus === "active" && a.id !== agent.id)
                        .map(({ agent: a }) => (
                          <option key={a.id} value={a.id}>
                            {a.name}
                          </option>
                        ))}
                    </select>
                  </label>
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
                    disabled={publicRosterLoading}
                  >
                    {t.approve}
                  </Btn>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {inactive.length > 0 && (
        <Card>
          <CardHeader
            title={t.inactiveAgents}
            subtitle={t.inactiveSubtitle}
            action={<Pill tone="neutral">{inactive.length}</Pill>}
          />
          <div className="divide-y" style={{ borderColor: tone.lineSoft }}>
            {inactive.map(({ agent }) => (
              <div
                key={agent.id}
                className="grid items-start gap-4 px-5 py-4 sm:items-center sm:px-6 sm:[grid-template-columns:auto_1fr_auto]"
                style={{ borderBottom: `1px solid ${tone.lineSoft}` }}
              >
                <div
                  className="w-10 h-10 rounded-full flex items-center justify-center font-medium"
                  style={{ background: tone.paperDeep, color: tone.ink50, fontSize: 12 }}
                >
                  {initials(agent.name)}
                </div>
                <div>
                  <div className="text-[14px]" style={{ color: tone.ink }}>
                    {agent.name}
                  </div>
                  <div className="text-[12px] mt-0.5 font-mono" style={{ color: tone.ink50 }}>
                    {agent.email || t.noEmail}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Btn variant="outline" size="sm" onClick={() => setEditAgent(agent)}>
                    {t.edit}
                  </Btn>
                  <Btn
                    variant="primary"
                    size="sm"
                    icon={<Icons.Check />}
                    onClick={() => handleApprove(agent.id)}
                  >
                    {t.reactivate}
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
              {/* One row per agent. Scanning a roster is a vertical task —
                  cards forced a 3-across grid that buried the fields an admin
                  actually compares (licence, split, MTD, who recruited whom). */}
              <div className="divide-y" style={{ borderColor: tone.lineSoft }}>
                {rows.map((row) => {
                  const { agent, mtdDeals, mtdTake } = row;
                  const setup = setupFor(row);
                  return (
                  <div
                    key={agent.id}
                    className="flex flex-wrap items-center gap-x-4 gap-y-3 px-5 py-3.5 transition-colors hover:bg-[#FAF7F0] sm:px-6"
                  >
                    <Link
                      href={`/agents/${agent.id}`}
                      prefetch={false}
                      className="flex min-w-0 flex-1 flex-wrap items-center gap-x-4 gap-y-3"
                    >
                    <Avatar name={agent.name} src={photoFor(agent.id)} />

                    {/* Identity — display name, plus the legal name when it
                        differs, since that's what payouts and licences use. */}
                    <div className="min-w-0 flex-1 basis-[190px]">
                      <div className="truncate font-serif" style={{ fontSize: 17, color: tone.ink }}>
                        {agent.name}
                      </div>
                      <div className="mt-0.5 truncate text-[11.5px]" style={{ color: tone.ink50 }}>
                        {agent.legalName && agent.legalName !== agent.name ? (
                          <span>{agent.legalName} · </span>
                        ) : null}
                        <span className="font-mono">{agent.licenseNumber || t.noLicense}</span>
                      </div>
                    </div>

                    {/* Contact */}
                    <div className="min-w-0 basis-full sm:basis-[190px]">
                      <div className="truncate text-[12.5px]" style={{ color: tone.ink70 }}>
                        {agent.email || t.noEmailCap}
                      </div>
                      {agent.phone && (
                        <div className="mt-0.5 truncate font-mono text-[11.5px]" style={{ color: tone.ink50 }}>
                          {agent.phone}
                        </div>
                      )}
                    </div>

                    {/* Who recruited them */}
                    <div className="min-w-0 basis-[130px]">
                      <div className="text-[10px] uppercase tracking-[0.1em]" style={{ color: tone.ink50 }}>
                        {t.referredByShort}
                      </div>
                      <div className="mt-0.5 truncate text-[12.5px]" style={{ color: tone.ink70 }}>
                        {referrerName(agent.referredByAgentId) || "—"}
                      </div>
                    </div>

                    {/* Plan + practice area — the two things most often
                        adjusted, so they're visible without opening anyone. */}
                    <div className="min-w-0 basis-[120px]">
                      <div className="text-[10px] uppercase tracking-[0.1em]" style={{ color: tone.ink50 }}>
                        {t.colPlan}
                      </div>
                      <div className="mt-0.5 truncate text-[12.5px]" style={{ color: tone.ink70 }}>
                        {PLAN_LABELS[locale][normalizeAgentPlan(agent.plan)]}
                        {" · "}
                        {agent.practice
                          ? PRACTICE_LABELS[locale][agent.practice]
                          : PRACTICE_LABELS[locale].unset}
                      </div>
                    </div>

                    {/* MTD — the two numbers the cards used to spend a whole
                        row each on. */}
                    <div className="basis-[104px] text-right">
                      <div className="text-[10px] uppercase tracking-[0.1em]" style={{ color: tone.ink50 }}>
                        {t.colMtd}
                      </div>
                      <div className="mt-0.5 font-serif" style={{ fontSize: 15, color: tone.ink }}>
                        {mtdDeals} · ${fmtMoney(Number(mtdTake || 0))}
                      </div>
                    </div>

                    {!setup.complete && (
                      <span
                        className="rounded-full px-2 py-0.5 text-[10.5px] whitespace-nowrap"
                        style={{ background: tone.amberSoft, color: tone.amber }}
                        title={t.setupIncompleteHint}
                      >
                        {setup.completed}/{setup.total}
                      </span>
                    )}
                    <Pill tone="accent">{splitLabel(agent.splitPct)}</Pill>
                    </Link>
                    {/* Edit in place: adjusting someone's plan or practice area
                        shouldn't require opening their detail page first. */}
                    <Btn variant="outline" size="sm" onClick={() => setEditAgent(agent)}>
                      {t.edit}
                    </Btn>
                  </div>
                  );
                })}
              </div>
            </Card>
          ))
      )}

      {/* Who has recruited whom. Now that referrals are recorded, this turns
          the field into something actionable — recruiting credit, and a read
          on how the team is actually growing. */}
      {referralLeaders.length > 0 && (
        <Card>
          <CardHeader
            title={t.referralLeaders}
            subtitle={t.referralLeadersSub}
            action={<Pill tone="neutral">{referralLeaders.length}</Pill>}
          />
          <div className="divide-y" style={{ borderColor: tone.lineSoft }}>
            {referralLeaders.map(({ id, name, recruits }) => (
              <div key={id} className="flex items-center gap-3 px-5 py-3 sm:px-6">
                <Avatar name={name} src={photoFor(id)} />
                <div className="min-w-0 flex-1 truncate text-[13.5px]" style={{ color: tone.ink }}>
                  {name}
                </div>
                <div className="min-w-0 flex-1 truncate text-[12px]" style={{ color: tone.ink50 }}>
                  {recruits.map((r) => r.name).join(" · ")}
                </div>
                <Pill tone="accent">{recruits.length}</Pill>
              </div>
            ))}
          </div>
        </Card>
      )}
      </div>

      {editAgent && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-8" style={{ background: "rgba(26, 24, 20, 0.4)", backdropFilter: "blur(4px)" }} onClick={closeDialog}>
          <div className="w-full max-w-2xl rounded-2xl max-h-[90vh] overflow-hidden flex flex-col" style={{ background: tone.card, border: `1px solid ${tone.line}`, boxShadow: "0 30px 80px -20px rgba(0,0,0,0.3)" }} onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between gap-4 px-5 py-4 sm:px-8 sm:py-6" style={{ borderBottom: `1px solid ${tone.line}` }}>
              <div>
                <div className="text-[11px] uppercase tracking-[0.14em]" style={{ color: tone.ink50 }}>
                  {editAgent.id ? t.editEyebrow : t.newEyebrow}
                </div>
                <div className="font-serif" style={{ fontSize: 26, color: tone.ink, marginTop: 2 }}>
                  {editAgent.id ? t.editAgentTitle : t.addAgentTitle}
                </div>
              </div>
              <button onClick={closeDialog} className="flex h-10 w-10 items-center justify-center rounded-full sm:h-8 sm:w-8" style={{ background: tone.paperDeep, color: tone.ink70 }}>
                x
              </button>
            </div>
            <div className="flex-1 space-y-4 overflow-auto px-5 py-5 sm:px-8 sm:py-6">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <LabeledField label={t.labelName}>
                  <EditorialInput value={editAgent.name || ""} onChange={(v) => updateField("name", v)} placeholder={t.namePlaceholder} />
                </LabeledField>
                <LabeledField label={t.labelEmail}>
                  <EditorialInput value={editAgent.email || ""} onChange={(v) => updateField("email", v)} placeholder="agent@gmail.com" mono />
                </LabeledField>
                {editAgent.id && <LabeledField label={t.labelTeam}>
                  <select
                    value={editAgent.teamId || ""}
                    onChange={(e) => updateField("teamId", e.target.value ? Number(e.target.value) : null)}
                    className="h-11 w-full rounded-lg px-3 text-[13.5px] outline-none sm:h-10"
                    style={{ background: tone.card, border: `1px solid ${tone.line}`, color: tone.ink }}
                  >
                    <option value="">{t.unassigned}</option>
                    {teams.map((team) => (
                      <option key={team.id} value={team.id}>
                        {team.name}
                      </option>
                    ))}
                  </select>
                </LabeledField>}
                {editAgent.id && <LabeledField label={t.labelPhone}>
                  <EditorialInput value={editAgent.phone || ""} onChange={(v) => updateField("phone", v)} placeholder="(917) 555-0101" mono />
                </LabeledField>}
                {editAgent.id && <LabeledField label={t.labelLicense}>
                  <EditorialInput value={editAgent.licenseNumber || ""} onChange={(v) => updateField("licenseNumber", v)} mono />
                </LabeledField>}
                {editAgent.id && <LabeledField label={t.labelLicenseExpires}>
                  <EditorialInput value={editAgent.licenseExpiresAt || ""} onChange={(v) => updateField("licenseExpiresAt", v)} type="date" mono />
                </LabeledField>}
                {editAgent.id && <LabeledField label={t.labelKeep}>
                  <EditorialInput value={editAgent.splitPct ?? DEFAULT_AGENT_SPLIT_PCT} onChange={(v) => updateField("splitPct", Number(v))} type="number" mono />
                </LabeledField>}
                {editAgent.id && <LabeledField label={t.labelPlan}>
                  <select
                    value={normalizeAgentPlan(editAgent.plan)}
                    onChange={(e) => {
                      const plan = e.target.value as (typeof AGENT_PLANS)[number];
                      // Switching plan pre-fills that plan's standard split, but
                      // the field stays editable — negotiated exceptions exist.
                      setEditAgent((cur) =>
                        cur ? { ...cur, plan, splitPct: PLAN_SPLIT_PCT[plan] } : cur,
                      );
                    }}
                    className="w-full h-11 sm:h-10 rounded-lg px-3 text-[13.5px] outline-none"
                    style={{ background: tone.card, border: `1px solid ${tone.line}`, color: tone.ink }}
                  >
                    {AGENT_PLANS.map((planKey) => (
                      <option key={planKey} value={planKey}>
                        {PLAN_LABELS[locale][planKey]} · {PLAN_SPLIT_PCT[planKey]}%
                      </option>
                    ))}
                  </select>
                </LabeledField>}
                {editAgent.id && <LabeledField label={t.labelPractice}>
                  <select
                    value={editAgent.practice ?? ""}
                    onChange={(e) =>
                      updateField("practice", e.target.value ? e.target.value : null)
                    }
                    className="w-full h-11 sm:h-10 rounded-lg px-3 text-[13.5px] outline-none"
                    style={{ background: tone.card, border: `1px solid ${tone.line}`, color: tone.ink }}
                  >
                    <option value="">{PRACTICE_LABELS[locale].unset}</option>
                    {AGENT_PRACTICES.map((k) => (
                      <option key={k} value={k}>
                        {PRACTICE_LABELS[locale][k]}
                      </option>
                    ))}
                  </select>
                </LabeledField>}
                {editAgent.id && <LabeledField label={t.labelCompany}>
                  <EditorialInput value={editAgent.licensedCompany || ""} onChange={(v) => updateField("licensedCompany", v)} />
                </LabeledField>}
                {editAgent.id && <LabeledField label={t.labelJoined}>
                  <EditorialInput value={editAgent.joinedAt || ""} onChange={(v) => updateField("joinedAt", v)} type="date" mono />
                </LabeledField>}
                {editAgent.id && <LabeledField label={t.labelLegalName}>
                  <EditorialInput
                    value={editAgent.legalName || ""}
                    onChange={(v) => updateField("legalName", v)}
                    placeholder={t.legalNamePlaceholder}
                  />
                </LabeledField>}
                {editAgent.id && <LabeledField label={t.labelReferredBy}>
                  <select
                    value={editAgent.referredByAgentId ?? ""}
                    onChange={(e) =>
                      updateField("referredByAgentId", e.target.value ? Number(e.target.value) : null)
                    }
                    className="w-full h-11 sm:h-10 rounded-lg px-3 text-[13.5px] outline-none"
                    style={{ background: tone.card, border: `1px solid ${tone.line}`, color: tone.ink }}
                  >
                    <option value="">{t.noReferrer}</option>
                    {agents
                      // Can't be referred by yourself; the API rejects it too.
                      .filter(({ agent }) => agent.id !== editAgent.id)
                      .map(({ agent }) => (
                        <option key={agent.id} value={agent.id}>
                          {agent.name}
                        </option>
                      ))}
                  </select>
                </LabeledField>}
              </div>
              {editAgent.id && <LabeledField label={t.labelNotes}>
                <textarea
                  value={editAgent.notes || ""}
                  onChange={(e) => updateField("notes", e.target.value)}
                  rows={3}
                  className="w-full rounded-lg p-3 text-[13.5px] outline-none"
                  style={{ background: tone.card, border: `1px solid ${tone.line}`, color: tone.ink, resize: "vertical" }}
                />
              </LabeledField>}
            </div>
            <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4 sm:px-8 sm:py-5" style={{ borderTop: `1px solid ${tone.line}`, background: tone.paper }}>
              <div>
                {editAgent.id && editAgent.accountStatus === "active" && (
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
