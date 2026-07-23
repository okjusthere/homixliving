"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { toast } from "sonner";
import { Btn, Card, EditorialInput, Icons, LabeledField, Pill, SoftField } from "@/components/homix/primitives";
import { PageHeader, CardHeader } from "@/components/homix/page-kit";
import { fmtDate, fmtMoney, tone } from "@/components/homix/tokens";
import { getMonthKey } from "@/lib/reporting";
import { DEFAULT_AGENT_SPLIT_PCT, splitLabel } from "@/lib/splits";
import { useLocale } from "@/lib/i18n-client";
import type { Agent, Deal, Team } from "@/db/schema";

const M = {
  en: {
    nameRequired: "Name is required",
    agentSaved: "Agent saved",
    saveFailed: "Save failed",
    deactivateConfirm: (name: string) => `Deactivate ${name}?`,
    agentDeactivated: "Agent deactivated",
    deleteFailed: "Delete failed",
    thisMonth: "This month",
    lastMonth: "Last month",
    loading: "Loading…",
    agentNotFound: "Agent not found",
    backToAgents: "Back to agents",
    eyebrowAgent: "Agent",
    noLicense: "No license #",
    noCompany: "No company",
    split: "split",
    unassigned: "Unassigned",
    edit: "Edit",
    editPublic: "Public profile",
    deactivate: "Deactivate",
    mtdRental: "MTD Rental",
    mtdTake: "MTD Take",
    ytdRental: "YTD Rental",
    ytdTake: "YTD Take",
    rentalForMonth: (month: string) => `Rental for ${month}`,
    rentalNum: "Rental #",
    buildingTenant: "Building / Tenant",
    rentalDate: "Rental date",
    commission: "Commission",
    personalTake: "Personal take",
    noRentalDeals: "No rental deals this month",
    noCommissions: (month: string) => `This agent has no tracked commissions for ${month}.`,
    unit: "Unit",
    contact: "Contact",
    email: "Email",
    phone: "Phone",
    notes: "Notes",
    noNotes: "No notes yet.",
    name: "Name *",
    team: "Team",
    licenseNumber: "License #",
    agentKeep: "Agent keep %",
    licensedCompany: "Licensed company",
    joined: "Joined",
    cancel: "Cancel",
    saving: "Saving…",
    save: "Save",
  },
  zh: {
    nameRequired: "姓名为必填项",
    agentSaved: "经纪人已保存",
    saveFailed: "保存失败",
    deactivateConfirm: (name: string) => `停用 ${name}？`,
    agentDeactivated: "经纪人已停用",
    deleteFailed: "删除失败",
    thisMonth: "本月",
    lastMonth: "上月",
    loading: "加载中…",
    agentNotFound: "未找到经纪人",
    backToAgents: "返回经纪人列表",
    eyebrowAgent: "经纪人",
    noLicense: "无执照号",
    noCompany: "无公司",
    split: "分成",
    unassigned: "未分配",
    edit: "编辑",
    editPublic: "对外主页",
    deactivate: "停用",
    mtdRental: "本月租赁",
    mtdTake: "本月收入",
    ytdRental: "年度租赁",
    ytdTake: "年度收入",
    rentalForMonth: (month: string) => `${month} 租赁`,
    rentalNum: "租赁编号",
    buildingTenant: "楼盘 / 租客",
    rentalDate: "租赁日期",
    commission: "佣金",
    personalTake: "个人收入",
    noRentalDeals: "本月暂无租赁交易",
    noCommissions: (month: string) => `该经纪人在 ${month} 暂无佣金记录。`,
    unit: "单元",
    contact: "联系方式",
    email: "邮箱",
    phone: "电话",
    notes: "备注",
    noNotes: "暂无备注。",
    name: "姓名 *",
    team: "团队",
    licenseNumber: "执照号",
    agentKeep: "经纪人分成 %",
    licensedCompany: "持照公司",
    joined: "入职日期",
    cancel: "取消",
    saving: "保存中…",
    save: "保存",
  },
} as const;

type AgentPayload = {
  agent: Agent;
  teamName: string | null;
};

