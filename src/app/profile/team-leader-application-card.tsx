"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Btn, Card, EditorialInput, LabeledField, Pill } from "@/components/homix/primitives";
import { CardHeader } from "@/components/homix/page-kit";
import { tone } from "@/components/homix/tokens";
import { TEAM_SPLIT_PRESETS } from "@/lib/team-compensation-policy";

type Eligibility =
  | "account_not_active"
  | "agent_agreement_required"
  | "solo_pro_required"
  | "licensed_company_required"
  | "already_team_leader"
  | "application_already_open"
  | null;

type ApplicationSummary = {
  id: number;
  proposedTeamName: string;
  expectedMemberCount: number;
  positioning: string;
  proposedTeamSplitPct: number;
  status: "submitted" | "approved" | "declined" | "withdrawn" | "active";
  agreementStatus: string;
  decisionReason: string | null;
  teamId: number | null;
};

const M = {
  en: {
    title: "Build a team",
    lead: "Solo Pro agents may apply to become a Team Leader. The office approves the team and first terms before any recruiting begins.",
    apply: "Apply to become a Team Leader",
    teamName: "Proposed team name",
    members: "Expected members in the first 12 months",
    positioning: "Team positioning and recruiting plan",
    split: "Proposed Team Split",
    submit: "Submit application",
    submitting: "Submitting…",
    failed: "Could not submit the application.",
    soloPro: "Upgrade to Solo Pro before applying to lead a team.",
    licensedCompany: "Select Homix Realty Inc. or Homix Living Inc. in your company record before applying.",
    agentAgreement: "Complete your Agent Affiliation Agreement before applying to lead a team.",
    status: "Application status",
    submitted: "Under office review",
    approved: "Approved · agreement required",
    declined: "Not approved",
    active: "Team active",
    withdrawn: "Withdrawn",
    agreement: "Team Leader agreement",
    openWorkspace: "Open team workspace",
    agreementStatus: { not_started: "Not started", preparing: "Preparing", sent: "Sent", completed: "Completed", declined: "Declined", voided: "Voided", expired: "Expired", failed: "Failed" },
  },
  zh: {
    title: "组建团队",
    lead: "Solo Pro 经纪人可以申请成为 Team Leader。公司先审核团队及首版条款，之后才开放团队招聘。",
    apply: "申请成为 Team Leader",
    teamName: "拟定团队名称",
    members: "预计首年成员人数",
    positioning: "团队定位及招聘计划",
    split: "拟定 Team Split",
    submit: "提交申请",
    submitting: "提交中…",
    failed: "申请提交失败，请重试。",
    soloPro: "需先使用 Solo Pro 方案，才能申请组建团队。",
    licensedCompany: "申请前需先在公司档案中选择 Homix Realty Inc. 或 Homix Living Inc.。",
    agentAgreement: "申请组建团队前，需先完成经纪人入职协议。",
    status: "申请状态",
    submitted: "等待管理员审核",
    approved: "已批准 · 待签 Team Leader 协议",
    declined: "未批准",
    active: "团队已启用",
    withdrawn: "已撤回",
    agreement: "Team Leader 协议",
    openWorkspace: "进入团队工作台",
    agreementStatus: { not_started: "未开始", preparing: "生成中", sent: "已发送", completed: "已完成", declined: "已拒签", voided: "已作废", expired: "已过期", failed: "失败" },
  },
} as const;

