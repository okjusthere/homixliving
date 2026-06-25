"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { Btn, Card, Icons } from "@/components/homix/primitives";
import { PageHeader, CardHeader } from "@/components/homix/page-kit";
import { fmtMoney, tone } from "@/components/homix/tokens";
import { AgingSection } from "@/components/homix/aging-section";
import { getMonthKey } from "@/lib/reporting";
import { sourceEmoji, sourceLabel } from "@/lib/sources";
import { useLocale } from "@/lib/i18n-client";
import type { Agent, Building } from "@/db/schema";

const M = {
  en: {
    eyebrow: "Reports",
    title: "Reports",
    description: "Monthly commission production by agent and building.",
    exportCsv: "Export CSV",
    loading: "Loading…",
    totalDeals: "Total rental deals",
    totalCommission: "Total commission",
    companyPool: "Company pool",
    agentPayouts: "Agent payouts",
    topAgents: "Top agents",
    colAgent: "Agent",
    colRentalDeals: "Rental Deals",
    colTake: "Take",
    noAgentPayouts: "No agent payouts this month.",
    split: "split",
    perBuilding: "Per building",
    colBuilding: "Building",
    colCommission: "Commission",
    noBuildingProduction: "No building production this month.",
    bySource: "By source",
    bySourceSubtitle: "Where this month’s rental deals came from",
    unknown: "Unknown",
  },
  zh: {
    eyebrow: "报表",
    title: "报表",
    description: "按经纪人和楼盘统计的月度佣金业绩。",
    exportCsv: "导出 CSV",
    loading: "加载中…",
    totalDeals: "租赁交易总数",
    totalCommission: "佣金合计",
    companyPool: "公司池",
    agentPayouts: "经纪人分成",
    topAgents: "业绩第一",
    colAgent: "经纪人",
    colRentalDeals: "租赁交易",
    colTake: "分成",
    noAgentPayouts: "本月暂无经纪人分成。",
    split: "分成比例",
    perBuilding: "按楼盘",
    colBuilding: "楼盘",
    colCommission: "佣金",
    noBuildingProduction: "本月暂无楼盘业绩。",
    bySource: "按来源",
    bySourceSubtitle: "本月租赁交易的来源",
    unknown: "未知",
  },
} as const;

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
  perSource: Array<{ source: string; deals: number; totalCommission: number }>;
};

