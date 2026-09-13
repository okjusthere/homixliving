"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { CelebrationsConsole } from "@/components/admin/celebrations-console";
import { useListQuery, ListPagination } from "@/components/admin/list-controls";
import { EditPanel } from "@/components/admin/edit-panel";
import {
  TASK_LABELS,
  type OnboardingTaskSummary,
} from "@/lib/onboarding-tasks";
import { OnboardingPanel } from "@/components/admin/onboarding-panel";
import { onboardingWorkflow, ONBOARDING_NEXT } from "@/lib/onboarding-workflow";
import { AgentEmailsPanel } from "@/components/admin/agent-emails-panel";
import { matchesAgentSearch, paginate } from "@/lib/agent-list";
import { toast } from "sonner";
import {
  Btn,
  Card,
  EditorialInput,
  Icons,
  LabeledField,
  Pill,
} from "@/components/homix/primitives";
import {
  PageHeader,
  Toolbar,
  SearchInput,
  CardHeader,
  FilterTabs,
} from "@/components/homix/page-kit";
import { tone } from "@/components/homix/tokens";
import { DEFAULT_AGENT_SPLIT_PCT } from "@/lib/splits";
import { useLocale } from "@/lib/i18n-client";
import { computeOnboarding } from "@/lib/onboarding-progress";
import {
  AGENT_PRACTICES,
  CURRENT_AGENT_PLANS,
  PLAN_LABELS,
  PLAN_SPLIT_PCT,
  PRACTICE_LABELS,
  normalizeAgentPlan,
} from "@/lib/agent-plans";
import type { Agent, Team } from "@/db/schema";
import type { AdminAgentRow } from "@/lib/homixweb";
import type { MlsVerificationStatus } from "@/lib/public-identity-status";
import { RosterConsole } from "../roster/console";
import { nyDate } from "@/lib/celebrations/calendar";

const M = {
  en: {
    agentApproved: "Agent approved",
    couldNotApprove: "Could not approve",
    confirmIgnore:
      "Ignore this request? The account will stay inactive and be removed from pending approvals.",
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
    publicDescription:
      "Control website visibility, order, account links, and public profiles.",
    descPrefix: "",
    activeBrokerSingular: "active broker",
    activeBrokerPlural: "active brokers",
    across: "across",
    teamSingular: "team",
    teamPlural: "teams",
    addAgent: "Add Agent",
    searchPlaceholder: "Search name, team, license, email…",
    pendingApprovals: "Onboarding tasks",
    pendingSubtitle:
      "Track outstanding contracts, receipts and access, including after activation",
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
    setupIncompleteHint:
      "Setup incomplete — profile still publishes; this is just a heads-up.",
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
    syncWarning:
      "The Portal record was saved, but the public website did not finish syncing. Retry from the website roster.",
    agreement: "Agreement",
    payment: "Payment",
    source: "Source",
    websiteSource: "Homix website",
    recordOffline: "Record offline payment",
    offlineTitle: "Record money received",
    offlineLead:
      "Record the amount the company actually received. Fee matching is a separate step; this does not activate the account or issue rewards.",
    offlineMethod: "Payment method",
    offlineDate: "Received date",
    offlineReference: "Receipt / check / transaction reference",
    offlineAmount: "Amount actually received (USD)",
    offlineSave: "Record receipt",
    offlineRecorded: "Receipt recorded; review and match the fee next",
    agentSignatureDone: "Agent signed; company countersign pending",
    onlineActivationPending:
      "Stripe payment received; automatic activation is processing",
    mlsUnavailable:
      "MLS verification is temporarily unavailable and will retry automatically.",
    mlsUnmatched:
      "The license has not matched the Homix OneKey roster. Check the number; the system retries daily.",
    mlsAmbiguous:
      "Multiple MLS records matched this license. Review it before relying on past sales.",
    mlsClaimed: "This license is already linked to another website profile.",
    mlsUnlinked: "This Portal account has no linked website profile.",
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
    pendingApprovals: "入职处理",
    pendingSubtitle: "按未完成事项跟进合同、收款和权限，已开通后的待办仍会保留",
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
    syncWarning:
      "Portal 档案已保存，但官网同步未完成；请稍后在官网名册中重试。",
    agreement: "协议",
    payment: "付款",
    source: "来源",
    websiteSource: "Homix 官网",
    recordOffline: "登记线下付款",
    offlineTitle: "登记实际收款",
    offlineLead:
      "照实登记公司已经收到的金额。之后再匹配入职费用；此操作不会开通账号或结算推荐奖励。",
    offlineMethod: "付款方式",
    offlineDate: "收款日期",
    offlineReference: "收据 / 支票号 / 交易参考号",
    offlineAmount: "实际收到的金额（美元）",
    offlineSave: "确认已收款",
    offlineRecorded: "已登记收款，请继续核对并匹配费用",
    agentSignatureDone: "经纪人已签署；等待公司会签",
    onlineActivationPending: "Stripe 已收款，系统正在自动开通",
    mlsUnavailable: "MLS 暂时无法验证，系统会自动重试。",
    mlsUnmatched:
      "该执照号尚未匹配 Homix 的 OneKey 名册，请核对号码；系统每天会自动重试。",
    mlsAmbiguous: "该执照号匹配到多条 MLS 记录，请核对后再使用历史成交。",
    mlsClaimed: "该执照号已关联另一份官网档案。",
    mlsUnlinked: "该 Portal 账号尚未关联官网主页。",
  },
} as const;

type AgentRow = {
  agent: Agent;
  teamName: string | null;
  onboardingPaymentChannel?: string | null;
  onboardingTasks?: OnboardingTaskSummary;
  loginEmails?: Array<{
    email: string;
    isPrimary: boolean;
    verifiedAt: string | null;
  }>;
  mtdDeals: number;
  mtdTake: number;
  /** Payout readiness (presence only — never the bank digits themselves). */
  hasPayout?: boolean;
  hasW9?: boolean;
};

