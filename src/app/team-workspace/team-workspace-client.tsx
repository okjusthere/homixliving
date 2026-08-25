"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Copy, Link2, RefreshCw, UserPlus } from "lucide-react";
import { toast } from "sonner";
import { Btn, Card, EditorialInput, Pill } from "@/components/homix/primitives";
import { CardHeader, PageHeader } from "@/components/homix/page-kit";
import { fmtDate, tone } from "@/components/homix/tokens";
import { useLocale } from "@/lib/i18n-client";
import {
  TEAM_CAP_CENTS_PRESETS,
  TEAM_SOURCED_SPLIT_PRESETS,
  TEAM_SPLIT_PRESETS,
} from "@/lib/team-compensation-policy";
import type {
  RecruitingInvitationState,
  TeamRecruitingStage,
  TeamWorkspaceData,
} from "@/lib/team-workspace";

const M = {
  en: {
    eyebrow: "Team leadership",
    title: "Team workspace",
    description: "Recruit, follow onboarding progress, and publish future team terms without exposing private payment or compliance files.",
    team: "Team",
    leader: "Team Leader",
    active: "Active",
    pending: "Pending",
    inactive: "Inactive",
    currentTerms: "Current terms",
    nextTerms: "Next scheduled version",
    standardSplit: "Standard team split",
    sourcedSplit: "Team-sourced split",
    cap: "Annual member cap",
    noCap: "No cap",
    effective: "Effective",
    inviteTitle: "Invite to my team",
    inviteLead: "The recruit joins this team and accepts the frozen terms shown below. Sponsor defaults to you and may be another active member of this team.",
    email: "Specific email (optional)",
    sponsor: "Sponsor",
    source: "Recruiting source",
    expires: "Expires in",
    days30: "30 days",
    days60: "60 days",
    days90: "90 days",
    create: "Create team invitation",
    creating: "Creating…",
    created: "Team invitation created",
    copy: "Copy link",
    copied: "Link copied",
    inviteFailed: "Could not create the invitation",
    invitationHistory: "Recruiting links",
    invitationHistoryLead: "For security, existing links are not stored in plaintext. Regenerate a link when you need a new copy.",
    general: "General team link",
    createdAt: "Created",
    usage: "Usage",
    termsVersion: "Terms",
    revoke: "Disable",
    regenerate: "Regenerate",
    revoked: "Invitation disabled",
    revokeFailed: "Could not disable the invitation",
    regeneratedWithWarning: "New link created, but the previous link could not be disabled. Disable it manually.",
    noInvites: "No team recruiting links yet.",
    progress: "New agent onboarding",
    progressLead: "Business progress only. W-9, ACH, card details, evidence files, and internal notes remain admin-only.",
    noCandidates: "No recruits are onboarding for this team.",
    members: "Team members",
    membersLead: "Current roster, Sponsor attribution, and accepted terms version.",
    noMembers: "No members assigned to this team.",
    sponsorNone: "No Sponsor",
    joined: "Joined",
    onboarding: "Onboarding",
    complete: "Complete",
    incomplete: "Incomplete",
    publishTerms: "Publish a future terms version",
    publishLead: "Historical and signed terms are never overwritten. Team Leader changes must start in the future.",
    publish: "Publish version",
    publishing: "Publishing…",
    published: "Team terms published",
    publishFailed: "Could not publish team terms",
    versionHistory: "Version history",
    memberStatus: { active: "Active", pending: "Pending", inactive: "Inactive" },
    version: (value: number) => `v${value}`,
    stage: {
      profile: "Profile incomplete",
      agreement: "Agreement pending",
      payment: "Annual fee pending",
      review: "Admin review",
      complete: "Activated",
      attention: "Needs attention",
      inactive: "Withdrawn / inactive",
    } satisfies Record<TeamRecruitingStage, string>,
    inviteState: {
      active: "Active",
      used: "Fully used",
      expired: "Expired",
      revoked: "Disabled",
    } satisfies Record<RecruitingInvitationState, string>,
  },
  zh: {
    eyebrow: "团队管理",
    title: "Team Leader 工作台",
    description: "集中处理团队招聘、入职进度与未来分佣版本，不显示成员的收款、税务或合规隐私材料。",
    team: "团队",
    leader: "Team Leader",
    active: "在职",
    pending: "入职中",
    inactive: "已停用",
    currentTerms: "当前条款",
    nextTerms: "下一生效版本",
    standardSplit: "一般团队分成",
    sourcedSplit: "团队客源分成",
    cap: "成员年度封顶",
    noCap: "不封顶",
    effective: "生效日",
    inviteTitle: "邀请加入我的团队",
    inviteLead: "新人将加入本团队并接受下方锁定条款。介绍人默认是你，也可以指定实际完成招聘的本团队在职成员。",
    email: "限定邮箱（可选）",
    sponsor: "介绍人 Sponsor",
    source: "招聘来源",
    expires: "有效期",
    days30: "30 天",
    days60: "60 天",
    days90: "90 天",
    create: "生成团队邀请",
    creating: "正在生成…",
    created: "团队邀请已生成",
    copy: "复制链接",
    copied: "链接已复制",
    inviteFailed: "无法生成团队邀请",
    invitationHistory: "团队招聘链接",
    invitationHistoryLead: "出于安全考虑，系统不保存链接明文；需要再次复制时请重新生成。",
    general: "团队通用链接",
    createdAt: "创建时间",
    usage: "使用次数",
    termsVersion: "条款版本",
    revoke: "停用",
    regenerate: "重新生成",
    revoked: "邀请已停用",
    revokeFailed: "无法停用邀请",
    regeneratedWithWarning: "新链接已生成，但旧链接未能自动停用，请手动停用旧链接。",
    noInvites: "尚未创建团队招聘链接。",
    progress: "新人入职进度",
    progressLead: "这里只显示业务进度。W-9、ACH、银行卡、证据文件和管理员内部备注仍仅管理员可见。",
    noCandidates: "本团队暂无正在入职的新人。",
    members: "团队成员",
    membersLead: "查看成员状态、Sponsor 归因及其接受的团队条款版本。",
    noMembers: "本团队暂无成员。",
    sponsorNone: "无介绍人",
    joined: "加入日期",
    onboarding: "入职状态",
    complete: "已完成",
    incomplete: "未完成",
    publishTerms: "发布未来团队条款",
    publishLead: "历史及已签署条款不会被覆盖；Team Leader 发布的变更必须从未来日期开始生效。",
    publish: "发布新版本",
    publishing: "正在发布…",
    published: "团队条款已发布",
    publishFailed: "无法发布团队条款",
    versionHistory: "版本记录",
    memberStatus: { active: "在职", pending: "入职中", inactive: "已停用" },
    version: (value: number) => `v${value}`,
    stage: {
      profile: "资料待完成",
      agreement: "协议待签署",
      payment: "年费待支付",
      review: "等待管理员审核",
      complete: "已激活",
      attention: "需要处理",
      inactive: "已撤回或停用",
    } satisfies Record<TeamRecruitingStage, string>,
    inviteState: {
      active: "有效",
      used: "已用完",
      expired: "已过期",
      revoked: "已停用",
    } satisfies Record<RecruitingInvitationState, string>,
  },
} as const;

