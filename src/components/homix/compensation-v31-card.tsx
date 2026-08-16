"use client";

import { useCallback, useEffect, useState } from "react";
import type { ReactNode } from "react";
import { useSession } from "next-auth/react";
import { toast } from "sonner";
import { Btn, Card, Pill } from "@/components/homix/primitives";
import { CardHeader } from "@/components/homix/page-kit";
import { fmtMoney, tone } from "@/components/homix/tokens";
import { useLocale } from "@/lib/i18n-client";
import type { DealCompensationAllocation, DealCompensationSnapshot } from "@/db/schema";

const M = {
  en: {
    title: "Compensation · v3.1",
    estimate: "Estimate",
    finalized: "Finalized",
    gross: "Gross commission",
    source: "Source economics",
    company: "Homix Company Dollar",
    team: "Team allocation",
    fee: "Transaction fee",
    sponsor: "Sponsor share",
    net: "Agent net",
    finalize: "Approve & freeze",
    finalizing: "Finalizing…",
    finalizedToast: "Compensation frozen",
    finalizeFailed: "Unable to finalize compensation",
  },
  zh: {
    title: "分佣结算 · v3.1",
    estimate: "预估",
    finalized: "已冻结",
    gross: "总佣金",
    source: "客源经济项",
    company: "Homix Company Dollar",
    team: "团队分配",
    fee: "交易处理费",
    sponsor: "Sponsor 奖励",
    net: "经纪人实得",
    finalize: "审核并冻结",
    finalizing: "正在冻结…",
    finalizedToast: "分佣已冻结",
    finalizeFailed: "暂时无法冻结分佣",
  },
} as const;

type Payload = { snapshot: DealCompensationSnapshot; allocations: DealCompensationAllocation[] };

export function CompensationV31Card({
  dealType,
  dealId,
  fallback = null,
}: {
  dealType: "rental" | "sale";
  dealId: number;
  fallback?: ReactNode;
}) {
  const locale = useLocale();
  const t = M[locale];
  const { data: session } = useSession();
  const [payload, setPayload] = useState<Payload | null | undefined>(undefined);
  const [finalizing, setFinalizing] = useState(false);

  const load = useCallback(() => {
    fetch(`/api/compensation/${dealType}/${dealId}`)
      .then(async (response) => response.ok ? response.json() : null)
      .then(setPayload)
      .catch(() => setPayload(null));
  }, [dealId, dealType]);

  useEffect(() => load(), [load]);
  if (payload === undefined) return null;
  if (payload === null) return fallback;

  const finalize = async () => {
    setFinalizing(true);
    try {
      const response = await fetch(`/api/compensation/${dealType}/${dealId}`, { method: "POST" });
      if (!response.ok) throw new Error();
      toast.success(t.finalizedToast);
      load();
    } catch {
      toast.error(t.finalizeFailed);
    } finally {
      setFinalizing(false);
    }
  };

  const row = (label: string, amount: number) => (
    <div className="flex items-center justify-between gap-4 border-b py-3 last:border-0" style={{ borderColor: tone.lineSoft }}>
      <span className="text-[12.5px]" style={{ color: tone.ink50 }}>{label}</span>
      <span className="font-mono text-[13px]" style={{ color: tone.ink }}>${fmtMoney(Number(amount || 0))}</span>
    </div>
  );

  return (
    <Card>
      <CardHeader
        title={t.title}
        action={<Pill tone={payload.snapshot.status === "finalized" ? "sent" : "draft"}>{payload.snapshot.status === "finalized" ? t.finalized : t.estimate}</Pill>}
      />
      <div className="p-4 sm:p-6">
        {row(t.gross, payload.snapshot.grossCommission)}
        {row(t.source, Number(payload.snapshot.sourceFee) + Number(payload.snapshot.outsideReferral))}
        {row(t.company, payload.snapshot.companyDollar)}
        {row(t.team, payload.snapshot.teamAllocation)}
        {row(t.fee, payload.snapshot.transactionFee)}
        {row(t.sponsor, payload.snapshot.sponsorAmount)}
        {row(t.net, payload.snapshot.agentNetTotal)}
        {session?.user?.isAdmin && payload.snapshot.status !== "finalized" && (
          <Btn variant="primary" className="mt-5 w-full justify-center" onClick={() => void finalize()} disabled={finalizing}>
            {finalizing ? t.finalizing : t.finalize}
          </Btn>
        )}
      </div>
    </Card>
  );
}