export function TeamLeaderApplicationCard({
  locale,
  eligibility,
  application,
}: {
  locale: "en" | "zh";
  eligibility: Eligibility;
  application: ApplicationSummary | null;
}) {
  const router = useRouter();
  const t = M[locale];
  const [open, setOpen] = useState(false);
  const [teamName, setTeamName] = useState("");
  const [expectedMemberCount, setExpectedMemberCount] = useState("5");
  const [positioning, setPositioning] = useState("");
  const [teamSplit, setTeamSplit] = useState("10");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function submit() {
    setBusy(true);
    setMessage(null);
    try {
      const response = await fetch("/api/team-leader-applications", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          proposedTeamName: teamName,
          expectedMemberCount,
          positioning,
          proposedTeamSplitPct: teamSplit,
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || t.failed);
      setOpen(false);
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : t.failed);
    } finally {
      setBusy(false);
    }
  }

  const current = application && application.status !== "withdrawn" ? application : null;
  const canApply = eligibility === null;
  return (
    <Card className="overflow-hidden">
      <CardHeader title={t.title} />
      <div className="space-y-4 p-5">
        <p className="text-[12.5px] leading-5" style={{ color: tone.ink50 }}>{t.lead}</p>
        {current && (
          <div className="rounded-lg p-4" style={{ background: tone.paperDeep }}>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="text-[11px] uppercase tracking-[0.12em]" style={{ color: tone.ink50 }}>{t.status}</div>
                <div className="mt-1 text-[16px] font-medium" style={{ color: tone.ink }}>{current.proposedTeamName}</div>
              </div>
              <Pill tone={current.status === "active" ? "sent" : current.status === "declined" ? "failed" : "neutral"}>
                {t[current.status]}
              </Pill>
            </div>
            <p className="mt-3 text-[12.5px]" style={{ color: tone.ink70 }}>
              {current.expectedMemberCount} {locale === "zh" ? "名预计成员" : "expected members"} · {current.proposedTeamSplitPct}% Team Split
            </p>
            {current.decisionReason && <p className="mt-2 text-[12.5px]" style={{ color: tone.rose }}>{current.decisionReason}</p>}
            {current.status === "approved" && current.teamId && (
              <div className="mt-4 flex flex-wrap items-center gap-2">
                <Pill tone={current.agreementStatus === "completed" ? "sent" : "neutral"}>
                  {t.agreement}: {t.agreementStatus[current.agreementStatus as keyof typeof t.agreementStatus] || current.agreementStatus}
                </Pill>
                <Link href={`/team-workspace?team=${current.teamId}`}>
                  <Btn variant="primary" size="sm">{t.openWorkspace}</Btn>
                </Link>
              </div>
            )}
          </div>
        )}
        {!current && eligibility === "solo_pro_required" && (
          <p className="text-[13px]" style={{ color: tone.ink70 }}>{t.soloPro}</p>
        )}
        {!current && eligibility === "licensed_company_required" && (
          <p className="text-[13px]" style={{ color: tone.ink70 }}>{t.licensedCompany}</p>
        )}
        {!current && eligibility === "agent_agreement_required" && (
          <p className="text-[13px]" style={{ color: tone.ink70 }}>{t.agentAgreement}</p>
        )}
        {canApply && !open && (
          <Btn variant="outline" onClick={() => setOpen(true)}>{t.apply}</Btn>
        )}
        {open && (
          <div className="grid gap-4 border-t pt-4 sm:grid-cols-2" style={{ borderColor: tone.lineSoft }}>
            <LabeledField label={t.teamName}>
              <EditorialInput value={teamName} onChange={setTeamName} />
            </LabeledField>
            <LabeledField label={t.members}>
              <EditorialInput value={expectedMemberCount} onChange={setExpectedMemberCount} type="number" />
            </LabeledField>
            <LabeledField label={t.split}>
              <select value={teamSplit} onChange={(event) => setTeamSplit(event.target.value)} className="h-11 w-full rounded-lg border border-line bg-white px-3 text-[13px]">
                {TEAM_SPLIT_PRESETS.map((value) => <option key={value} value={value}>{value}%</option>)}
              </select>
            </LabeledField>
            <LabeledField label={t.positioning} wide>
              <textarea value={positioning} onChange={(event) => setPositioning(event.target.value)} rows={4} className="w-full rounded-lg border border-line bg-white p-3 text-[13px] outline-none" />
            </LabeledField>
            <div className="flex flex-wrap gap-2 sm:col-span-2">
              <Btn variant="primary" onClick={() => void submit()} disabled={busy}>{busy ? t.submitting : t.submit}</Btn>
              <Btn variant="ghost" onClick={() => setOpen(false)} disabled={busy}>{locale === "zh" ? "取消" : "Cancel"}</Btn>
            </div>
          </div>
        )}
        {message && <p className="text-[12.5px]" style={{ color: tone.rose }}>{message}</p>}
      </div>
    </Card>
  );
}
