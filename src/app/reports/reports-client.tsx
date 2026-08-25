"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Btn, Card, Icons } from "@/components/homix/primitives";
import { PageHeader, CardHeader } from "@/components/homix/page-kit";
import { fmtMoney, tone } from "@/components/homix/tokens";
import { AgingSection } from "@/components/homix/aging-section";
import { getMonthKey } from "@/lib/reporting";
import { sourceEmoji, sourceLabel } from "@/lib/sources";
import { useLocale } from "@/lib/i18n-client";
import type { Building } from "@/db/schema";

const M = {
  en: {
    eyebrow: "Reports",
    title: "Monthly report",
    companyTitle: "Company report",
    personalTitle: "My monthly report",
    companyDescription: "Company-wide production, estimated commission allocation, and actual agent disbursements.",
    personalDescription: "Your recorded sales and rentals, estimated commission, and payments actually issued to you.",
    exportCsv: "Export CSV", yearToggle: "Full year", yearMode: "YTD",
    loading: "Loading…",
    loadFailed: "The report could not be loaded. Please try again.",
    totalDeals: "Total deals",
    participatingDeals: "My deals",
    rentalShort: "rental",
    saleShort: "sale",
    totalCommission: "Total commission",
    attributableCommission: "My commission base",
    salesGrossNote: "incl. sales gross",
    companyPool: "Company pool",
    estimatedTake: "Estimated agent take",
    myEstimatedTake: "My estimated take",
    actualPaid: "Actually paid",
    teamSplitReward: "Team split",
    sponsorReward: "Sponsor reward",
    topAgents: "Agent performance",
    myProduction: "My production",
    colAgent: "Agent",
    colDeals: "Deals",
    colGross: "Commission base",
    colTake: "Estimated take",
    colPaid: "Paid",
    noAgentPayouts: "No production or payments in this period.",
    split: "split",
    perBuilding: "Per building",
    myBuildings: "My rental buildings",
    colBuilding: "Building",
    colCommission: "Commission",
    noBuildingProduction: "No building production this month.",
    bySource: "By source",
    bySourceSubtitle: "Where recorded sales and rentals came from",
    deals: "deals",
    unknown: "Unknown",
  },
  zh: {
    eyebrow: "报表",
    title: "月度报表",
    companyTitle: "公司月度报表",
    personalTitle: "我的月度报表",
    companyDescription: "查看公司整体业绩、预计佣金分配及已经实际发放给经纪人的款项。",
    personalDescription: "查看你参与的买卖与租赁、预计个人佣金及公司已经实际发放的款项。",
    exportCsv: "导出 CSV", yearToggle: "看全年", yearMode: "全年",
    loading: "加载中…",
    loadFailed: "报表暂时无法加载，请稍后重试。",
    totalDeals: "交易总数",
    participatingDeals: "我参与的交易",
    rentalShort: "租赁",
    saleShort: "买卖",
    totalCommission: "佣金合计",
    attributableCommission: "我的佣金基数",
    salesGrossNote: "含买卖毛佣",
    companyPool: "公司分成",
    estimatedTake: "预计经纪人实得",
    myEstimatedTake: "我的预计实得",
    actualPaid: "实际已发放",
    teamSplitReward: "团队分成",
    sponsorReward: "推荐奖励",
    topAgents: "经纪人业绩",
    myProduction: "我的业绩",
    colAgent: "经纪人",
    colDeals: "交易",
    colGross: "佣金基数",
    colTake: "预计实得",
    colPaid: "实际发放",
    noAgentPayouts: "本周期暂无业绩或发放记录。",
    split: "分成",
    perBuilding: "按楼盘",
    myBuildings: "我的租赁楼盘",
    colBuilding: "楼盘",
    colCommission: "佣金",
    noBuildingProduction: "本月暂无楼盘业绩。",
    bySource: "按来源",
    bySourceSubtitle: "已登记买卖与租赁的客户来源",
    deals: "笔交易",
    unknown: "未知",
  },
} as const;

type ReportAgent = {
  id: number;
  name: string;
  splitPct: number;
};

type ReportPayload = {
  month: string;
  scope: "company" | "personal";
  summary: {
    totalDeals: number;
    rentalDeals: number;
    salesDeals: number;
    totalCommission: number;
    salesGrossCommission: number;
    salesCommissionBase: number;
    companyPool: number;
    agentPayouts: number;
    actualPaid: number;
    referrerPayouts: number;
    sponsorRewards: number;
    teamLeaderRewards: number;
  };
  topAgents: Array<{
    agent: ReportAgent;
    deals: number;
    gross: number;
    take: number;
    actualPaid: number;
  }>;
  perBuilding: Array<{ building: Building; deals: number; totalCommission: number }>;
  perSource: Array<{ source: string; deals: number; totalCommission: number }>;
};