export default function ReportsPage() {
  const router = useRouter();
  const t = M[useLocale()];
  const { data: session, status } = useSession();
  const [month, setMonth] = useState(getMonthKey());
  const [report, setReport] = useState<ReportPayload | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (status !== "authenticated") return;
    if (!session.user.isAdmin) {
      router.replace("/");
      return;
    }
    let cancelled = false;
    fetch(`/api/reports/monthly?month=${month}`)
      .then((r) => {
        if (!r.ok) {
          if (r.status === 403) router.replace("/");
          throw new Error("Report fetch failed");
        }
        return r.json();
      })
      .then((data) => {
        if (!cancelled) setReport(data);
      })
      .catch(() => {
        if (!cancelled) setReport(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [month, router, session?.user.isAdmin, status]);

  const csv = useMemo(() => {
    if (!report) return "";
    const rows = [
      ["Type", "Name", "Rental Deals", "Amount"],
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
    <div className="space-y-7">
      <PageHeader
        eyebrow={t.eyebrow}
        title={t.title}
        description={t.description}
        actions={
          <>
            <input
              value={month}
              onChange={(e) => {
                setLoading(true);
                setMonth(e.target.value);
              }}
              type="month"
              className="h-10 rounded-lg px-3 text-[13.5px] font-mono outline-none"
              style={{ background: tone.card, border: `1px solid ${tone.line}`, color: tone.ink }}
            />
            <Btn variant="outline" icon={<Icons.Download />} onClick={exportCsv} disabled={!report}>
              {t.exportCsv}
            </Btn>
          </>
        }
      />

      {loading || !report ? (
        <p className="text-[13px]" style={{ color: tone.ink50 }}>
          {t.loading}
        </p>
      ) : (
        <>
          <div className="grid grid-cols-4 gap-4">
            {[
              [t.totalDeals, report.summary.totalDeals],
              [t.totalCommission, `$${fmtMoney(report.summary.totalCommission)}`],
              [t.companyPool, `$${fmtMoney(report.summary.companyPool)}`],
              [t.agentPayouts, `$${fmtMoney(report.summary.agentPayouts)}`],
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
              <CardHeader title={t.topAgents} />
              <div className="grid text-[11px] uppercase tracking-[0.1em] px-6 py-3" style={{ gridTemplateColumns: "2fr 1fr 1fr", color: tone.ink50, borderBottom: `1px solid ${tone.lineSoft}` }}>
                <div>{t.colAgent}</div>
                <div>{t.colRentalDeals}</div>
                <div className="text-right">{t.colTake}</div>
              </div>
              {report.topAgents.length === 0 ? (
                <div className="px-6 py-12 text-center text-[13px]" style={{ color: tone.ink50 }}>
                  {t.noAgentPayouts}
                </div>
              ) : (
                report.topAgents.map((row, index) => (
                  <div key={row.agent.id} className="grid px-6 py-4 items-center" style={{ gridTemplateColumns: "2fr 1fr 1fr", borderBottom: index < report.topAgents.length - 1 ? `1px solid ${tone.lineSoft}` : "none" }}>
                    <div>
                      <div className="text-[13px]" style={{ color: tone.ink }}>
                        {row.agent.name}
                      </div>
                      <div className="text-[11.5px] mt-0.5" style={{ color: tone.ink50 }}>
                        {Number(row.agent.splitPct || 0)}% {t.split}
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
              <CardHeader title={t.perBuilding} />
              <div className="grid text-[11px] uppercase tracking-[0.1em] px-6 py-3" style={{ gridTemplateColumns: "2fr 1fr 1fr", color: tone.ink50, borderBottom: `1px solid ${tone.lineSoft}` }}>
                <div>{t.colBuilding}</div>
                <div>{t.colRentalDeals}</div>
                <div className="text-right">{t.colCommission}</div>
              </div>
              {report.perBuilding.length === 0 ? (
                <div className="px-6 py-12 text-center text-[13px]" style={{ color: tone.ink50 }}>
                  {t.noBuildingProduction}
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

          {/* By source */}
          {report.perSource && report.perSource.length > 0 && (
            <Card>
              <CardHeader
                title={t.bySource}
                subtitle={t.bySourceSubtitle}
              />
              <div className="p-6 grid grid-cols-3 gap-3">
                {report.perSource.map((row) => {
                  const totalDeals = report.summary.totalDeals || 1;
                  const pct = Math.round((row.deals / totalDeals) * 100);
                  const isUnknown = row.source === "unknown" || !row.source;
                  return (
                    <div
                      key={row.source}
                      className="rounded-xl p-4"
                      style={{ border: `1px solid ${tone.line}`, background: tone.card }}
                    >
                      <div className="flex items-center gap-2">
                        <span style={{ fontSize: 18 }}>
                          {isUnknown ? "❓" : sourceEmoji(row.source)}
                        </span>
                        <span className="text-[13px] font-medium" style={{ color: tone.ink }}>
                          {isUnknown ? t.unknown : sourceLabel(row.source)}
                        </span>
                      </div>
                      <div
                        className="mt-3 font-serif"
                        style={{ fontSize: 28, color: tone.ink, lineHeight: 1, letterSpacing: "-0.02em" }}
                      >
                        {row.deals}
                      </div>
                      <div className="mt-1.5 text-[11.5px]" style={{ color: tone.ink50 }}>
                        rental{row.deals === 1 ? "" : "s"} · {pct}%
                      </div>
                      <div
                        className="mt-3 h-1 rounded-full overflow-hidden"
                        style={{ background: tone.lineSoft }}
                      >
                        <div
                          style={{
                            width: `${pct}%`,
                            height: "100%",
                            background: isUnknown ? tone.ink30 : tone.accent,
                          }}
                        />
                      </div>
                      <div className="mt-2 text-[12px] font-mono" style={{ color: tone.ink70 }}>
                        ${fmtMoney(row.totalCommission)}
                      </div>
                    </div>
                  );
                })}
              </div>
            </Card>
          )}

          <div style={{ height: 1, background: tone.line, margin: "8px 0" }} />

          <AgingSection />
        </>
      )}
    </div>
  );
}
