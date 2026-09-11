"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useListQuery, ListPagination } from "@/components/admin/list-controls";
import { EditPanel } from "@/components/admin/edit-panel";
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
import { onboardingPaymentProduct } from "@/lib/onboarding";
import { getCommerceProduct } from "@/lib/commerce/catalog";
import { onboardingLicenseTransferFeeCents } from "@/lib/plan-payments";

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
    pendingApprovals: "Pending approvals",
    pendingSubtitle:
      "Online onboarding activates after Stripe payment; approve only verified offline payments",
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
    offlineTitle: "Verify offline onboarding payment",
    offlineLead:
      "Use only after the signed fee was actually received. This creates the same finance and sponsor-reward records as Stripe.",
    offlineMethod: "Payment method",
    offlineDate: "Received date",
    offlineReference: "Receipt / check / transaction reference",
    offlineAmount: "Total received (plan + $20 license transfer)",
    offlineSave: "Verify payment",
    offlineRecorded: "Offline payment verified",
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
    pendingApprovals: "待审批",
    pendingSubtitle:
      "线上签约在 Stripe 付款后自动开通；这里只审批已核验的线下付款",
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
    offlineTitle: "核验线下入职付款",
    offlineLead:
      "仅在公司确实收到签约费用后登记；系统会像 Stripe 一样更新财务台账和 10% 推荐奖励。",
    offlineMethod: "付款方式",
    offlineDate: "收款日期",
    offlineReference: "收据 / 支票号 / 交易参考号",
    offlineAmount: "实收总额（方案费 + $20 执照转入费）",
    offlineSave: "确认已收款",
    offlineRecorded: "线下付款已核验",
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

