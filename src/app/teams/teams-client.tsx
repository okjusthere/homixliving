"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Btn, Card, EditorialInput, Icons, LabeledField, Pill } from "@/components/homix/primitives";
import { PageHeader } from "@/components/homix/page-kit";
import { fmtMoney, tone } from "@/components/homix/tokens";
import { useLocale } from "@/lib/i18n-client";
import type { Agent, Team, TeamCompensationConfig } from "@/db/schema";

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
    edit: "Edit",
    noMembers: "No members assigned.",
    noLicense: "No license",
    editLabel: "Edit",
    newLabel: "New",
    addTeamModal: "Add team",
    nameField: "Name *",
    namePlaceholder: "e.g. Manhattan",
    leaderField: "Leader",
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
    invite: "Recruiting link",
    inviteTitle: "Create onboarding invitation",
    inviteSource: "Source",
    inviteEmail: "Email (optional)",
    inviteTeam: "Team (optional)",
    inviteSponsor: "Sponsor (optional)",
    createInvite: "Create link",
    inviteCreated: "Invitation created",
    copyInvite: "Copy link",
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
    edit: "编辑",
    noMembers: "暂无分配成员。",
    noLicense: "无执照",
    editLabel: "编辑",
    newLabel: "新建",
    addTeamModal: "添加团队",
    nameField: "名称 *",
    namePlaceholder: "例如 Manhattan",
    leaderField: "负责人",
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
    invite: "招聘邀请",
    inviteTitle: "创建入职邀请链接",
    inviteSource: "来源",
    inviteEmail: "限定邮箱（可选）",
    inviteTeam: "自动加入团队（可选）",
    inviteSponsor: "Sponsor / 介绍人（可选）",
    createInvite: "生成链接",
    inviteCreated: "邀请链接已生成",
    copyInvite: "复制链接",
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

const emptyTeam: TeamEdit = {
  name: "",
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
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteTeamId, setInviteTeamId] = useState("");
  const [inviteSponsorId, setInviteSponsorId] = useState("");
  const t = M[useLocale()];

  const load = () => {
    setLoading(true);
    fetch("/api/teams")
      .then((r) => r.json())
      .then(setTeams)
      .finally(() => setLoading(false));
  };

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
          source: inviteSource,
          email: inviteEmail || null,
          teamId: inviteTeamId || null,
          sponsorAgentId: inviteSponsorId || null,
          plan: inviteTeamId ? "team_member" : "solo",
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
                    <Btn
                      variant="ghost"
                      size="sm"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        setEditTeam({
                          ...row.team,
                          defaultTeamSplitPct: row.compensationConfig?.defaultTeamSplitPct || 10,
                          teamLeadSplitPct: row.compensationConfig?.teamLeadSplitPct || 10,
                          teamCapCents: row.compensationConfig?.teamCapCents || null,
                          effectiveFrom: new Date().toISOString().slice(0, 10),
                        });
                      }}
                    >
                      {t.edit}
                    </Btn>
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
                    <select value={editTeam.defaultTeamSplitPct || 10} onChange={(e) => updateField("defaultTeamSplitPct", Number(e.target.value))} className="h-11 w-full rounded-lg px-3 text-[13.5px] sm:h-10" style={{ background: tone.card, border: `1px solid ${tone.line}`, color: tone.ink }}>
                      {[10, 15, 20].map((value) => <option key={value} value={value}>{value}%</option>)}
                    </select>
                  </LabeledField>
                  <LabeledField label={t.leadSplit}>
                    <select value={editTeam.teamLeadSplitPct || 10} onChange={(e) => updateField("teamLeadSplitPct", Number(e.target.value))} className="h-11 w-full rounded-lg px-3 text-[13.5px] sm:h-10" style={{ background: tone.card, border: `1px solid ${tone.line}`, color: tone.ink }}>
                      {[10, 15, 20, 25, 30].map((value) => <option key={value} value={value}>{value}%</option>)}
                    </select>
                  </LabeledField>
                  <LabeledField label={t.teamCap}>
                    <select value={editTeam.teamCapCents ?? ""} onChange={(e) => updateField("teamCapCents", e.target.value ? Number(e.target.value) : null)} className="h-11 w-full rounded-lg px-3 text-[13.5px] sm:h-10" style={{ background: tone.card, border: `1px solid ${tone.line}`, color: tone.ink }}>
                      <option value="">{t.noCap}</option>
                      {[10000, 15000, 20000, 25000].map((value) => <option key={value} value={value * 100}>${value.toLocaleString()}</option>)}
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

      {inviteOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(26, 24, 20, 0.4)", backdropFilter: "blur(4px)" }} onClick={() => setInviteOpen(false)}>
          <div className="w-full max-w-lg rounded-xl border border-line bg-white p-6" onClick={(event) => event.stopPropagation()}>
            <div className="flex items-center justify-between gap-4">
              <h2 className="font-serif text-[26px]">{t.inviteTitle}</h2>
              <button type="button" className="size-9 rounded-md bg-paper-deep" onClick={() => setInviteOpen(false)}>x</button>
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
              <LabeledField label={t.inviteEmail}>
                <EditorialInput value={inviteEmail} onChange={setInviteEmail} type="email" />
              </LabeledField>
              <LabeledField label={t.inviteTeam}>
                <select value={inviteTeamId} onChange={(event) => setInviteTeamId(event.target.value)} className="h-11 w-full rounded-lg border border-line bg-white px-3 text-[13px]">
                  <option value="">{t.unassigned}</option>
                  {teams.map((row) => <option key={row.team.id} value={row.team.id}>{row.team.name}</option>)}
                </select>
              </LabeledField>
              <LabeledField label={t.inviteSponsor}>
                <select value={inviteSponsorId} onChange={(event) => setInviteSponsorId(event.target.value)} className="h-11 w-full rounded-lg border border-line bg-white px-3 text-[13px]">
                  <option value="">{t.unassigned}</option>
                  {Array.from(new Map(teams.flatMap((row) => [row.leader, ...row.members]).filter(Boolean).map((agent) => [agent!.id, agent!])).values()).map((agent) => (
                    <option key={agent.id} value={agent.id}>{agent.name}</option>
                  ))}
                </select>
              </LabeledField>
            </div>
            {inviteUrl && (
              <div className="mt-5 rounded-lg bg-paper p-3">
                <div className="break-all font-mono text-[12px]">{inviteUrl}</div>
                <Btn variant="outline" className="mt-3 w-full justify-center" onClick={() => void navigator.clipboard.writeText(inviteUrl)}>{t.copyInvite}</Btn>
              </div>
            )}
            <div className="mt-5 flex justify-end gap-2">
              <Btn variant="outline" onClick={() => setInviteOpen(false)}>{t.cancel}</Btn>
              <Btn variant="primary" onClick={() => void createInvitation()} disabled={inviteSaving}>{inviteSaving ? t.saving : t.createInvite}</Btn>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