type ReportPayload = {
  month: string;
  deals: Array<{
    deal: Deal;
    buildingName: string | null;
    personalTake: number;
    dealDate: string;
  }>;
  summary: {
    mtdDeals: number;
    mtdTake: number;
    ytdDeals: number;
    ytdTake: number;
  };
};

function previousMonth(month: string) {
  const [year, rawMonth] = month.split("-").map(Number);
  const date = new Date(year, rawMonth - 2, 1);
  return getMonthKey(date);
}

export default function AgentDetailPage() {
  const params = useParams();
  const router = useRouter();
  const t = M[useLocale()];
  const id = String(params.id);
  const thisMonth = getMonthKey();
  const [payload, setPayload] = useState<AgentPayload | null>(null);
  const [report, setReport] = useState<ReportPayload | null>(null);
  const [teams, setTeams] = useState<Team[]>([]);
  const [month, setMonth] = useState(thisMonth);
  const [loading, setLoading] = useState(true);
  const [editAgent, setEditAgent] = useState<Agent | null>(null);
  const [saving, setSaving] = useState(false);

  const load = () => {
    setLoading(true);
    Promise.all([
      fetch(`/api/agents/${id}`).then((r) => r.json()),
      fetch(`/api/agents/${id}/report?month=${month}`).then((r) => r.json()),
      fetch("/api/teams").then((r) => (r.ok ? r.json() : [])),
    ])
      .then(([agentData, reportData, teamRows]) => {
        setPayload(agentData);
        setReport(reportData);
        setTeams(teamRows);
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, month]);

  const updateField = (field: keyof Agent, value: string | number | boolean | null) => {
    if (!editAgent) return;
    setEditAgent({ ...editAgent, [field]: value });
  };

  const handleSave = async () => {
    if (!editAgent?.name?.trim()) {
      toast.error(t.nameRequired);
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/agents", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editAgent),
      });
      if (!res.ok) throw new Error();
      toast.success(t.agentSaved);
      setEditAgent(null);
      load();
    } catch {
      toast.error(t.saveFailed);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!payload?.agent) return;
    if (!confirm(t.deactivateConfirm(payload.agent.name))) return;
    try {
      const res = await fetch(`/api/agents/${payload.agent.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
      toast.success(t.agentDeactivated);
      router.push("/agents");
    } catch {
      toast.error(t.deleteFailed);
    }
  };

  const monthOptions = useMemo(
    () => [
      { label: t.thisMonth, value: thisMonth },
      { label: t.lastMonth, value: previousMonth(thisMonth) },
    ],
    [thisMonth, t]
  );

  if (loading) {
    return (
      <div className="py-24 text-center text-[13px]" style={{ color: tone.ink50 }}>
        {t.loading}
      </div>
    );
  }

  if (!payload?.agent || !report) {
    return (
      <div className="py-24 text-center">
        <div className="font-serif text-2xl" style={{ color: tone.ink }}>
          {t.agentNotFound}
        </div>
        <Link href="/agents" className="mt-4 inline-block text-[13px] underline" style={{ color: tone.accent }}>
          {t.backToAgents}
        </Link>
      </div>
    );
  }

  const { agent, teamName } = payload;

  return (
    <div className="space-y-7">
      <div className="space-y-4">
        <Link href="/agents" className="inline-flex items-center gap-1.5 text-[12.5px]" style={{ color: tone.ink50 }}>
          <Icons.Back /> {t.backToAgents}
        </Link>
        <PageHeader
          eyebrow={t.eyebrowAgent}
          title={agent.name}
          description={`${agent.licenseNumber || t.noLicense} · ${agent.licensedCompany || t.noCompany}`}
          actions={
            <>
              <Pill tone="accent">{splitLabel(agent.splitPct)} {t.split}</Pill>
              <span className="mr-1 text-[12px]" style={{ color: tone.ink50 }}>
                {teamName || t.unassigned}
              </span>
              <Btn variant="outline" icon={<Icons.Edit />} onClick={() => setEditAgent(agent)}>
                {t.edit}
              </Btn>
              <Btn variant="outline" onClick={() => router.push(`/profile/public?agentId=${agent.id}`)}>
                {t.editPublic}
              </Btn>
              <Btn variant="danger" icon={<Icons.Trash />} onClick={handleDelete}>
                {t.deactivate}
              </Btn>
            </>
          }
        />
      </div>

      <div className="grid grid-cols-4 gap-4">
        {[
          [t.mtdRental, report.summary.mtdDeals, ""],
          [t.mtdTake, `$${fmtMoney(report.summary.mtdTake)}`, month],
          [t.ytdRental, report.summary.ytdDeals, month.slice(0, 4)],
          [t.ytdTake, `$${fmtMoney(report.summary.ytdTake)}`, month.slice(0, 4)],
        ].map(([label, value, sub]) => (
          <Card key={label}>
            <div className="p-5">
              <div className="text-[11px] uppercase tracking-[0.12em]" style={{ color: tone.ink50 }}>
                {label}
              </div>
              <div className="mt-2 font-serif" style={{ fontSize: 34, color: tone.ink, lineHeight: 1 }}>
                {value}
              </div>
              {sub && (
                <div className="mt-2 text-[12px] font-mono" style={{ color: tone.ink50 }}>
                  {sub}
                </div>
              )}
            </div>
          </Card>
        ))}
      </div>

      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-1 p-1 rounded-lg" style={{ background: tone.paperDeep }}>
          {monthOptions.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => setMonth(option.value)}
              className="px-3 h-8 rounded-md text-[12.5px] font-medium"
              style={{
                background: month === option.value ? tone.card : "transparent",
                color: month === option.value ? tone.ink : tone.ink50,
              }}
            >
              {option.label}
            </button>
          ))}
        </div>
        <EditorialInput value={month} onChange={setMonth} type="month" mono className="max-w-[170px]" />
      </div>

      <Card>
        <CardHeader title={t.rentalForMonth(month)} />
        <div className="grid text-[11px] uppercase tracking-[0.1em] px-6 py-3" style={{ gridTemplateColumns: "1fr 2fr 1fr 1fr 1fr", color: tone.ink50, borderBottom: `1px solid ${tone.lineSoft}` }}>
          <div>{t.rentalNum}</div>
          <div>{t.buildingTenant}</div>
          <div>{t.rentalDate}</div>
          <div className="text-right">{t.commission}</div>
          <div className="text-right">{t.personalTake}</div>
        </div>
        {report.deals.length === 0 ? (
          <div className="px-6 py-14 text-center">
            <div className="font-serif mb-2" style={{ fontSize: 22, color: tone.ink }}>
              {t.noRentalDeals}
            </div>
            <p className="text-[13px]" style={{ color: tone.ink50 }}>
              {t.noCommissions(month)}
            </p>
          </div>
        ) : (
          report.deals.map(({ deal, buildingName, personalTake }, index) => (
            <Link
              key={deal.id}
              href={`/rental/${deal.id}`}
              className="grid px-6 py-4 items-center transition-colors hover:bg-[#FAF7F0]"
              style={{
                gridTemplateColumns: "1fr 2fr 1fr 1fr 1fr",
                borderBottom: index < report.deals.length - 1 ? `1px solid ${tone.lineSoft}` : "none",
              }}
            >
              <div className="font-mono text-[12.5px]" style={{ color: tone.ink }}>
                #{deal.id}
              </div>
              <div>
                <div className="text-[13px]" style={{ color: tone.ink }}>
                  {buildingName || "—"} · {t.unit} {deal.unit}
                </div>
                <div className="text-[11.5px] mt-0.5" style={{ color: tone.ink50 }}>
                  {deal.tenantName}
                </div>
              </div>
              <div className="font-mono text-[12.5px]" style={{ color: tone.ink70 }}>
                {fmtDate(deal.dealDate || deal.createdAt)}
              </div>
              <div className="text-right font-serif" style={{ fontSize: 18, color: tone.ink }}>
                ${fmtMoney(Number(deal.totalCommission || 0))}
              </div>
              <div className="text-right font-serif" style={{ fontSize: 18, color: tone.green }}>
                ${fmtMoney(personalTake)}
              </div>
            </Link>
          ))
        )}
      </Card>

      <div className="grid grid-cols-3 gap-4">
        <Card>
          <CardHeader title={t.contact} />
          <div className="p-5 space-y-4">
            <SoftField label={t.email} value={agent.email || "—"} mono />
            <SoftField label={t.phone} value={agent.phone || "—"} mono />
          </div>
        </Card>
        <Card className="col-span-2">
          <CardHeader title={t.notes} />
          <div className="p-5">
            <div className="text-[13.5px] leading-relaxed" style={{ color: tone.ink70 }}>
              {agent.notes || t.noNotes}
            </div>
          </div>
        </Card>
      </div>

      {editAgent && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-8" style={{ background: "rgba(26, 24, 20, 0.4)", backdropFilter: "blur(4px)" }} onClick={() => setEditAgent(null)}>
          <div className="w-full max-w-2xl rounded-2xl max-h-[90vh] overflow-hidden flex flex-col" style={{ background: tone.card, border: `1px solid ${tone.line}`, boxShadow: "0 30px 80px -20px rgba(0,0,0,0.3)" }} onClick={(e) => e.stopPropagation()}>
            <div className="px-8 py-6 flex items-center justify-between" style={{ borderBottom: `1px solid ${tone.line}` }}>
              <div>
                <div className="text-[11px] uppercase tracking-[0.14em]" style={{ color: tone.ink50 }}>
                  {t.edit}
                </div>
                <div className="font-serif" style={{ fontSize: 26, color: tone.ink, marginTop: 2 }}>
                  {editAgent.name}
                </div>
              </div>
              <button onClick={() => setEditAgent(null)} className="w-8 h-8 rounded-full flex items-center justify-center" style={{ background: tone.paperDeep, color: tone.ink70 }}>
                x
              </button>
            </div>
            <div className="flex-1 overflow-auto px-8 py-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <LabeledField label={t.name}>
                  <EditorialInput value={editAgent.name || ""} onChange={(v) => updateField("name", v)} />
                </LabeledField>
                <LabeledField label={t.team}>
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
                <LabeledField label={t.email}>
                  <EditorialInput value={editAgent.email || ""} onChange={(v) => updateField("email", v)} mono />
                </LabeledField>
                <LabeledField label={t.phone}>
                  <EditorialInput value={editAgent.phone || ""} onChange={(v) => updateField("phone", v)} mono />
                </LabeledField>
                <LabeledField label={t.licenseNumber}>
                  <EditorialInput value={editAgent.licenseNumber || ""} onChange={(v) => updateField("licenseNumber", v)} mono />
                </LabeledField>
                <LabeledField label={t.agentKeep}>
                  <EditorialInput value={editAgent.splitPct ?? DEFAULT_AGENT_SPLIT_PCT} onChange={(v) => updateField("splitPct", Number(v))} type="number" mono />
                </LabeledField>
                <LabeledField label={t.licensedCompany}>
                  <EditorialInput value={editAgent.licensedCompany || ""} onChange={(v) => updateField("licensedCompany", v)} />
                </LabeledField>
                <LabeledField label={t.joined}>
                  <EditorialInput value={editAgent.joinedAt || ""} onChange={(v) => updateField("joinedAt", v)} type="date" mono />
                </LabeledField>
              </div>
              <LabeledField label={t.notes}>
                <textarea
                  value={editAgent.notes || ""}
                  onChange={(e) => updateField("notes", e.target.value)}
                  rows={3}
                  className="w-full rounded-lg p-3 text-[13.5px] outline-none"
                  style={{ background: tone.card, border: `1px solid ${tone.line}`, color: tone.ink, resize: "vertical" }}
                />
              </LabeledField>
            </div>
            <div className="px-8 py-5 flex items-center justify-end gap-2" style={{ borderTop: `1px solid ${tone.line}`, background: tone.paper }}>
              <Btn variant="outline" onClick={() => setEditAgent(null)}>
                {t.cancel}
              </Btn>
              <Btn variant="primary" onClick={handleSave} disabled={saving}>
                {saving ? t.saving : t.save}
              </Btn>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