type AdminView =
  "accounts" | "onboarding" | "public" | "birthdays" | "anniversaries";

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
  plan: "solo",
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
        <img
          src={src}
          alt=""
          className="h-full w-full object-cover"
          loading="lazy"
        />
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

export default function AgentsConsole() {
  const { params, update: updateQuery, href: listHref } = useListQuery();
  const locale = useLocale();
  const t = M[locale];
  const agreementStatusLabel = (status: Agent["agreementStatus"]) =>
    locale === "en"
      ? status.replaceAll("_", " ")
      : (
          {
            not_started: "未开始",
            preparing: "正在生成协议",
            sent: "待签署",
            completed: "已签署",
            declined: "已拒签",
            voided: "已作废",
            expired: "已过期",
            failed: "失败",
          } as const
        )[status];
  const paymentStatusLabel = (status: Agent["paymentStatus"]) =>
    locale === "en"
      ? status.replaceAll("_", " ")
      : (
          {
            pending: "待付款",
            paid: "已付款",
            not_required: "无需付款",
          } as const
        )[status];

  const showSyncFeedback = (data: Record<string, unknown>) => {
    if (data.warning) {
      toast.warning(t.syncWarning);
      return;
    }
    const status = (
      data.mlsVerification as { status?: MlsVerificationStatus } | undefined
    )?.status;
    const messages: Partial<Record<MlsVerificationStatus, string>> = {
      unavailable: t.mlsUnavailable,
      unmatched: t.mlsUnmatched,
      ambiguous: t.mlsAmbiguous,
      claimed: t.mlsClaimed,
      unlinked: t.mlsUnlinked,
      failed: t.syncWarning,
    };
    if (status && messages[status]) toast.warning(messages[status]);
  };
  const view: AdminView =
    params.get("view") === "birthdays"
      ? "birthdays"
      : params.get("view") === "anniversaries"
        ? "anniversaries"
        : params.get("view") === "public"
          ? "public"
          : params.get("view") === "onboarding"
            ? "onboarding"
            : "accounts";
  const search = params.get("q") || "";
  const status = ["active", "pending", "inactive", "all"].includes(
    params.get("status") || "",
  )
    ? params.get("status")!
    : "active";
  const teamFilter = params.get("team") || "";
  const planFilter = params.get("plan") || "";
  const setSearch = (q: string) => updateQuery({ q, page: null });
  const editBase = useRef("");
  const editingKeyRef = useRef<string | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [teamError, setTeamError] = useState(false);
  const [agents, setAgents] = useState<AgentRow[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [publicAgents, setPublicAgents] = useState<AdminAgentRow[]>([]);
  const [publicRosterLoading, setPublicRosterLoading] = useState(true);
  const [publicRosterUnreachable, setPublicRosterUnreachable] = useState(false);
  const [approvalLinks, setApprovalLinks] = useState<Record<number, string>>(
    {},
  );
  const [loading, setLoading] = useState(true);
  const [editAgent, setEditAgent] = useState<Partial<Agent> | null>(null);
  const [saving, setSaving] = useState(false);
  const [offlineAgent, setOfflineAgent] = useState<Agent | null>(null);
  const [offlineMethod, setOfflineMethod] = useState("check");
  const [offlineReference, setOfflineReference] = useState("");
  const [offlineDate, setOfflineDate] = useState(() => nyDate());
  const [offlineAmount, setOfflineAmount] = useState("");
  const [offlineKey, setOfflineKey] = useState("");
  const [offlineSaving, setOfflineSaving] = useState(false);
  const offlineSignatureRef = useRef<string | null>(null);

  const fetchPublic = () => {
    setPublicRosterLoading(true);
    return fetch("/api/admin/roster")
      .then(async (r) => {
        if (!r.ok) throw new Error();
        const data = await r.json();
        setPublicAgents(data.agents ?? []);
        setPublicRosterUnreachable(false);
      })
      .catch(() => setPublicRosterUnreachable(true))
      .finally(() => setPublicRosterLoading(false));
  };
  const fetchAccounts = () => {
    setLoading(true);
    return fetch("/api/agents")
      .then(async (r) => {
        if (!r.ok) throw new Error();
        const data = await r.json();
        if (!Array.isArray(data)) throw new Error();
        setAgents(data);
        setLoadError(false);
      })
      .catch(() => setLoadError(true))
      .finally(() => setLoading(false));
  };
  const fetchTeams = () =>
    fetch("/api/teams")
      .then(async (r) => {
        if (!r.ok) throw new Error();
        setTeams(await r.json());
        setTeamError(false);
      })
      .catch(() => setTeamError(true));
  const fetchAgents = () => {
    void fetchAccounts();
    void fetchPublic();
  };
  useEffect(() => {
    void fetchAccounts();
    void fetchPublic();
    void fetchTeams();
  }, []);
  const emailAgent = agents.find(
    (row) => String(row.agent.id) === params.get("emails"),
  )?.agent;
  const editingKey = params.get("emails") ? null : params.get("agent");
  useEffect(() => {
    if (editingKey === editingKeyRef.current) return;
    if (!editingKey) {
      setEditAgent(null);
      editingKeyRef.current = null;
      return;
    }
    const agent =
      editingKey === "new"
        ? emptyAgent
        : agents.find((row) => String(row.agent.id) === editingKey)?.agent;
    if (!agent) return;
    editingKeyRef.current = editingKey;
    editBase.current = JSON.stringify(agent);
    setEditAgent({ ...agent });
  }, [editingKey, agents]);
  const openAgent = (agent: Partial<Agent>) =>
    updateQuery(
      {
        agent: agent.id ? String(agent.id) : "new",
        emails: null,
        onboarding: null,
      },
      true,
    );
  const selectView = (next: AdminView) =>
    updateQuery(
      {
        view: next,
        period: null,
        q: null,
        status: null,
        team: null,
        plan: null,
        page: null,
        agent: null,
        emails: null,
        onboarding: null,
        profile: null,
        link: null,
        visibility: null,
      },
      true,
    );
  const matchesRow = ({ agent, teamName, loginEmails }: AgentRow) =>
    matchesAgentSearch(search, [
      agent.name,
      agent.legalName,
      agent.email,
      agent.phone,
      agent.licenseNumber,
      teamName,
      ...(loginEmails || []).map((a) => a.email),
    ]);

  const pending = useMemo(
    () =>
      agents
        .filter((row) => Boolean(row.onboardingTasks?.tasks.length))
        .sort(
          (a, b) =>
            a.onboardingTasks!.priority - b.onboardingTasks!.priority ||
            String(a.agent.createdAt).localeCompare(String(b.agent.createdAt)),
        ),
    [agents],
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
      if (p.portal_agent_id != null && p.photo_url)
        map.set(p.portal_agent_id, p.photo_url);
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
  const filtered = agents.filter(
    (row) =>
      (status === "all" || row.agent.accountStatus === status) &&
      (!teamFilter ||
        (teamFilter === "none"
          ? !row.agent.teamId
          : String(row.agent.teamId) === teamFilter)) &&
      (!planFilter || normalizeAgentPlan(row.agent.plan) === planFilter) &&
      (params.get("incomplete") !== "1" || !setupFor(row).complete) &&
      matchesRow(row),
  );
  const pagination = paginate(filtered, params.get("page"), params.get("size"));
  const taskFilter = params.get("task") || "";
  const visiblePending = pending.filter((row) => {
    if (!matchesRow(row)) return false;
    if (taskFilter === "deferred")
      return Boolean(row.onboardingTasks?.deferred);
    if (taskFilter)
      return Boolean(
        row.onboardingTasks?.tasks.includes(
          taskFilter as keyof typeof TASK_LABELS,
        ),
      );
    return true;
  });
  const detailHref = (id: number) =>
    `/admin/agents/${id}?returnTo=${encodeURIComponent(listHref)}`;
  const emailHref = (id: number) => {
    const query = new URLSearchParams(params);
    query.delete("agent");
    query.set("emails", String(id));
    return `/admin/agents?${query}`;
  };

  const handleApprove = async (id: number) => {
    try {
      const publicProfileId = approvalLinks[id] || undefined;
      const res = await fetch(`/api/agents/${id}/approve`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ publicProfileId }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(String(data.error || t.couldNotApprove));
      toast.success(t.agentApproved);
      showSyncFeedback(data);
      fetchAgents();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t.couldNotApprove);
    }
  };

  const openOfflinePayment = (agent: Agent) => {
    setOfflineAgent(agent);
    setOfflineMethod("check");
    setOfflineReference("");
    setOfflineDate(nyDate());
    setOfflineAmount("");
    setOfflineKey(crypto.randomUUID());
    offlineSignatureRef.current = null;
  };

  const recordOfflinePayment = async () => {
    if (!offlineAgent) return;
    setOfflineSaving(true);
    try {
      const signature = JSON.stringify({
        agentId: offlineAgent.id,
        method: offlineMethod,
        reference: offlineReference,
        receivedAt: offlineDate,
        amount: offlineAmount,
      });
      const idempotencyKey =
        offlineSignatureRef.current === signature
          ? offlineKey
          : crypto.randomUUID();
      if (idempotencyKey !== offlineKey) setOfflineKey(idempotencyKey);
      offlineSignatureRef.current = signature;
      const res = await fetch("/api/onboarding/payments/offline", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          agentId: offlineAgent.id,
          method: offlineMethod,
          reference: offlineReference,
          receivedAt: offlineDate,
          amountCents: Math.round(Number(offlineAmount) * 100),
          idempotencyKey,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(String(data.error || t.saveFailed));
      toast.success(t.offlineRecorded);
      updateQuery({ onboarding: String(offlineAgent.id) });
      setOfflineAgent(null);
      fetchAgents();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t.saveFailed);
    } finally {
      setOfflineSaving(false);
    }
  };

  const handleRevoke = async (id: number) => {
    if (!confirm(t.confirmRevoke)) return;
    try {
      const res = await fetch(`/api/agents/${id}/approve`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error();
      toast.success(t.accessRevoked);
      fetchAgents();
    } catch {
      toast.error(t.couldNotRevoke);
    }
  };

  // Referrers ranked by how many people they've brought in.
  const referralLeaders = useMemo(() => {
    const byReferrer = new Map<
      number,
      { id: number; name: string; recruits: { id: number; name: string }[] }
    >();
    for (const { agent } of agents) {
      const refId = agent.referredByAgentId;
      if (refId == null) continue;
      const referrerName = nameByAgentId.get(refId);
      if (!referrerName) continue; // referrer no longer on the roster
      if (!byReferrer.has(refId))
        byReferrer.set(refId, { id: refId, name: referrerName, recruits: [] });
      byReferrer.get(refId)!.recruits.push({ id: agent.id, name: agent.name });
    }
    return [...byReferrer.values()].sort(
      (a, b) =>
        b.recruits.length - a.recruits.length || a.name.localeCompare(b.name),
    );
  }, [agents, nameByAgentId]);

  const updateField = (
    field: keyof Agent,
    value: string | number | boolean | null,
  ) => {
    if (!editAgent) return;
    setEditAgent({ ...editAgent, [field]: value });
  };

  const closeDialog = () => {
    updateQuery({ agent: null });
    setEditAgent(null);
    editingKeyRef.current = null;
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
        throw new Error(t.saveFailed);
      }
      const data = await res.json().catch(() => ({}));
      toast.success(editAgent.id ? t.agentSaved : t.agentCreated);
      showSyncFeedback(data);
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
    <div className="agents-workspace space-y-5">
      <PageHeader
        eyebrow={locale === "zh" ? "人员管理" : "People"}
        title={t.title}
        description={
          locale === "zh"
            ? "管理经纪人账号、入职进度、公司庆祝与官网展示。"
            : "Manage agent accounts, onboarding, celebrations and website profiles."
        }
        actions={
          view === "accounts" ? (
            <Btn
              variant="primary"
              icon={<Icons.Plus />}
              onClick={() => openAgent(emptyAgent)}
            >
              {t.addAgent}
            </Btn>
          ) : view === "onboarding" ? (
            <Link href="/admin/agents/invite" className="admin-control">
              {locale === "zh" ? "发邀请" : "Create invitation"}
            </Link>
          ) : undefined
        }
      />

      <FilterTabs
        value={view}
        onChange={selectView}
        options={[
          {
            id: "accounts",
            label: locale === "zh" ? "经纪人" : "Agents",
            count:
              (loading || loadError) && !agents.length
                ? undefined
                : agents.length,
          },
          {
            id: "onboarding",
            label:
              locale === "zh" ? "入职待办人数" : "People with onboarding tasks",
            count:
              (loading || loadError) && !agents.length
                ? undefined
                : pending.length,
          },
          { id: "birthdays", label: locale === "zh" ? "生日" : "Birthdays" },
          {
            id: "anniversaries",
            label: locale === "zh" ? "入职纪念日" : "Work anniversaries",
          },
          {
            id: "public",
            label: locale === "zh" ? "官网展示" : "Website",
            count:
              (publicRosterLoading || publicRosterUnreachable) &&
              !publicAgents.length
                ? undefined
                : publicAgents.length,
          },
        ]}
      />

      {(view === "birthdays" || view === "anniversaries") && (
        <CelebrationsConsole
          key={view}
          kind={view === "birthdays" ? "birthday" : "anniversary"}
        />
      )}
      {view === "public" && (
        <RosterConsole
          initialAgents={publicAgents}
          portalAgents={agents
            .filter(({ agent }) => agent.accountStatus === "active")
            .map(({ agent }) => ({
              id: agent.id,
              name: agent.name,
              email: agent.email,
              accountStatus: agent.accountStatus,
            }))}
          unreachable={publicRosterUnreachable}
          loading={publicRosterLoading}
          onAgentsChange={setPublicAgents}
          onRetry={fetchPublic}
          portalUnavailable={loadError || loading}
        />
      )}

      <div
        className={
          view === "accounts" || view === "onboarding" ? "contents" : "hidden"
        }
      >
        <Toolbar>
          <SearchInput
            value={search}
            onChange={setSearch}
            placeholder={t.searchPlaceholder}
          />
          {view === "onboarding" && (
            <select
              className="admin-control"
              aria-label={locale === "zh" ? "入职待办类型" : "Onboarding task"}
              value={taskFilter}
              onChange={(e) =>
                updateQuery({ task: e.target.value, page: null })
              }
            >
              {[
                ["", "全部待办", "All tasks"],
                ["profile", "待完善资料", "Incomplete profile"],
                ["signature", "待经纪人签署", "Awaiting agent signature"],
                ["issues", "签约异常", "Agreement issues"],
                ["countersign", "待公司会签", "Awaiting countersignature"],
                ["payment", "待付款", "Awaiting payment"],
                ["offline", "可审批开通", "Ready for approval"],
                ["contract_review", "线下合同待核验", "Verify contract"],
                ["receipt", "收款待匹配", "Reconcile receipt"],
                ["exception", "例外待补齐", "Temporary access · due"],
                ["expired", "例外已到期", "Temporary access expired"],
                ["deferred", "已暂缓 / 已关闭", "Deferred / closed intake"],
              ].map(([value, zh, en]) => (
                <option key={value} value={value}>
                  {locale === "zh" ? zh : en}
                </option>
              ))}
            </select>
          )}
          {view === "accounts" && (
            <>
              <select
                className="admin-control"
                aria-label={locale === "zh" ? "账号状态" : "Account status"}
                value={status}
                onChange={(e) =>
                  updateQuery({ status: e.target.value, page: null })
                }
              >
                {[
                  ["active", "在职", "Active"],
                  ["pending", "待开通", "Pending"],
                  ["inactive", "已停用", "Inactive"],
                  ["all", "全部账号", "All accounts"],
                ].map(([value, zh, en]) => (
                  <option key={value} value={value}>
                    {locale === "zh" ? zh : en}
                  </option>
                ))}
              </select>
              <select
                className="admin-control"
                aria-label={t.labelTeam}
                value={teamFilter}
                disabled={teamError}
                onChange={(e) =>
                  updateQuery({ team: e.target.value, page: null })
                }
              >
                <option value="">
                  {locale === "zh" ? "全部团队" : "All teams"}
                </option>
                <option value="none">{t.unassigned}</option>
                {teams.map((team) => (
                  <option key={team.id} value={team.id}>
                    {team.name}
                  </option>
                ))}
              </select>
              <select
                className="admin-control"
                aria-label={t.labelPlan}
                value={planFilter}
                onChange={(e) =>
                  updateQuery({ plan: e.target.value, page: null })
                }
              >
                <option value="">
                  {locale === "zh" ? "全部方案" : "All plans"}
                </option>
                {Object.entries(PLAN_LABELS[locale]).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
              <label className="flex items-center gap-2 text-xs">
                <input
                  type="checkbox"
                  checked={params.get("incomplete") === "1"}
                  onChange={(e) =>
                    updateQuery({
                      incomplete: e.target.checked ? "1" : null,
                      page: null,
                    })
                  }
                />
                {locale === "zh" ? "资料待完善" : "Incomplete setup"}
              </label>
            </>
          )}
        </Toolbar>
        {teamError && (
          <p role="alert" className="text-sm">
            {locale === "zh" ? "团队读取失败" : "Teams unavailable"}{" "}
            <button className="underline" onClick={() => void fetchTeams()}>
              {locale === "zh" ? "重试" : "Retry"}
            </button>
          </p>
        )}
        {loadError && (
          <div className="admin-notice" role="alert">
            {locale === "zh"
              ? "暂时无法读取账号，请重试。"
              : "Accounts could not be loaded. Please retry."}{" "}
            <button className="underline" onClick={() => void fetchAccounts()}>
              {locale === "zh" ? "重试" : "Retry"}
            </button>
          </div>
        )}
        {view === "onboarding" &&
          !loading &&
          !loadError &&
          !visiblePending.length && (
            <div className="admin-empty">
              {locale === "zh"
                ? "没有匹配的入职待办。"
                : "No matching onboarding tasks."}
            </div>
          )}

        {/* Pending approvals */}
        {view === "onboarding" && visiblePending.length > 0 && (
          <Card>
            <CardHeader
              title={t.pendingApprovals}
              subtitle={t.pendingSubtitle}
              action={
                <Pill tone="draft">
                  {visiblePending.length} {locale === "zh" ? "人" : "people"} ·{" "}
                  {visiblePending.reduce(
                    (total, row) =>
                      total + (row.onboardingTasks?.tasks.length || 0),
                    0,
                  )}{" "}
                  {locale === "zh" ? "项待办" : "tasks"}
                </Pill>
              }
            />
            <div className="divide-y" style={{ borderColor: tone.lineSoft }}>
              {visiblePending.map(
                ({ agent, loginEmails, onboardingPaymentChannel }) => {
                  const agentSigned = Boolean(
                    agent.agreementAgentSignedAt ||
                    agent.agreementStatus === "completed",
                  );
                  const workflow = onboardingWorkflow(
                    agent,
                    onboardingPaymentChannel || null,
                  );
                  return (
                    <div
                      key={agent.id}
                      className="grid items-start gap-4 px-5 py-4 sm:items-center sm:px-6 sm:[grid-template-columns:auto_1fr_auto]"
                      style={{ borderBottom: `1px solid ${tone.lineSoft}` }}
                    >
                      <div
                        className="w-10 h-10 rounded-full flex items-center justify-center font-medium"
                        style={{
                          background: tone.amberSoft,
                          color: tone.amber,
                          fontSize: 12,
                        }}
                      >
                        {initials(agent.name)}
                      </div>
                      <div>
                        <div
                          className="text-[14px]"
                          style={{ color: tone.ink }}
                        >
                          {agent.name}
                        </div>
                        <div
                          className="text-[12px] mt-0.5 font-mono"
                          style={{ color: tone.ink50 }}
                        >
                          {agent.email || t.noEmail}
                          {agent.joinedAt && (
                            <span>
                              {" "}
                              · {t.joined} {agent.joinedAt}
                            </span>
                          )}
                        </div>
                        {(loginEmails || []).filter(
                          (address) => !address.isPrimary,
                        ).length > 0 && (
                          <div
                            className="mt-0.5 truncate font-mono text-[11px]"
                            style={{ color: tone.accent }}
                          >
                            +{" "}
                            {(loginEmails || [])
                              .filter((address) => !address.isPrimary)
                              .map((address) => address.email)
                              .join(" · ")}
                          </div>
                        )}
                        <div
                          className="mt-1 flex flex-wrap gap-2 text-[11px]"
                          style={{ color: tone.ink50 }}
                        >
                          <span>
                            {t.agreement}:{" "}
                            {agentSigned &&
                            agent.agreementStatus !== "completed"
                              ? t.agentSignatureDone
                              : agreementStatusLabel(agent.agreementStatus)}
                          </span>
                          <span>·</span>
                          <span>
                            {t.payment}:{" "}
                            {paymentStatusLabel(agent.paymentStatus)}
                          </span>
                          <span>·</span>
                          <span>
                            {t.source}:{" "}
                            {agent.onboardingSource === "website"
                              ? t.websiteSource
                              : agent.onboardingSource}
                          </span>
                        </div>
                      </div>
                      <div className="col-span-full flex min-w-0 flex-wrap items-center gap-2 sm:col-span-1 sm:justify-end">
                        <Pill tone={workflow.canApprove ? "draft" : "neutral"}>
                          {(
                            agents.find((r) => r.agent.id === agent.id)
                              ?.onboardingTasks?.tasks || []
                          )
                            .map(
                              (task) =>
                                TASK_LABELS[task][locale === "zh" ? 0 : 1],
                            )
                            .join(" · ") ||
                            ONBOARDING_NEXT[workflow.next][
                              locale === "zh" ? 0 : 1
                            ]}
                        </Pill>
                        <Btn
                          variant="primary"
                          size="sm"
                          onClick={() =>
                            updateQuery({ onboarding: String(agent.id) })
                          }
                        >
                          {locale === "zh" ? "处理入职" : "Manage onboarding"}
                        </Btn>
                      </div>
                    </div>
                  );
                },
              )}
            </div>
          </Card>
        )}

        {view === "accounts" &&
          (loading && !agents.length ? (
            <div className="list-skeleton" role="status" aria-label={t.loading}>
              {Array.from({ length: 7 }, (_, i) => (
                <div key={i} />
              ))}
            </div>
          ) : !loadError && !filtered.length ? (
            <div className="admin-empty">
              <p>
                {locale === "zh" ? "没有匹配的经纪人。" : "No matching agents."}
              </p>
              <button
                className="admin-control mt-3"
                onClick={() =>
                  updateQuery({
                    status: "all",
                    team: null,
                    plan: null,
                    incomplete: null,
                    page: null,
                  })
                }
              >
                {locale === "zh" ? "在全部账号中查找" : "Search all accounts"}
              </button>
            </div>
          ) : (
            <div className="agent-list-surface">
              <table className="agent-table account-table">
                <thead>
                  <tr>
                    <th>{t.colAgent}</th>
                    <th>{t.colContact}</th>
                    <th>{t.labelTeam}</th>
                    <th>{t.colPlan}</th>
                    <th>{locale === "zh" ? "状态" : "Status"}</th>
                    <th>
                      <span className="sr-only">{t.edit}</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {pagination.items.map((row) => {
                    const { agent } = row;
                    const setup = setupFor(row);
                    return (
                      <tr key={agent.id}>
                        <td>
                          <Link
                            href={detailHref(agent.id)}
                            prefetch={false}
                            className="flex min-w-0 items-center gap-3"
                          >
                            <Avatar
                              name={agent.name}
                              src={photoFor(agent.id)}
                            />
                            <span className="min-w-0">
                              <span className="block font-medium break-words">
                                {agent.name}
                              </span>
                              <span className="secondary block">
                                {agent.licenseNumber || t.noLicense}
                              </span>
                            </span>
                          </Link>
                        </td>
                        <td className="account-contact">
                          <div className="break-all">
                            {agent.email || t.noEmail}
                          </div>
                          <div className="secondary">{agent.phone || "—"}</div>
                          {(row.loginEmails || [])
                            .filter((address) => !address.isPrimary)
                            .map((address) => (
                              <div
                                key={address.email}
                                className="secondary break-all"
                              >
                                {address.email}
                              </div>
                            ))}
                        </td>
                        <td className="account-team">
                          {row.teamName || t.unassigned}
                        </td>
                        <td className="account-plan">
                          <div>
                            {
                              PLAN_LABELS[locale][
                                normalizeAgentPlan(agent.plan)
                              ]
                            }
                          </div>
                          <div className="secondary">
                            {agent.practice
                              ? PRACTICE_LABELS[locale][agent.practice]
                              : PRACTICE_LABELS[locale].unset}
                          </div>
                        </td>
                        <td className="account-status">
                          <span
                            className={`status-label ${agent.accountStatus === "active" ? "is-visible" : ""}`}
                          >
                            {locale === "zh"
                              ? {
                                  active: "在职",
                                  pending: "待开通",
                                  inactive: "已停用",
                                }[agent.accountStatus]
                              : agent.accountStatus}
                          </span>
                          {!setup.complete && (
                            <div
                              className="secondary"
                              title={t.setupIncompleteHint}
                            >
                              {locale === "zh" ? "资料" : "Setup"}{" "}
                              {setup.completed}/{setup.total}
                            </div>
                          )}
                        </td>
                        <td className="account-actions">
                          <div className="flex flex-wrap justify-end gap-1">
                            <Link
                              className="row-action"
                              href={emailHref(agent.id)}
                            >
                              {locale === "zh" ? "邮箱" : "Emails"}
                            </Link>
                            <button
                              className="row-action"
                              onClick={() => openAgent(agent)}
                            >
                              {t.edit}
                            </button>
                            {agent.accountStatus === "inactive" && (
                              <button
                                className="row-action"
                                onClick={() => void handleApprove(agent.id)}
                              >
                                {t.reactivate}
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
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
                onChange={updateQuery}
              />
            </div>
          ))}

        {/* Who has recruited whom. Now that referrals are recorded, this turns
          the field into something actionable — recruiting credit, and a read
          on how the team is actually growing. */}
        {view === "accounts" && referralLeaders.length > 0 && (
          <details className="text-sm">
            <summary className="cursor-pointer py-3 text-ink-50">
              {t.referralLeaders} · {referralLeaders.length}
            </summary>
            <Card>
              <CardHeader
                title={t.referralLeaders}
                subtitle={t.referralLeadersSub}
                action={<Pill tone="neutral">{referralLeaders.length}</Pill>}
              />
              <div className="divide-y" style={{ borderColor: tone.lineSoft }}>
                {referralLeaders.map(({ id, name, recruits }) => (
                  <div
                    key={id}
                    className="flex items-center gap-3 px-5 py-3 sm:px-6"
                  >
                    <Avatar name={name} src={photoFor(id)} />
                    <div
                      className="min-w-0 flex-1 truncate text-[13.5px]"
                      style={{ color: tone.ink }}
                    >
                      {name}
                    </div>
                    <div
                      className="min-w-0 flex-1 truncate text-[12px]"
                      style={{ color: tone.ink50 }}
                    >
                      {recruits.map((r) => r.name).join(" · ")}
                    </div>
                    <Pill tone="accent">{recruits.length}</Pill>
                  </div>
                ))}
              </div>
            </Card>
          </details>
        )}
      </div>

      {offlineAgent && (
        <EditPanel
          title={t.offlineTitle}
          description={`${offlineAgent.name} · ${offlineAgent.email}`}
          onClose={() => setOfflineAgent(null)}
          saving={offlineSaving}
          dirty={Boolean(offlineReference || offlineAmount)}
          footer={
            <Btn
              variant="primary"
              onClick={() => void recordOfflinePayment()}
              disabled={
                offlineSaving ||
                offlineReference.trim().length < 3 ||
                !offlineDate || offlineDate > nyDate() || Number(offlineAmount) > 1000000 ||
                !/^\d+(\.\d{1,2})?$/.test(offlineAmount) ||
                Number(offlineAmount) <= 0
              }
            >
              {offlineSaving ? t.saving : t.offlineSave}
            </Btn>
          }
        >
          <p className="mb-5 text-sm text-stone-600">{t.offlineLead}</p>
          <fieldset
            disabled={offlineSaving}
            className="grid gap-4 sm:grid-cols-2"
          >
            <label className="text-sm">
              {t.offlineMethod}
              <select
                className="admin-control mt-2 w-full"
                value={offlineMethod}
                onChange={(event) => setOfflineMethod(event.target.value)}
              >
                <option value="check">
                  {locale === "zh" ? "支票" : "Check"}
                </option>
                <option value="cash">
                  {locale === "zh" ? "现金" : "Cash"}
                </option>
                <option value="ach">ACH</option>
                <option value="zelle">Zelle</option>
                <option value="wire">
                  {locale === "zh" ? "电汇" : "Wire"}
                </option>
                <option value="other">
                  {locale === "zh" ? "其他" : "Other"}
                </option>
              </select>
            </label>
            <label className="text-sm">
              {t.offlineDate}
              <input
                className="admin-control mt-2 w-full"
                type="date"
                max={nyDate()}
                value={offlineDate}
                onChange={(event) => setOfflineDate(event.target.value)}
              />
            </label>
            <label className="text-sm">
              {t.offlineAmount}
              <input
                className="admin-control mt-2 w-full"
                type="number"
                inputMode="decimal"
                min="0.01"
                max="1000000"
                step="0.01"
                value={offlineAmount}
                onChange={(event) => setOfflineAmount(event.target.value)}
                placeholder="0.00"
              />
            </label>
            <label className="text-sm">
              {t.offlineReference}
              <input
                className="admin-control mt-2 w-full"
                maxLength={120}
                value={offlineReference}
                onChange={(event) => setOfflineReference(event.target.value)}
              />
            </label>
          </fieldset>
        </EditPanel>
      )}

      {agents.find(
        (row) => String(row.agent.id) === params.get("onboarding"),
      ) &&
        (() => {
          const row = agents.find(
            (r) => String(r.agent.id) === params.get("onboarding"),
          )!;
          const close = () => {
            updateQuery({ onboarding: null });
            void fetchAgents();
          };
          return (
            <OnboardingPanel
              key={row.agent.id}
              agentId={row.agent.id}
              onClose={close}
              onChanged={() => {
                void fetchAgents();
              }}
              onEdit={() => {
                close();
                openAgent(row.agent);
              }}
              onOffline={() => {
                close();
                openOfflinePayment(row.agent);
              }}
              onApprove={() => handleApprove(row.agent.id)}
              approvalFields={
                <div className="space-y-3">
                  <label className="block text-sm">
                    {t.existingPublicProfile}
                    <select
                      className="admin-control mt-1 w-full"
                      disabled={publicRosterLoading}
                      value={approvalLinks[row.agent.id] || ""}
                      onChange={(e) =>
                        setApprovalLinks((current) => ({
                          ...current,
                          [row.agent.id]: e.target.value,
                        }))
                      }
                    >
                      <option value="">{t.noExistingPublicProfile}</option>
                      {unlinkedPublicAgents.map((profile) => (
                        <option key={profile.id} value={profile.id}>
                          {profile.name || profile.slug}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
              }
            />
          );
        })()}

      {emailAgent && (
        <AgentEmailsPanel
          key={emailAgent.id}
          agentId={emailAgent.id}
          name={emailAgent.name}
          onClose={() => updateQuery({ emails: null })}
          onMerged={() => {
            void fetchAccounts();
          }}
          onLinked={(email) =>
            setAgents((rows) =>
              rows.map((row) =>
                row.agent.id === emailAgent.id
                  ? {
                      ...row,
                      loginEmails: [
                        ...(row.loginEmails || []),
                        {
                          email,
                          isPrimary: false,
                          verifiedAt: new Date().toISOString(),
                        },
                      ],
                    }
                  : row,
              ),
            )
          }
        />
      )}

      {editAgent && !emailAgent && (
        <EditPanel
          title={
            editAgent.id ? editAgent.name || t.editAgentTitle : t.addAgentTitle
          }
          description={
            locale === "zh"
              ? "账号资料 · 姓名、电话与执照同步到官网"
              : "Account details · identity fields sync to the website"
          }
          dirty={JSON.stringify(editAgent) !== editBase.current}
          saving={saving}
          onClose={closeDialog}
          footer={
            <>
              <div className="flex items-center gap-3">
                {editAgent.id && (
                  <Link
                    className="text-sm underline"
                    href={detailHref(editAgent.id)}
                  >
                    {locale === "zh" ? "完整档案" : "Full profile"}
                  </Link>
                )}
                {editAgent.id && editAgent.accountStatus === "active" && (
                  <details className="relative">
                    <summary className="cursor-pointer text-sm">
                      {locale === "zh" ? "更多" : "More"}
                    </summary>
                    <button
                      className="row-action text-red-700"
                      onClick={() => {
                        void handleRevoke(editAgent.id!);
                      }}
                    >
                      {t.revokeAccess}
                    </button>
                  </details>
                )}
              </div>
              <Btn variant="primary" onClick={handleSave} disabled={saving}>
                {saving ? t.saving : t.save}
              </Btn>
            </>
          }
        >
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <LabeledField label={t.labelName}>
                <EditorialInput
                  value={editAgent.name || ""}
                  onChange={(v) => updateField("name", v)}
                  placeholder={t.namePlaceholder}
                />
              </LabeledField>
              <LabeledField label={t.labelEmail}>
                {editAgent.id ? (
                  <>
                    <input
                      className="admin-control w-full bg-stone-50"
                      value={editAgent.email || ""}
                      readOnly
                    />
                    <Link
                      className="mt-1 inline-block text-xs underline"
                      href={emailHref(editAgent.id)}
                    >
                      {locale === "zh" ? "管理登录邮箱" : "Manage login emails"}
                    </Link>
                  </>
                ) : (
                  <EditorialInput
                    value={editAgent.email || ""}
                    onChange={(v) => updateField("email", v)}
                    placeholder="agent@gmail.com"
                    mono
                  />
                )}
              </LabeledField>
              {editAgent.id && (
                <LabeledField label={t.labelTeam}>
                  <select
                    value={editAgent.teamId || ""}
                    onChange={(e) =>
                      updateField(
                        "teamId",
                        e.target.value ? Number(e.target.value) : null,
                      )
                    }
                    className="h-11 w-full rounded-lg px-3 text-[13.5px] outline-none sm:h-10"
                    style={{
                      background: tone.card,
                      border: `1px solid ${tone.line}`,
                      color: tone.ink,
                    }}
                  >
                    <option value="">{t.unassigned}</option>
                    {teams.map((team) => (
                      <option key={team.id} value={team.id}>
                        {team.name}
                      </option>
                    ))}
                  </select>
                </LabeledField>
              )}
              {editAgent.id && (
                <LabeledField label={t.labelPhone}>
                  <EditorialInput
                    value={editAgent.phone || ""}
                    onChange={(v) => updateField("phone", v)}
                    placeholder="(917) 555-0101"
                    mono
                  />
                </LabeledField>
              )}
              {editAgent.id && (
                <LabeledField label={t.labelLicense}>
                  <EditorialInput
                    value={editAgent.licenseNumber || ""}
                    onChange={(v) => updateField("licenseNumber", v)}
                    mono
                  />
                </LabeledField>
              )}
              {editAgent.id && (
                <LabeledField label={t.labelLicenseExpires}>
                  <EditorialInput
                    value={editAgent.licenseExpiresAt || ""}
                    onChange={(v) => updateField("licenseExpiresAt", v)}
                    type="date"
                    mono
                  />
                </LabeledField>
              )}
              {editAgent.id && (
                <LabeledField label={t.labelPlan}>
                  <select
                    value={normalizeAgentPlan(editAgent.plan)}
                    onChange={(e) => {
                      const plan = e.target
                        .value as (typeof CURRENT_AGENT_PLANS)[number];
                      setEditAgent((cur) =>
                        cur
                          ? { ...cur, plan, splitPct: PLAN_SPLIT_PCT[plan] }
                          : cur,
                      );
                    }}
                    className="w-full h-11 sm:h-10 rounded-lg px-3 text-[13.5px] outline-none"
                    style={{
                      background: tone.card,
                      border: `1px solid ${tone.line}`,
                      color: tone.ink,
                    }}
                  >
                    {normalizeAgentPlan(editAgent.plan) === "legacy_growth" ? (
                      <option value="legacy_growth" disabled>
                        {PLAN_LABELS[locale].legacy_growth} ·{" "}
                        {PLAN_SPLIT_PCT.legacy_growth}%
                      </option>
                    ) : null}
                    {CURRENT_AGENT_PLANS.map((planKey) => (
                      <option key={planKey} value={planKey}>
                        {PLAN_LABELS[locale][planKey]} ·{" "}
                        {PLAN_SPLIT_PCT[planKey]}%
                      </option>
                    ))}
                  </select>
                </LabeledField>
              )}
              {editAgent.id && (
                <LabeledField label={t.labelPractice}>
                  <select
                    value={editAgent.practice ?? ""}
                    onChange={(e) =>
                      updateField(
                        "practice",
                        e.target.value ? e.target.value : null,
                      )
                    }
                    className="w-full h-11 sm:h-10 rounded-lg px-3 text-[13.5px] outline-none"
                    style={{
                      background: tone.card,
                      border: `1px solid ${tone.line}`,
                      color: tone.ink,
                    }}
                  >
                    <option value="">{PRACTICE_LABELS[locale].unset}</option>
                    {AGENT_PRACTICES.map((k) => (
                      <option key={k} value={k}>
                        {PRACTICE_LABELS[locale][k]}
                      </option>
                    ))}
                  </select>
                </LabeledField>
              )}
              {editAgent.id && (
                <LabeledField label={t.labelCompany}>
                  <EditorialInput
                    value={editAgent.licensedCompany || ""}
                    onChange={(v) => updateField("licensedCompany", v)}
                  />
                </LabeledField>
              )}
              {editAgent.id && (
                <LabeledField label={t.labelJoined}>
                  <EditorialInput
                    value={editAgent.joinedAt || ""}
                    onChange={(v) => updateField("joinedAt", v)}
                    type="date"
                    mono
                  />
                </LabeledField>
              )}
              {editAgent.id && (
                <LabeledField label={t.labelLegalName}>
                  <EditorialInput
                    value={editAgent.legalName || ""}
                    onChange={(v) => updateField("legalName", v)}
                    placeholder={t.legalNamePlaceholder}
                  />
                </LabeledField>
              )}
              {editAgent.id && (
                <LabeledField label={t.labelReferredBy}>
                  <select
                    value={editAgent.referredByAgentId ?? ""}
                    onChange={(e) =>
                      updateField(
                        "referredByAgentId",
                        e.target.value ? Number(e.target.value) : null,
                      )
                    }
                    className="w-full h-11 sm:h-10 rounded-lg px-3 text-[13.5px] outline-none"
                    style={{
                      background: tone.card,
                      border: `1px solid ${tone.line}`,
                      color: tone.ink,
                    }}
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
                </LabeledField>
              )}
            </div>
            {editAgent.id && (
              <LabeledField label={t.labelNotes}>
                <textarea
                  value={editAgent.notes || ""}
                  onChange={(e) => updateField("notes", e.target.value)}
                  rows={3}
                  className="w-full rounded-lg p-3 text-[13.5px] outline-none"
                  style={{
                    background: tone.card,
                    border: `1px solid ${tone.line}`,
                    color: tone.ink,
                    resize: "vertical",
                  }}
                />
              </LabeledField>
            )}
          </div>
        </EditPanel>
      )}
    </div>
  );
}