export default function ReportsConsole() {
  const router = useRouter();
  const locale = useLocale();
  const t = M[locale];
  const [month, setMonth] = useState(getMonthKey());
  const [report, setReport] = useState<ReportPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/reports/monthly?month=${month}`)
      .then((r) => {
        if (r.status === 401) router.replace("/login");
        if (r.status === 403) router.replace("/pending");
        if (!r.ok) throw new Error("Report fetch failed");
        return r.json();
      })
      .then((data) => {
        if (!cancelled) {
          setReport(data);
          setError("");
        }
      })
      .catch(() => {
        if (!cancelled) {
          setReport(null);
          setError(M[locale].loadFailed);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [locale, month, router]);

  const csv = useMemo(() => {
    if (!report) return "";
    const rows = [
      [t.colAgent, t.colDeals, t.colGross, t.colTake, t.colPaid],
      ...report.topAgents.map((row) => [row.agent.name, row.deals, row.gross, row.take, row.actualPaid]),
      ...report.perBuilding.map((row) => [row.building.name, row.deals, row.totalCommission, "", ""]),
    ];
    return rows.map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(",")).join("\n");
  }, [report, t.colAgent, t.colDeals, t.colGross, t.colPaid, t.colTake]);

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
        title={
          report?.scope === "company"
            ? t.companyTitle
            : report?.scope === "personal"
            ? t.personalTitle
            : t.title
        }
        description={
          report?.scope === "company"
            ? t.companyDescription
            : report?.scope === "personal"
            ? t.personalDescription
            : undefined
        }
        actions={
          <>
            {/* Year mode: month value "YYYY" switches the API to a whole-year rollup */}
            {!/^\d{4}$/.test(month) && (
              <input
                value={month}
                onChange={(e) => {
                  setLoading(true);
                  setError("");
                  setMonth(e.target.value);
                }}
                type="month"
                className="h-10 rounded-lg px-3 text-[13.5px] font-mono outline-none"
                style={{ background: tone.card, border: `1px solid ${tone.line}`, color: tone.ink }}
              />
            )}
            <button
              type="button"
              onClick={() => {
                setLoading(true);
                setError("");
                setMonth((prev) =>
                  /^\d{4}$/.test(prev) ? getMonthKey() : prev.slice(0, 4)
                );
              }}
              className="h-10 px-3 rounded-lg text-[13px] font-medium"
              style={{
                background: /^\d{4}$/.test(month) ? tone.ink : tone.card,
                color: /^\d{4}$/.test(month) ? "#fff" : tone.ink70,
                border: `1px solid ${tone.line}`,
              }}
            >
              {/^\d{4}$/.test(month) ? `${month} ${t.yearMode}` : t.yearToggle}
            </button>
            <Btn variant="outline" icon={<Icons.Download />} onClick={exportCsv} disabled={!report}>
              {t.exportCsv}
            </Btn>
          </>
        }
      />

      {error ? (
        <Card className="p-6 text-[13px]" style={{ color: tone.rose, background: tone.roseSoft }}>
          {error}
        </Card>
      ) : loading || !report ? (
        <p className="text-[13px]" style={{ color: tone.ink50 }}>
          {t.loading}
        </p>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
            {(
              report.scope === "company"
                ? [
                    [
                      t.totalDeals,
                      String(report.summary.totalDeals),
                      `${report.summary.rentalDeals} ${t.rentalShort} · ${report.summary.salesDeals} ${t.saleShort}`,
                    ],
                    [
                      t.totalCommission,
                      `$${fmtMoney(report.summary.totalCommission)}`,
                      report.summary.salesGrossCommission
                        ? `${t.salesGrossNote} $${fmtMoney(report.summary.salesGrossCommission)}`
                        : "",
                    ],
                    [
                      t.companyPool,
                      `$${fmtMoney(report.summary.companyPool)}`,
                      `${t.teamSplitReward} $${fmtMoney(report.summary.teamLeaderRewards)} · ${t.sponsorReward} $${fmtMoney(report.summary.sponsorRewards)}`,
                    ],
                    [t.actualPaid, `$${fmtMoney(report.summary.actualPaid)}`, ""],
                  ]
                : [
                    [
                      t.participatingDeals,
                      String(report.summary.totalDeals),
                      `${report.summary.rentalDeals} ${t.rentalShort} · ${report.summary.salesDeals} ${t.saleShort}`,
                    ],
                    [t.attributableCommission, `$${fmtMoney(report.summary.totalCommission)}`, ""],
                    [
                      t.myEstimatedTake,
                      `$${fmtMoney(report.summary.agentPayouts)}`,
                      `${t.teamSplitReward} $${fmtMoney(report.summary.teamLeaderRewards)} · ${t.sponsorReward} $${fmtMoney(report.summary.sponsorRewards)}`,
                    ],
                    [t.actualPaid, `$${fmtMoney(report.summary.actualPaid)}`, ""],
                  ]
            ).map(([label, value, sub]) => (
              <Card key={label}>
                <div className="p-5">
                  <div className="text-[11px] uppercase tracking-[0.12em]" style={{ color: tone.ink50 }}>
                    {label}
                  </div>
                  <div className="mt-2 font-serif" style={{ fontSize: 34, lineHeight: 1, color: tone.ink }}>
                    {value}
                  </div>
                  {sub ? (
                    <div className="mt-1.5 text-[11.5px]" style={{ color: tone.ink50 }}>
                      {sub}
                    </div>
                  ) : null}
                </div>
              </Card>
            ))}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card className="overflow-hidden">
              <CardHeader title={report.scope === "company" ? t.topAgents : t.myProduction} />
              {report.topAgents.length === 0 ? (
                <div className="px-6 py-12 text-center text-[13px]" style={{ color: tone.ink50 }}>
                  {t.noAgentPayouts}
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <div className="min-w-[680px]">
                    <div className="grid text-[11px] uppercase tracking-[0.1em] px-6 py-3" style={{ gridTemplateColumns: "2fr .7fr 1.1fr 1.1fr 1.1fr", color: tone.ink50, borderBottom: `1px solid ${tone.lineSoft}` }}>
                      <div>{t.colAgent}</div>
                      <div>{t.colDeals}</div>
                      <div className="text-right">{t.colGross}</div>
                      <div className="text-right">{t.colTake}</div>
                      <div className="text-right">{t.colPaid}</div>
                    </div>
                    {report.topAgents.map((row, index) => (
                      <div key={row.agent.id} className="grid px-6 py-4 items-center" style={{ gridTemplateColumns: "2fr .7fr 1.1fr 1.1fr 1.1fr", borderBottom: index < report.topAgents.length - 1 ? `1px solid ${tone.lineSoft}` : "none" }}>
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
                        <div className="text-right font-serif" style={{ fontSize: 18, color: tone.ink }}>
                          ${fmtMoney(row.gross)}
                        </div>
                        <div className="text-right font-serif" style={{ fontSize: 20, color: tone.green }}>
                          ${fmtMoney(row.take)}
                        </div>
                        <div className="text-right font-serif" style={{ fontSize: 18, color: tone.ink }}>
                          ${fmtMoney(row.actualPaid)}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </Card>

            <Card className="overflow-hidden">
              <CardHeader title={report.scope === "company" ? t.perBuilding : t.myBuildings} />
              {report.perBuilding.length === 0 ? (
                <div className="px-6 py-12 text-center text-[13px]" style={{ color: tone.ink50 }}>
                  {t.noBuildingProduction}
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <div className="min-w-[360px]">
                    <div className="grid text-[11px] uppercase tracking-[0.1em] px-6 py-3" style={{ gridTemplateColumns: "2fr 1fr 1fr", color: tone.ink50, borderBottom: `1px solid ${tone.lineSoft}` }}>
                      <div>{t.colBuilding}</div>
                      <div>{t.colDeals}</div>
                      <div className="text-right">{t.colCommission}</div>
                    </div>
                    {report.perBuilding.map((row, index) => (
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
                    ))}
                  </div>
                </div>
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
              <div className="p-6 grid grid-cols-1 sm:grid-cols-3 gap-3">
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
                          {isUnknown ? t.unknown : sourceLabel(row.source, locale)}
                        </span>
                      </div>
                      <div
                        className="mt-3 font-serif"
                        style={{ fontSize: 28, color: tone.ink, lineHeight: 1, letterSpacing: "-0.02em" }}
                      >
                        {row.deals}
                      </div>
                      <div className="mt-1.5 text-[11.5px]" style={{ color: tone.ink50 }}>
                        {row.deals} {t.deals} · {pct}%
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

          {report.scope === "company" ? <AgingSection /> : null}
        </>
      )}
    </div>
  );
}
