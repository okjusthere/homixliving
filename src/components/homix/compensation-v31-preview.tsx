"use client";

import { useEffect, useState } from "react";
import { fmtMoney, tone } from "@/components/homix/tokens";
import { useLocale } from "@/lib/i18n-client";
import { PLAN_LABELS, type AgentPlan } from "@/lib/agent-plans";
import type { CompensationResult } from "@/lib/compensation-v31";

const M = {
  en: {
    title: "Automatic compensation preview",
    loading: "Calculating plan, cap, team, fee, and sponsor rules…",
    unavailable: "Complete the commission and agent shares to see the preview.",
    company: "Homix Company Dollar",
    team: "Team allocation",
    fee: "Transaction fee",
    rebate: "Client rebate",
    net: "Agent net",
  },
  zh: {
    title: "自动分佣预览",
    loading: "正在计算方案、封顶、团队、交易费与 Sponsor 规则…",
    unavailable: "填写佣金并确保经纪人份额合计 100% 后即可预览。",
    company: "Homix Company Dollar",
    team: "团队分配",
    fee: "交易处理费",
    rebate: "客户返佣",
    net: "经纪人实得",
  },
} as const;

type Participant = { agentId: number | null; name: string; sharePct: number };

export function CompensationV31Preview(props: {
  dealType: "rental" | "sale";
  effectiveDate?: string;
  grossCommission: number;
  source: string;
  outsideReferralAmount?: number;
  rebateAmount?: number;
  participants: Participant[];
}) {
  const locale = useLocale();
  const t = M[locale];
  const [result, setResult] = useState<CompensationResult | null>(null);
  const [loading, setLoading] = useState(false);
  const valid = props.grossCommission > 0 &&
    props.participants.length > 0 &&
    props.participants.every((row) => row.agentId && row.sharePct >= 0) &&
    Math.abs(props.participants.reduce((sum, row) => sum + row.sharePct, 0) - 100) <= 0.01;
  const requestKey = JSON.stringify({
    dealType: props.dealType,
    effectiveDate: props.effectiveDate,
    grossCommission: props.grossCommission,
    source: props.source,
    outsideReferralAmount: props.outsideReferralAmount || 0,
    rebateAmount: props.rebateAmount || 0,
    participants: props.participants.map((row) => ({ agentId: row.agentId, sharePct: row.sharePct })),
  });

  useEffect(() => {
    if (!valid) {
      setResult(null);
      setLoading(false);
      return;
    }
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setLoading(true);
      try {
        const response = await fetch("/api/compensation/preview", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: requestKey,
          signal: controller.signal,
        });
        setResult(response.ok ? await response.json() : null);
      } catch (error) {
        if (!(error instanceof DOMException && error.name === "AbortError")) setResult(null);
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, 300);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [requestKey, valid]);

  return (
    <div className="rounded-lg p-4" style={{ background: tone.paper, border: `1px solid ${tone.lineSoft}` }}>
      <div className="text-[11px] font-medium uppercase tracking-[0.12em]" style={{ color: tone.ink50 }}>{t.title}</div>
      {loading ? (
        <p className="mt-3 text-[12px]" style={{ color: tone.ink50 }}>{t.loading}</p>
      ) : !result ? (
        <p className="mt-3 text-[12px]" style={{ color: tone.ink50 }}>{t.unavailable}</p>
      ) : (
        <div className="mt-3 space-y-3">
          {result.allocations.map((row) => {
            const participant = props.participants.find((item) => item.agentId === row.agentId);
            return (
              <div key={row.agentId} className="rounded-md bg-white p-3" style={{ border: `1px solid ${tone.lineSoft}` }}>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-[13px]" style={{ color: tone.ink }}>{participant?.name || `#${row.agentId}`}</div>
                    <div className="mt-0.5 text-[11px]" style={{ color: tone.ink50 }}>{PLAN_LABELS[locale][row.plan as AgentPlan]} · {row.sharePct}%</div>
                  </div>
                  <div className="font-mono text-[15px]" style={{ color: tone.green }}>${fmtMoney(row.agentNet)}</div>
                </div>
                <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-[11px]" style={{ color: tone.ink50 }}>
                  <span>{t.company}</span><span className="text-right font-mono">${fmtMoney(row.companyDollar)}</span>
                  <span>{t.team}</span><span className="text-right font-mono">${fmtMoney(row.teamLeaderAllocation)}</span>
                  <span>{t.fee}</span><span className="text-right font-mono">${fmtMoney(row.transactionFee)}</span>
                  <span>{t.rebate}</span><span className="text-right font-mono">${fmtMoney(row.rebateAmount)}</span>
                  <span className="font-medium" style={{ color: tone.ink }}>{t.net}</span><span className="text-right font-mono font-medium" style={{ color: tone.green }}>${fmtMoney(row.agentNet)}</span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
