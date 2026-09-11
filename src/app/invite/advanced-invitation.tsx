"use client";

import { useState } from "react";
import { Copy } from "lucide-react";
import { toast } from "sonner";
import { Btn, Card, EditorialInput, LabeledField } from "@/components/homix/primitives";
import { tone } from "@/components/homix/tokens";
import { useLocale } from "@/lib/i18n-client";

export type InvitationOptions = {
  isAdmin: boolean;
  agentId: number;
  teams: Array<{ id: number; name: string; companyId: string | null; leaderAgentId: number | null }>;
  sponsors: Array<{ id: number; name: string; teamId: number | null }>;
};

const M = {
  en: {
    title: "Special invitation settings", lead: "For a pre-arranged company placement or team recruitment. For a personal introduction, use your link above.",
    kind: "Invitation purpose", companyInvite: "Company placement", teamInvite: "Recruit to a team",
    company: "Licensed company", team: "Team", sponsor: "Sponsor", none: "No sponsor", choose: "Select…",
    plan: "Commission plan", term: "Affiliation term", months: "months", email: "Restrict to an email (optional)", source: "Source", expires: "Link validity", days: "days",
    create: "Create special invitation", busy: "Creating…", copied: "Invitation link copied", copy: "Copy link", copyFailed: "Could not copy. Select the link and copy it manually.", failed: "Could not create the invitation. Please try again.",
    summary: "Review before creating", locked: "Company, plan, term and sponsor are fixed by this invitation. Team invitations also fix the team and its current compensation terms.",
    usage: "Email-restricted links are single-use. Other special invitations allow 100 applicants. These settings do not change your personal link.",
    anyEmail: "Any email", noTeam: "No team", noTeams: "No recruiting team is available. Complete the team setup and Team Leader agreement first.",
  },
  zh: {
    title: "特殊邀请设置", lead: "用于已商定公司、方案或团队的定向招募。日常个人推荐，直接使用上方专属链接即可。",
    kind: "邀请用途", companyInvite: "公司定向加入", teamInvite: "邀请加入指定团队",
    company: "持牌公司", team: "指定团队", sponsor: "介绍人", none: "无介绍人", choose: "请选择…",
    plan: "佣金方案", term: "合作期限", months: "个月", email: "限定邮箱（可选）", source: "来源", expires: "链接有效期", days: "天",
    create: "生成定向邀请", busy: "正在生成…", copied: "邀请链接已复制", copy: "复制链接", copyFailed: "复制失败，请选中链接手动复制。", failed: "无法生成邀请，请重试。",
    summary: "生成前请核对", locked: "此邀请会锁定公司、方案、期限及介绍人；团队邀请还会锁定指定团队和当前佣金条款。",
    usage: "限定邮箱的链接仅可使用一次；其他定向邀请最多供 100 人使用。这些设置不会改变上方的个人链接。",
    anyEmail: "不限邮箱", noTeam: "不指定团队", noTeams: "暂无可招募团队。请先完成团队设置与 Team Leader 协议。",
  },
} as const;

const selectClass = "h-11 w-full rounded-lg border border-line bg-white px-3 text-[13px] disabled:opacity-50";

