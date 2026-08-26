"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Btn, Card, EditorialInput, Icons, LabeledField, Pill } from "@/components/homix/primitives";
import { PageHeader } from "@/components/homix/page-kit";
import { fmtMoney, tone } from "@/components/homix/tokens";
import { useLocale } from "@/lib/i18n-client";
import {
  TEAM_CAP_CENTS_PRESETS,
  TEAM_SOURCED_SPLIT_PRESETS,
  TEAM_SPLIT_PRESETS,
} from "@/lib/team-compensation-policy";
import type { Agent, Team, TeamCompensationConfig, TeamLeaderApplication } from "@/db/schema";

const M = {
  en: {
    nameRequired: "Name is required",
    teamSaved: "Team saved",
    teamCreated: "Team created",
    saveFailed: "Save failed",
    confirmDelete: (name?: string | null) => `Delete "${name}"? Members will become unassigned.`,
    teamDeleted: "Team deleted",
    deleteFailed: "Delete failed",
    eyebrow: "Organization",
    title: "Teams",
    description: "Member groups with month-to-date production totals.",
    addTeam: "Add Team",
    loading: "Loading…",
    noTeams: "No teams yet",
    createFirst: "Create your first team",
    leader: "Leader",
    unassigned: "Unassigned",
    members: "members",
    forming: "Onboarding in progress",
    edit: "Edit",
    noMembers: "No members assigned.",
    noLicense: "No license",
    editLabel: "Edit",
    newLabel: "New",
    addTeamModal: "Add team",
    nameField: "Name *",
    namePlaceholder: "e.g. Manhattan",
    leaderField: "Leader",
    companyField: "Licensed company",
    notesField: "Notes",
    defaultSplit: "Default team split",
    leadSplit: "Team-generated lead split",
    teamCap: "Member team cap",
    noCap: "No team cap",
    effectiveFrom: "Effective from",
    delete: "Delete",
    cancel: "Cancel",
    saving: "Saving…",
    save: "Save",
    invite: "Create company invitation",
    inviteTitle: "Create company invitation",
    inviteSource: "Source",
    inviteCompany: "Licensed company",
    inviteEmail: "Email (optional)",
    invitePlan: "Commission plan",
    inviteTerm: "Affiliation term",
    inviteTeam: "Team (required for Team Member)",
    inviteSponsor: "Sponsor (optional)",
    createInvite: "Create link",
    inviteCreated: "Invitation created",
    copyInvite: "Copy link",
    inviteSummary: "Invitation summary",
    months12: "12 months",
    months24: "24 months",
    general: "Any email",
    applications: "Team Leader applications",
    noApplications: "No applications awaiting review.",
    expectedMembers: "expected members",
    proposedSplit: "proposed Team Split",
    review: "Review",
    approveApplication: "Approve and create forming team",
    declineApplication: "Decline application",
    decisionReason: "Decision note (optional)",
    applicationApproved: "Application approved; forming team and v1 terms created",
    applicationDeclined: "Application declined",
  },
  zh: {
    nameRequired: "请填写名称",
    teamSaved: "团队已保存",
    teamCreated: "团队已创建",
    saveFailed: "保存失败",
    confirmDelete: (name?: string | null) => `删除“${name}”？成员将变为未分配。`,
    teamDeleted: "团队已删除",
    deleteFailed: "删除失败",
    eyebrow: "组织",
    title: "团队",
    description: "成员分组及本月至今业绩合计。",
    addTeam: "添加团队",
    loading: "加载中…",
    noTeams: "暂无团队",
    createFirst: "创建第一个团队",
    leader: "负责人",
    unassigned: "未分配",
    members: "名成员",
    forming: "启用流程进行中",
    edit: "编辑",
    noMembers: "暂无分配成员。",
    noLicense: "无执照",
    editLabel: "编辑",
    newLabel: "新建",
    addTeamModal: "添加团队",
    nameField: "名称 *",
    namePlaceholder: "例如 Manhattan",
    leaderField: "负责人",
    companyField: "持牌公司",
    notesField: "备注",
    defaultSplit: "默认团队分成",
    leadSplit: "团队客源分成",
    teamCap: "成员团队封顶",
    noCap: "团队不封顶",
    effectiveFrom: "生效日期",
    delete: "删除",
    cancel: "取消",
    saving: "保存中…",
    save: "保存",
    invite: "创建公司邀请",
    inviteTitle: "创建公司邀请",
    inviteSource: "来源",
    inviteCompany: "持牌公司",
    inviteEmail: "限定邮箱（可选）",
    invitePlan: "佣金方案",
    inviteTerm: "合作期限",
    inviteTeam: "团队（Team Member 必填）",
    inviteSponsor: "Sponsor / 介绍人（可选）",
    createInvite: "生成链接",
    inviteCreated: "邀请链接已生成",
    copyInvite: "复制链接",
    inviteSummary: "邀请确认摘要",
    months12: "12 个月",
    months24: "24 个月",
    general: "不限邮箱",
    applications: "Team Leader 申请",
    noApplications: "暂无待审核申请。",
    expectedMembers: "名预计成员",
    proposedSplit: "拟定 Team Split",
    review: "审核",
    approveApplication: "批准并创建筹备中团队",
    declineApplication: "不批准申请",
    decisionReason: "审核备注（可选）",
    applicationApproved: "申请已批准，已创建筹备中团队及 v1 条款",
    applicationDeclined: "申请已拒绝",
  },
} as const;