type AdminView = "accounts" | "onboarding" | "public";

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
    params.get("view") === "public"
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
  const [approvalReferrers, setApprovalReferrers] = useState<
    Record<number, string>
  >({});
  const [loading, setLoading] = useState(true);
  const [editAgent, setEditAgent] = useState<Partial<Agent> | null>(null);
  const [saving, setSaving] = useState(false);
  const [offlineAgent, setOfflineAgent] = useState<Agent | null>(null);
  const [offlineMethod, setOfflineMethod] = useState("check");
  const [offlineReference, setOfflineReference] = useState("");
  const [offlineDate, setOfflineDate] = useState(() =>
    new Date().toISOString().slice(0, 10),
  );
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
  const editingKey = params.get("agent");
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
    updateQuery({ agent: agent.id ? String(agent.id) : "new" }, true);
  const selectView = (next: AdminView) =>
    updateQuery(
      {
        view: next,
        q: null,
        status: null,
        team: null,
        plan: null,
        page: null,
        agent: null,
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
    () => agents.filter((row) => row.agent.accountStatus === "pending"),
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
    const { agent, onboardingPaymentChannel } = row;
    const signed = Boolean(
      agent.agreementAgentSignedAt || agent.agreementStatus === "completed",
    );
    if (taskFilter === "signature") return !signed;
    if (taskFilter === "countersign")
      return signed && agent.agreementStatus !== "completed";
    if (taskFilter === "payment") return agent.paymentStatus === "pending";
    if (taskFilter === "offline")
      return (
        agent.paymentStatus === "paid" && onboardingPaymentChannel === "offline"
      );
    return true;
  });
  const detailHref = (id: number) =>
    `/admin/agents/${id}?returnTo=${encodeURIComponent(listHref)}`;

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
      if (!res.ok) throw new Error(String(data.error || t.couldNotApprove));
      toast.success(t.agentApproved);
      showSyncFeedback(data);
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

  const openOfflinePayment = (agent: Agent) => {
    const productKey = onboardingPaymentProduct(
      agent.plan,
      agent.affiliationTermMonths,
    );
    const product = productKey ? getCommerceProduct(productKey) : null;
    setOfflineAgent(agent);
    setOfflineMethod("check");
    setOfflineReference("");
    setOfflineDate(new Date().toISOString().slice(0, 10));
    setOfflineAmount(
      product
        ? (
            (product.amountCents +
              onboardingLicenseTransferFeeCents(agent, product.key)) /
            100
          ).toFixed(2)
        : "",
    );
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
            ? "管理经纪人账号、入职进度与官网展示。"
            : "Manage agent accounts, onboarding and website profiles."
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
            label: locale === "zh" ? "入职待办" : "Onboarding",
            count:
              (loading || loadError) && !agents.length
                ? undefined
                : pending.length,
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

      <div className={view !== "public" ? "contents" : "hidden"}>
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
                ["signature", "待经纪人签署", "Awaiting agent signature"],
                ["countersign", "待公司会签", "Awaiting countersignature"],
                ["payment", "待付款", "Awaiting payment"],
                ["offline", "线下已付待核验", "Offline payment review"],
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
              action={<Pill tone="draft">{pending.length}</Pill>}
            />
            <div className="divide-y" style={{ borderColor: tone.lineSoft }}>
              {visiblePending.map(
                ({ agent, loginEmails, onboardingPaymentChannel }) => {
                  const agentSigned = Boolean(
                    agent.agreementAgentSignedAt ||
                      agent.agreementStatus === "completed",
                  );
                  const canApproveOffline = Boolean(
                    agent.paymentStatus === "paid" &&
                      onboardingPaymentChannel === "offline",
                  );
                  const canApprove = canApproveOffline;
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
                        {canApprove && (
                          <label className="flex w-full min-w-0 flex-col gap-1 sm:w-auto sm:flex-none">
                            <span
                              className="text-[10.5px]"
                              style={{ color: tone.ink50 }}
                            >
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
                              style={{
                                borderColor: tone.line,
                                color: tone.ink,
                              }}
                            >
                              <option value="">
                                {publicRosterLoading
                                  ? t.loadingPublicProfiles
                                  : t.noExistingPublicProfile}
                              </option>
                              {unlinkedPublicAgents.map((profile) => (
                                <option key={profile.id} value={profile.id}>
                                  {profile.name || profile.slug} · /
                                  {profile.slug}
                                </option>
                              ))}
                            </select>
                          </label>
                        )}
                        {/* Captured here because approval is the one moment an admin
                      is already looking at this person; asked for later, it
                      rarely gets filled in. Optional. */}
                        {canApprove && (
                          <label className="flex w-full min-w-0 flex-col gap-1 sm:w-auto sm:flex-none">
                            <span
                              className="text-[10.5px]"
                              style={{ color: tone.ink50 }}
                            >
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
                              style={{
                                borderColor: tone.line,
                                color: tone.ink,
                              }}
                            >
                              <option value="">{t.noReferrer}</option>
                              {agents
                                .filter(
                                  ({ agent: a }) =>
                                    a.accountStatus === "active" &&
                                    a.id !== agent.id,
                                )
                                .map(({ agent: a }) => (
                                  <option key={a.id} value={a.id}>
                                    {a.name}
                                  </option>
                                ))}
                            </select>
                          </label>
                        )}
                        <Btn
                          variant="outline"
                          size="sm"
                          onClick={() => openAgent(agent)}
                        >
                          {t.edit}
                        </Btn>
                        {agentSigned &&
                          agent.paymentStatus !== "paid" &&
                          (agent.plan !== "team_member" ||
                            Boolean(agent.teamTermsAcceptedAt)) && (
                            <Btn
                              variant="outline"
                              size="sm"
                              onClick={() => openOfflinePayment(agent)}
                            >
                              {t.recordOffline}
                            </Btn>
                          )}
                        <Btn
                          variant="outline"
                          size="sm"
                          onClick={() => handleIgnore(agent.id)}
                        >
                          {t.ignore}
                        </Btn>
                        {agent.paymentStatus === "paid" &&
                          onboardingPaymentChannel === "stripe" && (
                            <span
                              className="text-[11px]"
                              style={{ color: tone.accent }}
                            >
                              {t.onlineActivationPending}
                            </span>
                          )}
                        {canApprove && (
                          <Btn
                            variant="primary"
                            size="sm"
                            icon={<Icons.Check />}
                            onClick={() => handleApprove(agent.id)}
                          >
                            {t.approve}
                          </Btn>
                        )}
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
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center p-4"
          style={{ background: "rgba(26, 24, 20, 0.45)" }}
          onClick={() => setOfflineAgent(null)}
        >
          <div
            className="w-full max-w-lg rounded-xl p-6"
            style={{ background: tone.card, border: `1px solid ${tone.line}` }}
            onClick={(event) => event.stopPropagation()}
          >
            <div className="font-serif text-[26px]" style={{ color: tone.ink }}>
              {t.offlineTitle}
            </div>
            <p
              className="mt-2 text-[13px] leading-6"
              style={{ color: tone.ink50 }}
            >
              {t.offlineLead}
            </p>
            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <LabeledField label={t.offlineMethod}>
                <select
                  className="h-11 w-full rounded-lg bg-white px-3 text-[13px]"
                  style={{ border: `1px solid ${tone.line}`, color: tone.ink }}
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
              </LabeledField>
              <LabeledField label={t.offlineDate}>
                <EditorialInput
                  type="date"
                  value={offlineDate}
                  onChange={setOfflineDate}
                />
              </LabeledField>
              <LabeledField label={t.offlineAmount}>
                <div
                  className="flex h-11 items-center rounded-lg bg-white px-3 font-mono text-[13px]"
                  style={{ border: `1px solid ${tone.line}`, color: tone.ink }}
                >
                  ${offlineAmount}
                </div>
              </LabeledField>
              <LabeledField label={t.offlineReference}>
                <EditorialInput
                  value={offlineReference}
                  onChange={setOfflineReference}
                />
              </LabeledField>
            </div>
            <div className="mt-6 flex justify-end gap-2">
              <Btn variant="outline" onClick={() => setOfflineAgent(null)}>
                {t.cancel}
              </Btn>
              <Btn
                variant="primary"
                onClick={() => void recordOfflinePayment()}
                disabled={offlineSaving || !offlineReference.trim()}
              >
                {offlineSaving ? t.saving : t.offlineSave}
              </Btn>
            </div>
          </div>
        </div>
      )}

      {editAgent && (
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
                    <p className="mt-1 text-xs text-ink-50">
                      {locale === "zh"
                        ? "登录邮箱需由本人在账号设置中验证变更。"
                        : "Login email changes require verification in account settings."}
                    </p>
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
