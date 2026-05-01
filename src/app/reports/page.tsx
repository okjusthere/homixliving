"use client";

import { useEffect, useMemo, useState } from "react";
import { Btn, Card, Icons } from "@/components/homix/primitives";
import { fmtMoney, tone } from "@/components/homix/tokens";
import { getMonthKey } from "@/lib/reporting";
import type { Agent, Building } from "@/db/schema";

type ReportPayload = {
  month: string;
  summary: {
    totalDeals: number;
    totalCommission: number;
    companyPool: number;
    agentPayouts: number;
    referrerPayouts: number;
  };
  topAgents: Array<{ agent: Agent; deals: number; take: number }>;
  perBuilding: Array<{ building: Building; deals: number; totalCommission: number }>;
};

export default function ReportsPage() {
  const [month, setMonth] = useState(getMonthKey());
  const [report, setReport] = useState<ReportPayload | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/reports/monthly?month=${month}`)
      .then((r) => r.json())
      .then(setReport)
      .finally(() => setLoading(false));
  }, [month]);

  const csv = useMemo(() => {
    if (!report) return "";
    const rows = [
      ["Type", "Name", "Deals", "Amount"],
      ...report.topAgents.map((row) => ["Agent", row.agent.name, row.deals, row.take]),
      ...report.perBuilding.map((row) => ["Building", row.building.name, row.deals, row.totalCommission]),
    ];
    return rows.map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(",")).join("\n");
  }, [report]);

  const exportCsv = () => {
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `homix-report-${month}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-8">
      <div className="flex items-end justify-between">
        <div>
          <div className="text-[11px] uppercase tracking-[0.16em] mb-2" style={{ color: tone.ink50 }}>
            Reports
          </div>
          <h1 className="font-serif" style={{ fontSize: 52, lineHeight: 0.95, color: tone.ink }}>
            Reports
          </h1>
          <p className="mt-3 text-[14px]" style={{ color: tone.ink70 }}>
            Monthly commission production by agent and building.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <input
            value={month}
            onChange={(e) => setMonth(e.target.value)}
            type="month"
            className="h-10 rounded-lg px-3 text-[13.5px] font-mono outline-none"
            style={{ background: tone.card, border: `1px solid ${tone.line}`, color: tone.ink }}
          />
          <Btn variant="outline" icon={<Icons.Download />} onClick={exportCsv} disabled={!report}>
            Export CSV
          </Btn>
        </div>
      </div>

      {loading || !report ? (
        <p className="text-[13px]" style={{ color: tone.ink50 }}>
          Loading…
        </p>
      ) : (
        <>
          <div className="grid grid-cols-4 gap-4">
            {[
              ["Total deals", report.summary.totalDeals],
              ["Total commission", `$${fmtMoney(report.summary.totalCommission)}`],
              ["Company pool", `$${fmtMoney(report.summary.companyPool)}`],
              ["Agent payouts", `$${fmtMoney(report.summary.agentPayouts)}`],
            ].map(([label, value]) => (
              <Card key={label}>
                <div className="p-5">
                  <div className="text-[11px] uppercase tracking-[0.12em]" style={{ color: tone.ink50 }}>
                    {label}
                  </div>
                  <div className="mt-2 font-serif" style={{ fontSize: 34, lineHeight: 1, color: tone.ink }}>
                    {value}
                  </div>
                </div>
              </Card>
            ))}
          </div>

          <div className="grid grid-cols-2 gap-6">
            <Card>
              <div className="px-6 py-5" style={{ borderBottom: `1px solid ${tone.lineSoft}` }}>
                <div className="font-serif" style={{ fontSize: 22, color: tone.ink }}>
                  Top agents
                </div>
              </div>
              <div className="grid text-[11px] uppercase tracking-[0.1em] px-6 py-3" style={{ gridTemplateColumns: "2fr 1fr 1fr", color: tone.ink50, borderBottom: `1px solid ${tone.lineSoft}` }}>
                <div>Agent</div>
                <div>Deals</div>
                <div className="text-right">Take</div>
              </div>
              {report.topAgents.length === 0 ? (
                <div className="px-6 py-12 text-center text-[13px]" style={{ color: tone.ink50 }}>
                  No agent payouts this month.
                </div>
              ) : (
                report.topAgents.map((row, index) => (
                  <div key={row.agent.id} className="grid px-6 py-4 items-center" style={{ gridTemplateColumns: "2fr 1fr 1fr", borderBottom: index < report.topAgents.length - 1 ? `1px solid ${tone.lineSoft}` : "none" }}>
                    <div>
                      <div className="text-[13px]" style={{ color: tone.ink }}>
                        {row.agent.name}
                      </div>
                      <div className="text-[11.5px] mt-0.5" style={{ color: tone.ink50 }}>
                        {Number(row.agent.splitPct || 0)}% split
                      </div>
                    </div>
                    <div className="font-serif" style={{ fontSize: 20, color: tone.ink }}>
                      {row.deals}
                    </div>
                    <div className="text-right font-serif" style={{ fontSize: 20, color: tone.green }}>
                      ${fmtMoney(row.take)}
                    </div>
                  </div>
                ))
              )}
            </Card>

            <Card>
              <div className="px-6 py-5" style={{ borderBottom: `1px solid ${tone.lineSoft}` }}>
                <div className="font-serif" style={{ fontSize: 22, color: tone.ink }}>
                  Per building
                </div>
              </div>
              <div className="grid text-[11px] uppercase tracking-[0.1em] px-6 py-3" style={{ gridTemplateColumns: "2fr 1fr 1fr", color: tone.ink50, borderBottom: `1px solid ${tone.lineSoft}` }}>
                <div>Building</div>
                <div>Deals</div>
                <div className="text-right">Commission</div>
              </div>
              {report.perBuilding.length === 0 ? (
                <div className="px-6 py-12 text-center text-[13px]" style={{ color: tone.ink50 }}>
                  No building production this month.
                </div>
              ) : (
                report.perBuilding.map((row, index) => (
                  <div key={row.building.id} className="grid px-6 py-4 items-center" style={{ gridTemplateColumns: "2fr 1fr 1fr", borderBottom: index < report.perBuilding.length - 1 ? `1px solid ${tone.lineSoft}` : "none" }}>
                    <div>
                      <div className="text-[13px]" style={{ color: tone.ink }}>
                        {row.building.name}
                      </div>
                      <div className="text-[11.5px] mt-0.5" style={{ color: tone.ink50 }}>
                        {row.building.region}
                      </div>
                    </div>
                    <div className="font-serif" style={{ fontSize: 20, color: tone.ink }}>
                      {row.deals}
                    </div>
                    <div className="text-right font-serif" style={{ fontSize: 20, color: tone.ink }}>
                      ${fmtMoney(row.totalCommission)}
                    </div>
                  </div>
                ))
              )}
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