function tomorrow() {
  return new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);
}

function capLabel(value: number | null, noCap: string) {
  return value == null ? noCap : `$${(value / 100).toLocaleString()}`;
}

const selectClass = "h-11 w-full rounded-lg px-3 text-[13.5px]";

export function TeamWorkspaceClient({
  data,
  isAdmin,
}: {
  data: TeamWorkspaceData;
  isAdmin: boolean;
}) {
  const router = useRouter();
  const locale = useLocale();
  const t = M[locale];
  const [email, setEmail] = useState("");
  const [sponsorAgentId, setSponsorAgentId] = useState(
    String(data.team.leaderAgentId || data.sponsorCandidates[0]?.id || ""),
  );
  const [source, setSource] = useState("direct");
  const [expiresInDays, setExpiresInDays] = useState("30");
  const [inviteBusy, setInviteBusy] = useState(false);
  const [createdUrl, setCreatedUrl] = useState("");
  const [termsBusy, setTermsBusy] = useState(false);
  const [terms, setTerms] = useState({
    defaultTeamSplitPct: data.currentConfig?.defaultTeamSplitPct ?? 10,
    teamLeadSplitPct: data.currentConfig?.teamLeadSplitPct ?? 10,
    teamCapCents: data.currentConfig?.teamCapCents ?? null,
    effectiveFrom: isAdmin ? new Date().toISOString().slice(0, 10) : tomorrow(),
  });
  async function createInvitation(input?: {
    email: string | null;
    sponsorAgentId: number | null;
    source: string;
    revokeId?: number;
  }) {
    setInviteBusy(true);
    try {
      const inviteEmail = input ? input.email || "" : email.trim();
      const response = await fetch("/api/onboarding/invitations", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          kind: "team_recruiting",
          teamId: data.team.id,
          sponsorAgentId: input?.sponsorAgentId || Number(sponsorAgentId),
          source: input?.source || source,
          email: inviteEmail || null,
          maxUses: inviteEmail ? 1 : 100,
          expiresInDays: Number(expiresInDays),
          affiliationTermMonths: 12,
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload.url) throw new Error(String(payload.error || t.inviteFailed));
      setCreatedUrl(payload.url);
      setEmail("");
      if (input?.revokeId) {
        const revokeResponse = await fetch("/api/onboarding/invitations", {
          method: "DELETE",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ id: input.revokeId }),
        });
        if (!revokeResponse.ok) {
          toast.error(t.regeneratedWithWarning);
          router.refresh();
          return;
        }
      }
      toast.success(t.created);
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t.inviteFailed);
    } finally {
      setInviteBusy(false);
    }
  }

  async function revokeInvitation(id: number) {
    const response = await fetch("/api/onboarding/invitations", {
      method: "DELETE",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id }),
    });
    if (!response.ok) {
      toast.error(t.revokeFailed);
      return;
    }
    toast.success(t.revoked);
    router.refresh();
  }

  async function copyCreatedUrl() {
    await navigator.clipboard.writeText(createdUrl);
    toast.success(t.copied);
  }

  async function publishTerms() {
    setTermsBusy(true);
    try {
      const response = await fetch(`/api/teams/${data.team.id}/compensation`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(terms),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(String(payload.error || t.publishFailed));
      toast.success(t.published);
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t.publishFailed);
    } finally {
      setTermsBusy(false);
    }
  }

  const fieldStyle = { background: tone.card, border: `1px solid ${tone.line}`, color: tone.ink };
  const statCards = [
    [t.active, data.counts.active, tone.green],
    [t.pending, data.counts.pending, tone.amber],
    [t.inactive, data.counts.inactive, tone.ink50],
  ] as const;

  return (
    <div className="space-y-7">
      <PageHeader eyebrow={t.eyebrow} title={t.title} description={t.description} />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <label className="w-full max-w-sm space-y-1 text-[11px] uppercase tracking-[0.1em]" style={{ color: tone.ink50 }}>
          <span>{t.team}</span>
          <select
            value={data.team.id}
            onChange={(event) => router.replace(`/team-workspace?team=${event.target.value}`)}
            className={selectClass}
            style={fieldStyle}
          >
            {data.teams.map((team) => <option key={team.id} value={team.id}>{team.name}</option>)}
          </select>
        </label>
        <div className="text-[13px]" style={{ color: tone.ink50 }}>
          {t.leader}: <span style={{ color: tone.ink }}>{data.leaderName || "—"}</span>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        {statCards.map(([label, value, color]) => (
          <Card key={label} className="p-5">
            <div className="text-[11px] uppercase tracking-[0.1em]" style={{ color: tone.ink50 }}>{label}</div>
            <div className="mt-2 font-serif text-[34px]" style={{ color }}>{value}</div>
          </Card>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="p-5">
          <div className="text-[11px] uppercase tracking-[0.1em]" style={{ color: tone.ink50 }}>{t.currentTerms}</div>
          <div className="mt-3 text-[15px] leading-7" style={{ color: tone.ink }}>
            {data.currentConfig ? (
              <>
                <strong>{t.version(data.currentConfig.version)}</strong> · {t.standardSplit} {data.currentConfig.defaultTeamSplitPct}% · {t.sourcedSplit} {data.currentConfig.teamLeadSplitPct}%<br />
                {t.cap} {capLabel(data.currentConfig.teamCapCents, t.noCap)} · {t.effective} {fmtDate(data.currentConfig.effectiveFrom)}
              </>
            ) : "—"}
          </div>
        </Card>
        <Card className="p-5">
          <div className="text-[11px] uppercase tracking-[0.1em]" style={{ color: tone.ink50 }}>{t.nextTerms}</div>
          <div className="mt-3 text-[15px] leading-7" style={{ color: tone.ink }}>
            {data.scheduledConfig ? (
              <>
                <strong>{t.version(data.scheduledConfig.version)}</strong> · {t.standardSplit} {data.scheduledConfig.defaultTeamSplitPct}% · {t.sourcedSplit} {data.scheduledConfig.teamLeadSplitPct}%<br />
                {t.cap} {capLabel(data.scheduledConfig.teamCapCents, t.noCap)} · {t.effective} {fmtDate(data.scheduledConfig.effectiveFrom)}
              </>
            ) : "—"}
          </div>
        </Card>
      </div>

      <Card>
        <CardHeader title={t.inviteTitle} subtitle={t.inviteLead} />
        <div className="space-y-4 p-5">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <EditorialInput value={email} onChange={setEmail} placeholder={t.email} type="email" />
            <select value={sponsorAgentId} onChange={(event) => setSponsorAgentId(event.target.value)} className={selectClass} style={fieldStyle} aria-label={t.sponsor}>
              {data.sponsorCandidates.map((agent) => <option key={agent.id} value={agent.id}>{t.sponsor}: {agent.name}</option>)}
            </select>
            <select value={source} onChange={(event) => setSource(event.target.value)} className={selectClass} style={fieldStyle} aria-label={t.source}>
              <option value="direct">{t.source}: Direct</option>
              <option value="exp">eXp</option>
              <option value="real">Real</option>
              <option value="voro">Voro</option>
              <option value="other">Other</option>
            </select>
            <select value={expiresInDays} onChange={(event) => setExpiresInDays(event.target.value)} className={selectClass} style={fieldStyle} aria-label={t.expires}>
              <option value="30">{t.days30}</option>
              <option value="60">{t.days60}</option>
              <option value="90">{t.days90}</option>
            </select>
          </div>
          <Btn variant="primary" icon={<UserPlus size={16} />} onClick={() => void createInvitation()} disabled={inviteBusy || !sponsorAgentId}>
            {inviteBusy ? t.creating : t.create}
          </Btn>
          {createdUrl && (
            <div className="flex min-w-0 flex-col gap-2 rounded-lg p-3 sm:flex-row sm:items-center" style={{ background: tone.paperDeep }}>
              <div className="min-w-0 flex-1 break-all font-mono text-[12px]" style={{ color: tone.ink70 }}>{createdUrl}</div>
              <Btn variant="outline" size="sm" icon={<Copy size={15} />} onClick={() => void copyCreatedUrl()}>{t.copy}</Btn>
            </div>
          )}
        </div>
      </Card>

      <Card>
        <CardHeader title={t.invitationHistory} subtitle={t.invitationHistoryLead} />
        <div className="divide-y" style={{ borderColor: tone.lineSoft }}>
          {!data.invitations.length && <p className="p-5 text-[13px]" style={{ color: tone.ink50 }}>{t.noInvites}</p>}
          {data.invitations.map((invite) => (
            <div key={invite.id} className="grid gap-3 p-5 md:grid-cols-[minmax(0,1.6fr)_repeat(3,minmax(0,0.7fr))_auto] md:items-center">
              <div className="min-w-0">
                <div className="truncate text-[14px] font-medium" style={{ color: tone.ink }}>{invite.email || t.general}</div>
                <div className="mt-1 text-[12px]" style={{ color: tone.ink50 }}>{t.sponsor}: {invite.sponsorName || t.sponsorNone}</div>
              </div>
              <div className="text-[12px]" style={{ color: tone.ink50 }}>{t.createdAt}<br /><span className="font-mono" style={{ color: tone.ink70 }}>{fmtDate(invite.createdAt?.slice(0, 10))}</span></div>
              <div className="text-[12px]" style={{ color: tone.ink50 }}>{t.usage}<br /><span className="font-mono" style={{ color: tone.ink70 }}>{invite.useCount}/{invite.maxUses}</span></div>
              <div className="space-y-1 text-[12px]" style={{ color: tone.ink50 }}>
                <Pill tone={invite.state === "active" ? "sent" : invite.state === "revoked" ? "failed" : "neutral"}>{t.inviteState[invite.state]}</Pill>
                <div>{t.termsVersion}: {invite.configVersion ? t.version(invite.configVersion) : "—"}</div>
              </div>
              <div className="flex flex-wrap gap-2 md:justify-end">
                {invite.state === "active" && (
                  <Btn variant="ghost" size="sm" onClick={() => void revokeInvitation(invite.id)}>{t.revoke}</Btn>
                )}
                <Btn
                  variant="outline"
                  size="sm"
                  icon={<RefreshCw size={14} />}
                  disabled={inviteBusy}
                  onClick={() => void createInvitation({
                    email: invite.email,
                    sponsorAgentId: invite.sponsorAgentId,
                    source: invite.source,
                    ...(invite.state === "active" ? { revokeId: invite.id } : {}),
                  })}
                >
                  {t.regenerate}
                </Btn>
              </div>
            </div>
          ))}
        </div>
      </Card>

      <Card>
        <CardHeader title={t.progress} subtitle={t.progressLead} />
        <div className="divide-y" style={{ borderColor: tone.lineSoft }}>
          {!data.candidates.length && <p className="p-5 text-[13px]" style={{ color: tone.ink50 }}>{t.noCandidates}</p>}
          {data.candidates.map((candidate) => (
            <div key={candidate.id} className="grid gap-2 p-5 sm:grid-cols-[minmax(0,1fr)_minmax(0,0.7fr)_auto] sm:items-center">
              <div className="min-w-0">
                <div className="truncate text-[14px] font-medium" style={{ color: tone.ink }}>{candidate.name}</div>
                <div className="truncate text-[12px]" style={{ color: tone.ink50 }}>{candidate.email}</div>
              </div>
              <div className="text-[12px]" style={{ color: tone.ink50 }}>{t.sponsor}: <span style={{ color: tone.ink70 }}>{candidate.sponsorName || t.sponsorNone}</span></div>
              <Pill tone={candidate.stage === "complete" ? "sent" : candidate.stage === "attention" ? "failed" : "draft"}>{t.stage[candidate.stage]}</Pill>
            </div>
          ))}
        </div>
      </Card>

      <Card>
        <CardHeader title={t.members} subtitle={t.membersLead} />
        <div className="divide-y" style={{ borderColor: tone.lineSoft }}>
          {!data.members.length && <p className="p-5 text-[13px]" style={{ color: tone.ink50 }}>{t.noMembers}</p>}
          {data.members.map((member) => (
            <div key={member.id} className="grid gap-2 p-5 sm:grid-cols-[minmax(0,1fr)_repeat(3,minmax(0,0.65fr))] sm:items-center">
              <div className="min-w-0">
                <div className="truncate text-[14px] font-medium" style={{ color: tone.ink }}>{member.name}</div>
                <div className="truncate text-[12px]" style={{ color: tone.ink50 }}>{member.email}</div>
              </div>
              <div className="text-[12px]" style={{ color: tone.ink50 }}>{t.sponsor}<br /><span style={{ color: tone.ink70 }}>{member.sponsorName || t.sponsorNone}</span></div>
              <div className="text-[12px]" style={{ color: tone.ink50 }}>{t.joined}<br /><span className="font-mono" style={{ color: tone.ink70 }}>{fmtDate(member.joinedAt)}</span></div>
              <div className="flex flex-wrap items-center gap-2">
                <Pill tone={member.accountStatus === "active" ? "sent" : member.accountStatus === "pending" ? "draft" : "neutral"}>{t.memberStatus[member.accountStatus]}</Pill>
                <span className="text-[12px]" style={{ color: tone.ink50 }}>{member.configVersion ? t.version(member.configVersion) : "—"} · {t.onboarding} {member.onboardingComplete ? t.complete : t.incomplete}</span>
              </div>
            </div>
          ))}
        </div>
      </Card>

      <Card>
        <CardHeader title={t.publishTerms} subtitle={t.publishLead} />
        <div className="space-y-4 p-5">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <select value={terms.defaultTeamSplitPct} onChange={(event) => setTerms((old) => ({ ...old, defaultTeamSplitPct: Number(event.target.value) }))} className={selectClass} style={fieldStyle} aria-label={t.standardSplit}>
              {TEAM_SPLIT_PRESETS.map((value) => <option key={value} value={value}>{t.standardSplit}: {value}%</option>)}
            </select>
            <select value={terms.teamLeadSplitPct} onChange={(event) => setTerms((old) => ({ ...old, teamLeadSplitPct: Number(event.target.value) }))} className={selectClass} style={fieldStyle} aria-label={t.sourcedSplit}>
              {TEAM_SOURCED_SPLIT_PRESETS.map((value) => <option key={value} value={value}>{t.sourcedSplit}: {value}%</option>)}
            </select>
            <select value={terms.teamCapCents ?? ""} onChange={(event) => setTerms((old) => ({ ...old, teamCapCents: event.target.value ? Number(event.target.value) : null }))} className={selectClass} style={fieldStyle} aria-label={t.cap}>
              <option value="">{t.cap}: {t.noCap}</option>
              {TEAM_CAP_CENTS_PRESETS.map((value) => <option key={value} value={value}>{t.cap}: ${(value / 100).toLocaleString()}</option>)}
            </select>
            <EditorialInput value={terms.effectiveFrom} onChange={(value) => setTerms((old) => ({ ...old, effectiveFrom: value }))} type="date" mono />
          </div>
          <Btn variant="primary" icon={<Link2 size={16} />} onClick={() => void publishTerms()} disabled={termsBusy}>{termsBusy ? t.publishing : t.publish}</Btn>
        </div>
        <div style={{ borderTop: `1px solid ${tone.lineSoft}` }}>
          <div className="px-5 pt-4 text-[11px] uppercase tracking-[0.1em]" style={{ color: tone.ink50 }}>{t.versionHistory}</div>
          <div className="divide-y" style={{ borderColor: tone.lineSoft }}>
            {data.configs.map((config) => (
              <div key={config.id} className="grid gap-1 px-5 py-3 text-[12.5px] sm:grid-cols-[100px_120px_1fr]" style={{ color: tone.ink70 }}>
                <strong style={{ color: tone.ink }}>{t.version(config.version)}</strong>
                <span className="font-mono">{config.effectiveFrom}</span>
                <span>{config.defaultTeamSplitPct}% · {t.sourcedSplit} {config.teamLeadSplitPct}% · {capLabel(config.teamCapCents, t.noCap)}</span>
              </div>
            ))}
          </div>
        </div>
      </Card>
    </div>
  );
}