type TeamRow = {
  team: Team;
  compensationConfig: TeamCompensationConfig | null;
  leader: Agent | null;
  members: Agent[];
  memberCount: number;
  mtdDeals: number;
  mtdTake: number;
};

type TeamEdit = Partial<Team> & {
  defaultTeamSplitPct?: number;
  teamLeadSplitPct?: number;
  teamCapCents?: number | null;
  effectiveFrom?: string;
};

type ApplicationRow = {
  application: TeamLeaderApplication;
  applicantName: string;
  applicantEmail: string;
  applicantCompany: string | null;
  teamName: string | null;
  teamStatus: string | null;
};

const emptyTeam: TeamEdit = {
  name: "",
  companyId: null,
  leaderAgentId: null,
  notes: "",
  defaultTeamSplitPct: 10,
  teamLeadSplitPct: 10,
  teamCapCents: null,
  effectiveFrom: new Date().toISOString().slice(0, 10),
};

export default function TeamsConsole() {
  const [teams, setTeams] = useState<TeamRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [editTeam, setEditTeam] = useState<TeamEdit | null>(null);
  const [saving, setSaving] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteSaving, setInviteSaving] = useState(false);
  const [inviteUrl, setInviteUrl] = useState("");
  const [inviteSource, setInviteSource] = useState("direct");
  const [inviteCompanyId, setInviteCompanyId] = useState("");
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteTeamId, setInviteTeamId] = useState("");
  const [inviteSponsorId, setInviteSponsorId] = useState("");
  const [invitePlan, setInvitePlan] = useState("solo");
  const [inviteTerm, setInviteTerm] = useState("12");
  const [sponsorAgents, setSponsorAgents] = useState<Agent[]>([]);
  const [applications, setApplications] = useState<ApplicationRow[]>([]);
  const [reviewApplication, setReviewApplication] = useState<ApplicationRow | null>(null);
  const [reviewSaving, setReviewSaving] = useState(false);
  const [reviewTeamName, setReviewTeamName] = useState("");
  const [reviewTeamSplit, setReviewTeamSplit] = useState(10);
  const [reviewLeadSplit, setReviewLeadSplit] = useState(10);
  const [reviewCap, setReviewCap] = useState<number | null>(null);
  const [reviewReason, setReviewReason] = useState("");
  const locale = useLocale();
  const t = M[locale];

  const load = () => {
    setLoading(true);
    Promise.all([
      fetch("/api/teams").then((r) => r.json()),
      fetch("/api/agents").then((r) => (r.ok ? r.json() : [])),
      fetch("/api/team-leader-applications").then((r) => (r.ok ? r.json() : [])),
    ])
      .then(([teamRows, agentRows, applicationRows]) => {
        setTeams(teamRows);
        setApplications(applicationRows);
        setSponsorAgents(
          (agentRows as Array<{ agent: Agent }>)
            .map((row) => row.agent)
            .filter((agent) => agent.accountStatus === "active"),
        );
      })
      .finally(() => setLoading(false));
  };

  function openApplicationReview(row: ApplicationRow) {
    setReviewApplication(row);
    setReviewTeamName(row.application.proposedTeamName);
    setReviewTeamSplit(row.application.proposedTeamSplitPct);
    setReviewLeadSplit(row.application.proposedTeamSplitPct);
    setReviewCap(null);
    setReviewReason("");
  }

  async function decideApplication(action: "approve" | "decline") {
    if (!reviewApplication) return;
    setReviewSaving(true);
    try {
      const response = await fetch(`/api/team-leader-applications/${reviewApplication.application.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action,
          teamName: reviewTeamName,
          defaultTeamSplitPct: reviewTeamSplit,
          teamLeadSplitPct: reviewLeadSplit,
          teamCapCents: reviewCap,
          decisionReason: reviewReason,
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || t.saveFailed);
      toast.success(action === "approve" ? t.applicationApproved : t.applicationDeclined);
      setReviewApplication(null);
      load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t.saveFailed);
    } finally {
      setReviewSaving(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  const updateField = (field: keyof TeamEdit, value: string | number | null) => {
    if (!editTeam) return;
    setEditTeam({ ...editTeam, [field]: value });
  };

  const handleSave = async () => {
    if (!editTeam?.name?.trim()) {
      toast.error(t.nameRequired);
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/teams", {
        method: editTeam.id ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editTeam),
      });
      if (!res.ok) throw new Error();
      toast.success(editTeam.id ? t.teamSaved : t.teamCreated);
      setEditTeam(null);
      load();
    } catch {
      toast.error(t.saveFailed);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!editTeam?.id) return;
    if (!confirm(t.confirmDelete(editTeam.name))) return;
    try {
      const res = await fetch("/api/teams", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: editTeam.id }),
      });
      if (!res.ok) throw new Error();
      toast.success(t.teamDeleted);
      setEditTeam(null);
      load();
    } catch {
      toast.error(t.deleteFailed);
    }
  };

  const createInvitation = async () => {
    setInviteSaving(true);
    try {
      const response = await fetch("/api/onboarding/invitations", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          kind: "admin",
          source: inviteSource,
          licensedCompanyId: inviteCompanyId,
          email: inviteEmail || null,
          teamId: invitePlan === "team_member" ? inviteTeamId || null : null,
          sponsorAgentId: inviteSponsorId || null,
          plan: invitePlan,
          affiliationTermMonths: Number(inviteTerm),
          maxUses: inviteEmail ? 1 : 100,
        }),
      });
      const data = await response.json();
      if (!response.ok || !data.url) throw new Error();
      setInviteUrl(data.url);
      toast.success(t.inviteCreated);
    } catch {
      toast.error(t.saveFailed);
    } finally {
      setInviteSaving(false);
    }
  };

  return (
    <div className="space-y-7">
      <PageHeader
        eyebrow={t.eyebrow}
        title={t.title}
        description={t.description}
        actions={<div className="flex flex-wrap gap-2">
          <Btn variant="outline" onClick={() => { setInviteUrl(""); setInviteOpen(true); }}>
            {t.invite}
          </Btn>
          <Btn variant="primary" icon={<Icons.Plus />} onClick={() => setEditTeam(emptyTeam)}>
            {t.addTeam}
          </Btn>
        </div>}
      />

      <Card className="overflow-hidden">
        <div className="border-b border-line px-5 py-4 sm:px-6">
          <h2 className="font-serif text-[24px]" style={{ color: tone.ink }}>{t.applications}</h2>
        </div>
        {applications.filter((row) => row.application.status === "submitted").length === 0 ? (
          <p className="px-5 py-6 text-[13px] sm:px-6" style={{ color: tone.ink50 }}>{t.noApplications}</p>
        ) : applications.filter((row) => row.application.status === "submitted").map((row) => (
          <div key={row.application.id} className="flex flex-col gap-4 border-b border-line px-5 py-5 last:border-b-0 sm:flex-row sm:items-center sm:justify-between sm:px-6">
            <div className="min-w-0">
              <div className="text-[16px] font-medium" style={{ color: tone.ink }}>{row.applicantName}</div>
              <div className="mt-1 text-[12px] font-mono" style={{ color: tone.ink50 }}>{row.applicantEmail}</div>
              <div className="mt-2 text-[13px]" style={{ color: tone.ink70 }}>
                {row.application.proposedTeamName} · {row.application.expectedMemberCount} {t.expectedMembers} · {row.application.proposedTeamSplitPct}% {t.proposedSplit}
              </div>
              <p className="mt-2 line-clamp-2 text-[12.5px]" style={{ color: tone.ink50 }}>{row.application.positioning}</p>
            </div>
            <Btn variant="outline" size="sm" onClick={() => openApplicationReview(row)}>{t.review}</Btn>
          </div>
        ))}
      </Card>

      {loading ? (
        <p className="text-[13px]" style={{ color: tone.ink50 }}>
          {t.loading}
        </p>
      ) : teams.length === 0 ? (
        <Card className="overflow-hidden">
          <div className="px-6 py-16 text-center">
            <div className="font-serif mb-2" style={{ fontSize: 24, color: tone.ink }}>
              {t.noTeams}
            </div>
            <button className="text-[13px] underline" style={{ color: tone.accent }} onClick={() => setEditTeam(emptyTeam)}>
              {t.createFirst}
            </button>
          </div>
        </Card>
      ) : (
        <Card className="overflow-hidden">
          {teams.map((row, index) => {
            const expanded = expandedId === row.team.id;
            return (
              <div key={row.team.id} style={{ borderBottom: index < teams.length - 1 ? `1px solid ${tone.lineSoft}` : "none" }}>
                <div
                  role="button"
                  tabIndex={0}
                  onClick={() => setExpandedId(expanded ? null : row.team.id)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      setExpandedId(expanded ? null : row.team.id);
                    }
                  }}
                  className="grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-4 py-5 text-left transition-colors hover:bg-[#FAF7F0] sm:px-6 md:grid-cols-[2fr_1fr_1fr_1fr_120px]"
                >
                  <div>
                    <div className="font-serif" style={{ fontSize: 22, color: tone.ink }}>
                      {row.team.name}
                    </div>
                    <div className="text-[12px] mt-1" style={{ color: tone.ink50 }}>
                      {t.leader}: {row.leader?.name || t.unassigned}
                    </div>
                    <div className="mt-2 md:hidden">
                      <Pill tone="neutral">{row.memberCount} {t.members}</Pill>
                    </div>
                  </div>
                  <div className="hidden md:block">
                    <Pill tone="neutral">{row.memberCount} {t.members}</Pill>
                  </div>
                  <div className="hidden font-serif md:block" style={{ fontSize: 22, color: tone.ink }}>
                    {row.mtdDeals}
                  </div>
                  <div className="hidden font-serif md:block" style={{ fontSize: 22, color: tone.green }}>
                    ${fmtMoney(row.mtdTake)}
                  </div>
                  <div className="flex justify-end gap-2">
                    {row.team.status === "forming" ? (
                      <Pill tone="draft">{t.forming}</Pill>
                    ) : (
                      <Btn
                        variant="ghost"
                        size="sm"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          setEditTeam({
                            ...row.team,
                            defaultTeamSplitPct: row.compensationConfig?.defaultTeamSplitPct ?? 10,
                            teamLeadSplitPct: row.compensationConfig?.teamLeadSplitPct ?? 10,
                            teamCapCents: row.compensationConfig?.teamCapCents ?? null,
                            effectiveFrom: new Date().toISOString().slice(0, 10),
                          });
                        }}
                      >
                        {t.edit}
                      </Btn>
                    )}
                  </div>
                </div>
                {expanded && (
                  <div className="px-4 pb-5 sm:px-6">
                    <div className="rounded-xl p-4" style={{ background: tone.paper, border: `1px solid ${tone.lineSoft}` }}>
                      {row.members.length === 0 ? (
                        <div className="text-[13px]" style={{ color: tone.ink50 }}>
                          {t.noMembers}
                        </div>
                      ) : (
                        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-3">
                          {row.members.map((member) => (
                            <div key={member.id} className="rounded-lg p-3" style={{ background: tone.card, border: `1px solid ${tone.line}` }}>
                              <div className="text-[13.5px]" style={{ color: tone.ink }}>
                                {member.name}
                              </div>
                              <div className="mt-1 text-[11.5px] font-mono" style={{ color: tone.ink50 }}>
                                {member.licenseNumber || t.noLicense} · {Number(member.splitPct || 0)}%
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </Card>
      )}

      {editTeam && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-8" style={{ background: "rgba(26, 24, 20, 0.4)", backdropFilter: "blur(4px)" }} onClick={() => setEditTeam(null)}>
          <div className="w-full max-w-xl rounded-2xl overflow-hidden" style={{ background: tone.card, border: `1px solid ${tone.line}`, boxShadow: "0 30px 80px -20px rgba(0,0,0,0.3)" }} onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between gap-4 px-5 py-4 sm:px-8 sm:py-6" style={{ borderBottom: `1px solid ${tone.line}` }}>
              <div>
                <div className="text-[11px] uppercase tracking-[0.14em]" style={{ color: tone.ink50 }}>
                  {editTeam.id ? t.editLabel : t.newLabel}
                </div>
                <div className="font-serif" style={{ fontSize: 26, color: tone.ink }}>
                  {editTeam.id ? editTeam.name : t.addTeamModal}
                </div>
              </div>
              <button onClick={() => setEditTeam(null)} className="h-10 w-10 rounded-full sm:h-8 sm:w-8" style={{ background: tone.paperDeep, color: tone.ink70 }}>
                x
              </button>
            </div>
            <div className="space-y-4 px-5 py-5 sm:px-8 sm:py-6">
              <LabeledField label={t.nameField}>
                <EditorialInput value={editTeam.name || ""} onChange={(v) => updateField("name", v)} placeholder={t.namePlaceholder} />
              </LabeledField>
              <LabeledField label={t.leaderField}>
                <select
                  value={editTeam.leaderAgentId || ""}
                  onChange={(e) => updateField("leaderAgentId", e.target.value ? Number(e.target.value) : null)}
                  className="h-11 w-full rounded-lg px-3 text-[13.5px] outline-none sm:h-10"
                  style={{ background: tone.card, border: `1px solid ${tone.line}`, color: tone.ink }}
                >
                  <option value="">{t.unassigned}</option>
                  {teams.flatMap((row) => row.members).map((agent) => (
                    <option key={agent.id} value={agent.id}>
                      {agent.name}
                    </option>
                  ))}
                </select>
              </LabeledField>
              <LabeledField label={t.companyField}>
                <select
                  value={editTeam.companyId || ""}
                  onChange={(event) => updateField("companyId", event.target.value)}
                  disabled={Boolean(editTeam.id)}
                  className="h-11 w-full rounded-lg border border-line bg-white px-3 text-[13px] disabled:opacity-50"
                >
                  <option value="">{t.unassigned}</option>
                  <option value="homix_realty">Homix Realty Inc.</option>
                  <option value="homix_living">Homix Living Inc.</option>
                </select>
              </LabeledField>
              <LabeledField label={t.notesField}>
                <textarea
                  value={editTeam.notes || ""}
                  onChange={(e) => updateField("notes", e.target.value)}
                  rows={3}
                  className="w-full rounded-lg p-3 text-[13.5px] outline-none"
                  style={{ background: tone.card, border: `1px solid ${tone.line}`, color: tone.ink, resize: "vertical" }}
                />
              </LabeledField>
              {editTeam.id && (
                <div className="grid gap-4 sm:grid-cols-2">
                  <LabeledField label={t.defaultSplit}>
                    <select value={editTeam.defaultTeamSplitPct ?? 10} onChange={(e) => updateField("defaultTeamSplitPct", Number(e.target.value))} className="h-11 w-full rounded-lg px-3 text-[13.5px] sm:h-10" style={{ background: tone.card, border: `1px solid ${tone.line}`, color: tone.ink }}>
                      {TEAM_SPLIT_PRESETS.map((value) => <option key={value} value={value}>{value}%</option>)}
                    </select>
                  </LabeledField>
                  <LabeledField label={t.leadSplit}>
                    <select value={editTeam.teamLeadSplitPct ?? 10} onChange={(e) => updateField("teamLeadSplitPct", Number(e.target.value))} className="h-11 w-full rounded-lg px-3 text-[13.5px] sm:h-10" style={{ background: tone.card, border: `1px solid ${tone.line}`, color: tone.ink }}>
                      {TEAM_SOURCED_SPLIT_PRESETS.map((value) => <option key={value} value={value}>{value}%</option>)}
                    </select>
                  </LabeledField>
                  <LabeledField label={t.teamCap}>
                    <select value={editTeam.teamCapCents ?? ""} onChange={(e) => updateField("teamCapCents", e.target.value ? Number(e.target.value) : null)} className="h-11 w-full rounded-lg px-3 text-[13.5px] sm:h-10" style={{ background: tone.card, border: `1px solid ${tone.line}`, color: tone.ink }}>
                      <option value="">{t.noCap}</option>
                      {TEAM_CAP_CENTS_PRESETS.map((value) => <option key={value} value={value}>${(value / 100).toLocaleString()}</option>)}
                    </select>
                  </LabeledField>
                  <LabeledField label={t.effectiveFrom}>
                    <EditorialInput value={editTeam.effectiveFrom || ""} onChange={(value) => updateField("effectiveFrom", value)} type="date" mono />
                  </LabeledField>
                </div>
              )}
            </div>
            <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4 sm:px-8 sm:py-5" style={{ borderTop: `1px solid ${tone.line}`, background: tone.paper }}>
              <div>
                {editTeam.id && (
                  <Btn variant="danger" size="sm" icon={<Icons.Trash />} onClick={handleDelete}>
                    {t.delete}
                  </Btn>
                )}
              </div>
              <div className="flex items-center gap-2">
                <Btn variant="outline" onClick={() => setEditTeam(null)}>
                  {t.cancel}
                </Btn>
                <Btn variant="primary" onClick={handleSave} disabled={saving}>
                  {saving ? t.saving : t.save}
                </Btn>
              </div>
            </div>
          </div>
        </div>
      )}

      {reviewApplication && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(26,24,20,.4)", backdropFilter: "blur(4px)" }} onClick={() => setReviewApplication(null)}>
          <div className="w-full max-w-xl rounded-xl border border-line bg-white p-6" onClick={(event) => event.stopPropagation()}>
            <div className="flex items-center justify-between gap-4">
              <div>
                <div className="text-[11px] uppercase tracking-[0.12em]" style={{ color: tone.ink50 }}>{t.applications}</div>
                <h2 className="font-serif text-[27px]">{reviewApplication.applicantName}</h2>
              </div>
              <button type="button" aria-label={t.cancel} className="flex size-9 items-center justify-center rounded-md bg-paper-deep" onClick={() => setReviewApplication(null)}><Icons.Close /></button>
            </div>
            <p className="mt-4 text-[13px] leading-6" style={{ color: tone.ink70 }}>{reviewApplication.application.positioning}</p>
            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <LabeledField label={t.nameField}><EditorialInput value={reviewTeamName} onChange={setReviewTeamName} /></LabeledField>
              <LabeledField label={t.defaultSplit}>
                <select value={reviewTeamSplit} onChange={(event) => setReviewTeamSplit(Number(event.target.value))} className="h-11 w-full rounded-lg border border-line bg-white px-3 text-[13px]">
                  {TEAM_SPLIT_PRESETS.map((value) => <option key={value} value={value}>{value}%</option>)}
                </select>
              </LabeledField>
              <LabeledField label={t.leadSplit}>
                <select value={reviewLeadSplit} onChange={(event) => setReviewLeadSplit(Number(event.target.value))} className="h-11 w-full rounded-lg border border-line bg-white px-3 text-[13px]">
                  {TEAM_SOURCED_SPLIT_PRESETS.map((value) => <option key={value} value={value}>{value}%</option>)}
                </select>
              </LabeledField>
              <LabeledField label={t.teamCap}>
                <select value={reviewCap ?? ""} onChange={(event) => setReviewCap(event.target.value ? Number(event.target.value) : null)} className="h-11 w-full rounded-lg border border-line bg-white px-3 text-[13px]">
                  <option value="">{t.noCap}</option>
                  {TEAM_CAP_CENTS_PRESETS.map((value) => <option key={value} value={value}>${(value / 100).toLocaleString()}</option>)}
                </select>
              </LabeledField>
              <LabeledField label={t.decisionReason} wide>
                <textarea value={reviewReason} onChange={(event) => setReviewReason(event.target.value)} rows={3} className="w-full rounded-lg border border-line bg-white p-3 text-[13px] outline-none" />
              </LabeledField>
            </div>
            <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Btn variant="danger" onClick={() => void decideApplication("decline")} disabled={reviewSaving}>{t.declineApplication}</Btn>
              <Btn variant="primary" onClick={() => void decideApplication("approve")} disabled={reviewSaving}>{reviewSaving ? t.saving : t.approveApplication}</Btn>
            </div>
          </div>
        </div>
      )}

      {inviteOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(26, 24, 20, 0.4)", backdropFilter: "blur(4px)" }} onClick={() => setInviteOpen(false)}>
          <div className="w-full max-w-lg rounded-xl border border-line bg-white p-6" onClick={(event) => event.stopPropagation()}>
            <div className="flex items-center justify-between gap-4">
              <h2 className="font-serif text-[26px]">{t.inviteTitle}</h2>
              <button type="button" aria-label={t.cancel} className="flex size-9 items-center justify-center rounded-md bg-paper-deep" onClick={() => setInviteOpen(false)}>
                <Icons.Close />
              </button>
            </div>
            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <LabeledField label={t.inviteSource}>
                <select value={inviteSource} onChange={(event) => setInviteSource(event.target.value)} className="h-11 w-full rounded-lg border border-line bg-white px-3 text-[13px]">
                  <option value="direct">Direct</option>
                  <option value="exp">eXp</option>
                  <option value="real">Real</option>
                  <option value="voro">Voro</option>
                  <option value="other">Other</option>
                </select>
              </LabeledField>
              <LabeledField label={t.inviteCompany}>
                <select
                  value={inviteCompanyId}
                  onChange={(event) => {
                    setInviteCompanyId(event.target.value);
                    setInviteTeamId("");
                  }}
                  className="h-11 w-full rounded-lg border border-line bg-white px-3 text-[13px]"
                >
                  <option value="">{t.unassigned}</option>
                  <option value="homix_realty">Homix Realty Inc.</option>
                  <option value="homix_living">Homix Living Inc.</option>
                </select>
              </LabeledField>
              <LabeledField label={t.inviteEmail}>
                <EditorialInput value={inviteEmail} onChange={setInviteEmail} type="email" />
              </LabeledField>
              <LabeledField label={t.invitePlan}>
                <select value={invitePlan} onChange={(event) => {
                  setInvitePlan(event.target.value);
                  if (event.target.value === "solo_pro") setInviteTerm("12");
                }} className="h-11 w-full rounded-lg border border-line bg-white px-3 text-[13px]">
                  <option value="solo">Solo</option>
                  <option value="solo_pro">Solo Pro</option>
                  <option value="team_member">Team Member</option>
                </select>
              </LabeledField>
              <LabeledField label={t.inviteTerm}>
                <select value={inviteTerm} onChange={(event) => setInviteTerm(event.target.value)} disabled={invitePlan === "solo_pro"} className="h-11 w-full rounded-lg border border-line bg-white px-3 text-[13px] disabled:opacity-50">
                  <option value="12">{t.months12}</option>
                  <option value="24">{t.months24}</option>
                </select>
              </LabeledField>
              <LabeledField label={t.inviteTeam}>
                <select value={inviteTeamId} onChange={(event) => {
                  setInviteTeamId(event.target.value);
                  const selected = teams.find((row) => String(row.team.id) === event.target.value);
                  if (selected?.team.companyId) setInviteCompanyId(selected.team.companyId);
                }} disabled={invitePlan !== "team_member"} className="h-11 w-full rounded-lg border border-line bg-white px-3 text-[13px] disabled:opacity-50">
                  <option value="">{t.unassigned}</option>
                  {teams
                    .filter((row) => !inviteCompanyId || row.team.companyId === inviteCompanyId)
                    .map((row) => <option key={row.team.id} value={row.team.id}>{row.team.name}</option>)}
                </select>
              </LabeledField>
              <LabeledField label={t.inviteSponsor}>
                <select value={inviteSponsorId} onChange={(event) => setInviteSponsorId(event.target.value)} className="h-11 w-full rounded-lg border border-line bg-white px-3 text-[13px]">
                  <option value="">{t.unassigned}</option>
                  {sponsorAgents.map((agent) => (
                    <option key={agent.id} value={agent.id}>{agent.name}</option>
                  ))}
                </select>
              </LabeledField>
            </div>
            <div className="mt-5 rounded-lg bg-paper p-3 text-[12.5px] leading-6" style={{ color: tone.ink70 }}>
              <div className="text-[10px] font-semibold uppercase tracking-[0.1em]" style={{ color: tone.ink50 }}>{t.inviteSummary}</div>
              <div>{inviteEmail || t.general} · {inviteCompanyId === "homix_realty" ? "Homix Realty Inc." : inviteCompanyId === "homix_living" ? "Homix Living Inc." : t.unassigned}</div>
              <div>{invitePlan.replaceAll("_", " ")} · {inviteTerm} {locale === "zh" ? "个月" : "months"}</div>
              <div>{invitePlan === "team_member" ? teams.find((row) => String(row.team.id) === inviteTeamId)?.team.name || t.unassigned : t.unassigned} · {sponsorAgents.find((agent) => String(agent.id) === inviteSponsorId)?.name || t.unassigned}</div>
            </div>
            {inviteUrl && (
              <div className="mt-5 rounded-lg bg-paper p-3">
                <div className="break-all font-mono text-[12px]">{inviteUrl}</div>
                <Btn variant="outline" className="mt-3 w-full justify-center" onClick={() => void navigator.clipboard.writeText(inviteUrl)}>{t.copyInvite}</Btn>
              </div>
            )}
            <div className="mt-5 flex justify-end gap-2">
              <Btn variant="outline" onClick={() => setInviteOpen(false)}>{t.cancel}</Btn>
              <Btn variant="primary" onClick={() => void createInvitation()} disabled={inviteSaving || !inviteCompanyId || (invitePlan === "team_member" && !inviteTeamId)}>{inviteSaving ? t.saving : t.createInvite}</Btn>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