export function AdvancedInvitation({ options }: { options: InvitationOptions }) {
  const locale = useLocale();
  const t = M[locale];
  const [kind, setKind] = useState(options.isAdmin ? "admin" : "team_recruiting");
  const [company, setCompany] = useState("");
  const [plan, setPlan] = useState("solo");
  const [teamId, setTeamId] = useState("");
  const [sponsorId, setSponsorId] = useState(options.isAdmin ? "" : String(options.agentId));
  const [term, setTerm] = useState("12");
  const [email, setEmail] = useState("");
  const [source, setSource] = useState("direct");
  const [days, setDays] = useState("30");
  const [busy, setBusy] = useState(false);
  const [created, setCreated] = useState<{ url: string; summary: string } | null>(null);
  const [error, setError] = useState("");
  const isTeam = kind === "team_recruiting";
  const selectedTeam = options.teams.find((team) => String(team.id) === teamId);
  const effectivePlan = isTeam ? "team_member" : plan;
  const needsTeam = effectivePlan === "team_member";
  const effectiveCompany = needsTeam ? selectedTeam?.companyId || "" : company;
  const sponsors = options.sponsors.filter((agent) => options.isAdmin || agent.teamId === selectedTeam?.id || agent.id === selectedTeam?.leaderAgentId);
  const effectiveSponsor = sponsors.find((agent) => String(agent.id) === sponsorId);
  const companyName = effectiveCompany === "homix_realty" ? "Homix Realty Inc." : effectiveCompany === "homix_living" ? "Homix Living Inc." : t.choose;
  const summary = [companyName, effectivePlan.replaceAll("_", " "), `${term} ${t.months}`, needsTeam ? selectedTeam?.name || t.choose : t.noTeam, effectiveSponsor?.name || t.none, email.trim() || t.anyEmail, `${days} ${t.days}`].join(" · ");

  async function createInvitation(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setCreated(null);
    try {
      const response = await fetch("/api/onboarding/invitations", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ kind, licensedCompanyId: effectiveCompany, plan: effectivePlan,
          teamId: needsTeam ? Number(teamId) : null, sponsorAgentId: effectiveSponsor?.id || null,
          affiliationTermMonths: Number(term), email: email.trim() || null, source, expiresInDays: Number(days), maxUses: 100 }),
      });
      const data = await response.json();
      if (!response.ok || !data.url) throw new Error(data.error || t.failed);
      setCreated({ url: data.url, summary });
    } catch (error) { setError(error instanceof Error ? error.message : t.failed); }
    finally { setBusy(false); }
  }

  async function copy() {
    if (!created) return;
    try { await navigator.clipboard.writeText(created.url); toast.success(t.copied); }
    catch { toast.error(t.copyFailed); }
  }

  return <Card>
    <details className="group p-5 sm:p-6">
      <summary className="cursor-pointer font-serif text-[21px]" style={{ color: tone.ink }}>{t.title}</summary>
      <p className="mt-3 text-[13px] leading-6" style={{ color: tone.ink50 }}>{t.lead}</p>
      <form onSubmit={(event) => void createInvitation(event)} className="mt-5 space-y-5">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {options.isAdmin && <LabeledField label={t.kind}><select aria-label={t.kind} className={selectClass} value={kind} onChange={(event) => { setKind(event.target.value); setTeamId(""); setSponsorId(""); }}><option value="admin">{t.companyInvite}</option><option value="team_recruiting">{t.teamInvite}</option></select></LabeledField>}
          {!isTeam && <LabeledField label={t.plan}><select aria-label={t.plan} className={selectClass} value={plan} onChange={(event) => { setPlan(event.target.value); setTeamId(""); if (event.target.value === "solo_pro") setTerm("12"); }}><option value="solo">Solo</option><option value="solo_pro">Solo Pro</option><option value="team_member">Team Member</option></select></LabeledField>}
          {needsTeam ? <LabeledField label={t.team}><select required aria-label={t.team} className={selectClass} value={teamId} onChange={(event) => { setTeamId(event.target.value); setSponsorId(options.isAdmin ? "" : String(options.agentId)); }}><option value="">{t.choose}</option>{options.teams.filter((team) => team.companyId).map((team) => <option value={team.id} key={team.id}>{team.name}</option>)}</select></LabeledField> : <LabeledField label={t.company}><select required aria-label={t.company} className={selectClass} value={company} onChange={(event) => setCompany(event.target.value)}><option value="">{t.choose}</option><option value="homix_realty">Homix Realty Inc.</option><option value="homix_living">Homix Living Inc.</option></select></LabeledField>}
          <LabeledField label={t.sponsor}><select aria-label={t.sponsor} required={!options.isAdmin} className={selectClass} value={effectiveSponsor ? sponsorId : ""} onChange={(event) => setSponsorId(event.target.value)}><option value="">{options.isAdmin ? t.none : t.choose}</option>{sponsors.map((agent) => <option key={agent.id} value={agent.id}>{agent.name}</option>)}</select></LabeledField>
          <LabeledField label={t.term}><select aria-label={t.term} className={selectClass} value={term} disabled={effectivePlan === "solo_pro"} onChange={(event) => setTerm(event.target.value)}><option value="12">12 {t.months}</option><option value="24">24 {t.months}</option></select></LabeledField>
          <LabeledField label={t.email}><EditorialInput type="email" value={email} onChange={setEmail} placeholder="name@example.com" /></LabeledField>
          <LabeledField label={t.source}><select aria-label={t.source} className={selectClass} value={source} onChange={(event) => setSource(event.target.value)}>{["direct", "exp", "real", "voro", "other"].map((value) => <option key={value} value={value}>{value}</option>)}</select></LabeledField>
          <LabeledField label={t.expires}><select aria-label={t.expires} className={selectClass} value={days} onChange={(event) => setDays(event.target.value)}>{[30, 60, 90].map((value) => <option key={value} value={value}>{value} {t.days}</option>)}</select></LabeledField>
        </div>
        {needsTeam && !options.teams.length && <p className="text-[13px]" style={{ color: tone.amber }}>{t.noTeams}</p>}
        <div className="rounded-lg p-4 text-[12px] leading-6" style={{ background: tone.paper }}><p className="font-medium">{t.summary}</p><p>{summary}</p><p className="mt-2" style={{ color: tone.ink50 }}>{t.locked} {t.usage}</p></div>
        {error && <p role="alert" className="text-[13px]" style={{ color: tone.rose }}>{error}</p>}
        <button type="submit" disabled={busy || !effectiveCompany || (needsTeam && !selectedTeam) || (!options.isAdmin && !effectiveSponsor)} className="h-11 rounded-lg px-5 text-[13px] font-medium disabled:opacity-50" style={{ background: tone.accent, color: "white" }}>{busy ? t.busy : t.create}</button>
        {created && <div className="rounded-lg border p-4" style={{ borderColor: tone.line }}><p className="mb-3 text-[12px] leading-6" style={{ color: tone.ink70 }}>{created.summary}</p><input aria-label={t.copy} readOnly value={created.url} onFocus={(event) => event.target.select()} className="h-11 w-full rounded border border-line px-3 font-mono text-[12px]" /><Btn className="mt-3" size="sm" variant="outline" icon={<Copy size={15} />} onClick={() => void copy()}>{t.copy}</Btn></div>}
      </form>
    </details>
  </Card>;
}
