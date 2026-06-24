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
import type { Agent, Deal, Team } from "@/db/schema";

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
      toast.error("Name is required");
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
      toast.success("Agent saved");
      setEditAgent(null);
      load();
    } catch {
      toast.error("Save failed");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!payload?.agent) return;
    if (!confirm(`Deactivate ${payload.agent.name}?`)) return;
    try {
      const res = await fetch(`/api/agents/${payload.agent.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
      toast.success("Agent deactivated");
      router.push("/agents");
    } catch {
      toast.error("Delete failed");
    }
  };

  const monthOptions = useMemo(
    () => [
      { label: "This month", value: thisMonth },
      { label: "Last month", value: previousMonth(thisMonth) },
    ],
    [thisMonth]
  );

  if (loading) {
    return (
      <div className="py-24 text-center text-[13px]" style={{ color: tone.ink50 }}>
        Loading…
      </div>
    );
  }

  if (!payload?.agent || !report) {
    return (
      <div className="py-24 text-center">
        <div className="font-serif text-2xl" style={{ color: tone.ink }}>
          Agent not found
        </div>
        <Link href="/agents" className="mt-4 inline-block text-[13px] underline" style={{ color: tone.accent }}>
          Back to agents
        </Link>
      </div>
    );
  }

  const { agent, teamName } = payload;

  return (
    <div className="space-y-7">
      <div className="space-y-4">
        <Link href="/agents" className="inline-flex items-center gap-1.5 text-[12.5px]" style={{ color: tone.ink50 }}>
          <Icons.Back /> Back to agents
        </Link>
        <PageHeader
          eyebrow="Agent"
          title={agent.name}
          description={`${agent.licenseNumber || "No license #"} · ${agent.licensedCompany || "No company"}`}
          actions={
            <>
              <Pill tone="accent">{splitLabel(agent.splitPct)} split</Pill>
              <span className="mr-1 text-[12px]" style={{ color: tone.ink50 }}>
                {teamName || "Unassigned"}
              </span>
              <Btn variant="outline" icon={<Icons.Edit />} onClick={() => setEditAgent(agent)}>
                Edit
              </Btn>
              <Btn variant="danger" icon={<Icons.Trash />} onClick={handleDelete}>
                Deactivate
              </Btn>
            </>
          }
        />
      </div>

      <div className="grid grid-cols-4 gap-4">
        {[
          ["MTD Rental", report.summary.mtdDeals, ""],
          ["MTD Take", `$${fmtMoney(report.summary.mtdTake)}`, month],
          ["YTD Rental", report.summary.ytdDeals, month.slice(0, 4)],
          ["YTD Take", `$${fmtMoney(report.summary.ytdTake)}`, month.slice(0, 4)],
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
        <CardHeader title={`Rental for ${month}`} />
        <div className="grid text-[11px] uppercase tracking-[0.1em] px-6 py-3" style={{ gridTemplateColumns: "1fr 2fr 1fr 1fr 1fr", color: tone.ink50, borderBottom: `1px solid ${tone.lineSoft}` }}>
          <div>Rental #</div>
          <div>Building / Tenant</div>
          <div>Rental date</div>
          <div className="text-right">Commission</div>
          <div className="text-right">Personal take</div>
        </div>
        {report.deals.length === 0 ? (
          <div className="px-6 py-14 text-center">
            <div className="font-serif mb-2" style={{ fontSize: 22, color: tone.ink }}>
              No rental deals this month
            </div>
            <p className="text-[13px]" style={{ color: tone.ink50 }}>
              This agent has no tracked commissions for {month}.
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
                  {buildingName || "—"} · Unit {deal.unit}
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
          <CardHeader title="Contact" />
          <div className="p-5 space-y-4">
            <SoftField label="Email" value={agent.email || "—"} mono />
            <SoftField label="Phone" value={agent.phone || "—"} mono />
          </div>
        </Card>
        <Card className="col-span-2">
          <CardHeader title="Notes" />
          <div className="p-5">
            <div className="text-[13.5px] leading-relaxed" style={{ color: tone.ink70 }}>
              {agent.notes || "No notes yet."}
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
                  Edit
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
                <LabeledField label="Name *">
                  <EditorialInput value={editAgent.name || ""} onChange={(v) => updateField("name", v)} />
                </LabeledField>
                <LabeledField label="Team">
                  <select
                    value={editAgent.teamId || ""}
                    onChange={(e) => updateField("teamId", e.target.value ? Number(e.target.value) : null)}
                    className="w-full h-10 rounded-lg px-3 text-[13.5px] outline-none"
                    style={{ background: tone.card, border: `1px solid ${tone.line}`, color: tone.ink }}
                  >
                    <option value="">Unassigned</option>
                    {teams.map((team) => (
                      <option key={team.id} value={team.id}>
                        {team.name}
                      </option>
                    ))}
                  </select>
                </LabeledField>
                <LabeledField label="Email">
                  <EditorialInput value={editAgent.email || ""} onChange={(v) => updateField("email", v)} mono />
                </LabeledField>
                <LabeledField label="Phone">
                  <EditorialInput value={editAgent.phone || ""} onChange={(v) => updateField("phone", v)} mono />
                </LabeledField>
                <LabeledField label="License #">
                  <EditorialInput value={editAgent.licenseNumber || ""} onChange={(v) => updateField("licenseNumber", v)} mono />
                </LabeledField>
                <LabeledField label="Agent keep %">
                  <EditorialInput value={editAgent.splitPct ?? DEFAULT_AGENT_SPLIT_PCT} onChange={(v) => updateField("splitPct", Number(v))} type="number" mono />
                </LabeledField>
                <LabeledField label="Licensed company">
                  <EditorialInput value={editAgent.licensedCompany || ""} onChange={(v) => updateField("licensedCompany", v)} />
                </LabeledField>
                <LabeledField label="Joined">
                  <EditorialInput value={editAgent.joinedAt || ""} onChange={(v) => updateField("joinedAt", v)} type="date" mono />
                </LabeledField>
              </div>
              <LabeledField label="Notes">
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
                Cancel
              </Btn>
              <Btn variant="primary" onClick={handleSave} disabled={saving}>
                {saving ? "Saving…" : "Save"}
              </Btn>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
