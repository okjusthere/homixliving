"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { toast } from "sonner";
import { Btn, Card, Icons, Pill, SoftField } from "@/components/homix/primitives";
import { PageHeader, CardHeader } from "@/components/homix/page-kit";
import { DealBreakdownBar } from "@/components/homix/deal-breakdown";
import { fmtDate, fmtLongDate, fmtMoney, tone } from "@/components/homix/tokens";
import { computeCommission } from "@/lib/commission";
import { saleRepresentationLabel, saleStageLabel } from "@/lib/sales";
import { useLocale } from "@/lib/i18n-client";
import type { Agent, SaleDeal } from "@/db/schema";

const M = {
  en: {
    backToSales: "Back to sales",
    edit: "Edit",
    editComingSoon: "Edit is coming in the next pass",
    cancelSale: "Cancel sale",
    confirmCancel: "Cancel this sale?",
    saleCancelled: "Sale cancelled",
    cancelFailed: "Cancel failed",
    loading: "Loading…",
    saleNotFound: "Sale not found",
    grossCommission: "Gross Commission",
    netSplitBase: "Net split base",
    property: "Property",
    address: "Address",
    location: "Location",
    propertyType: "Property type",
    mlsFile: "MLS / File",
    dates: "Dates",
    contractDate: "Contract date",
    closingDate: "Closing date",
    purchasePrice: "Purchase price",
    created: "Created",
    parties: "Parties",
    buyers: "Buyer(s)",
    sellers: "Seller(s)",
    homixAgents: "Homix Agents",
    primary: "Primary",
    agent: "Agent",
    agentSplit: "agent split",
    outsideContacts: "Outside Contacts",
    listingAgent: "Listing agent",
    listingEmail: "Listing email",
    listingBrokerage: "Listing brokerage",
    cooperatingAgent: "Cooperating agent",
    cooperatingEmail: "Cooperating email",
    cooperatingBrokerage: "Cooperating brokerage",
    closingContacts: "Closing Contacts",
    buyerAttorney: "Buyer attorney",
    sellerAttorney: "Seller attorney",
    titleCompany: "Title company",
    lender: "Lender",
    escrowHolder: "Escrow holder",
    notes: "Notes",
    commissionBreakdown: "Commission Breakdown",
    grossCommissionRow: "Gross commission",
    referral: "Referral",
    brokerageAdminFee: "Brokerage/admin fee",
    unknown: "Unknown",
    take: "take",
    companyPool: "Company pool",
    agentTakeTotal: "Agent take total",
  },
  zh: {
    backToSales: "返回买卖",
    edit: "编辑",
    editComingSoon: "编辑功能将在下个版本中推出",
    cancelSale: "取消交易",
    confirmCancel: "确定取消此交易吗？",
    saleCancelled: "交易已取消",
    cancelFailed: "取消失败",
    loading: "加载中…",
    saleNotFound: "未找到交易",
    grossCommission: "总佣金",
    netSplitBase: "净分成基数",
    property: "房产",
    address: "地址",
    location: "区域",
    propertyType: "房产类型",
    mlsFile: "MLS / 档案",
    dates: "日期",
    contractDate: "签约日期",
    closingDate: "过户日期",
    purchasePrice: "成交价",
    created: "创建时间",
    parties: "交易方",
    buyers: "买家",
    sellers: "卖家",
    homixAgents: "Homix 经纪人",
    primary: "主办",
    agent: "经纪人",
    agentSplit: "经纪人分成",
    outsideContacts: "外部联系人",
    listingAgent: "挂牌经纪人",
    listingEmail: "挂牌方邮箱",
    listingBrokerage: "挂牌方经纪公司",
    cooperatingAgent: "协办经纪人",
    cooperatingEmail: "协办方邮箱",
    cooperatingBrokerage: "协办方经纪公司",
    closingContacts: "过户联系人",
    buyerAttorney: "买方律师",
    sellerAttorney: "卖方律师",
    titleCompany: "产权公司",
    lender: "贷款机构",
    escrowHolder: "托管方",
    notes: "备注",
    commissionBreakdown: "佣金明细",
    grossCommissionRow: "总佣金",
    referral: "推荐",
    brokerageAdminFee: "经纪/管理费",
    unknown: "未知",
    take: "实得",
    companyPool: "公司池",
    agentTakeTotal: "经纪人实得合计",
  },
} as const;

type SalePayload = {
  saleDeal: SaleDeal;
  agents: Array<{
    agent: Agent;
    sharePct: number;
    isPrimary: boolean;
  }>;
  primaryAgent: Agent | null;
};

function statusTone(status: string) {
  if (status === "completed") return "sent";
  if (status === "cancelled") return "failed";
  return "accent";
}

export default function SaleDetailPage() {
  const t = M[useLocale()];
  const params = useParams();
  const id = String(params.id);
  const [payload, setPayload] = useState<SalePayload | null>(null);
  const [loading, setLoading] = useState(true);

  const load = () => {
    setLoading(true);
    fetch(`/api/sales/${id}`)
      .then((r) => r.json())
      .then((data) => setPayload(data))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const breakdown = useMemo(() => {
    if (!payload?.saleDeal) {
      return computeCommission({ totalCommission: 0, agents: [] });
    }
    const saleDeal = payload.saleDeal;
    const commissionBase = Math.max(
      0,
      Number(saleDeal.grossCommission || 0) -
        Number(saleDeal.referralAmount || 0) -
        Number(saleDeal.brokerageFee || 0)
    );
    return computeCommission({
      totalCommission: commissionBase,
      agents: payload.agents.map((participant) => ({
        agentId: participant.agent.id,
        name: participant.agent.name,
        sharePct: Number(participant.sharePct || 0),
        splitPct: Number(participant.agent.splitPct || 0),
        isPrimary: participant.isPrimary,
      })),
    });
  }, [payload]);

  const cancelSale = async () => {
    if (!payload?.saleDeal) return;
    if (!confirm(t.confirmCancel)) return;
    const saleDeal = payload.saleDeal;
    const updatePayload = {
      ...saleDeal,
      status: "cancelled",
      agents: payload.agents.map((participant) => ({
        agentId: participant.agent.id,
        sharePct: participant.sharePct,
        isPrimary: participant.isPrimary,
      })),
    };
    try {
      const res = await fetch(`/api/sales/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updatePayload),
      });
      if (!res.ok) throw new Error();
      toast.success(t.saleCancelled);
      load();
    } catch {
      toast.error(t.cancelFailed);
    }
  };

  if (loading) {
    return (
      <div className="py-24 text-center text-[13px]" style={{ color: tone.ink50 }}>
        {t.loading}
      </div>
    );
  }

  if (!payload?.saleDeal) {
    return (
      <div className="py-24 text-center">
        <div className="font-serif text-2xl" style={{ color: tone.ink }}>
          {t.saleNotFound}
        </div>
        <Link href="/sales" className="mt-4 inline-block text-[13px] underline" style={{ color: tone.accent }}>
          {t.backToSales}
        </Link>
      </div>
    );
  }

  const { saleDeal } = payload;
  const location = [saleDeal.city, saleDeal.state, saleDeal.zip].filter(Boolean).join(", ");
  const commissionBase = Math.max(
    0,
    Number(saleDeal.grossCommission || 0) -
      Number(saleDeal.referralAmount || 0) -
      Number(saleDeal.brokerageFee || 0)
  );

  return (
    <div className="space-y-7">
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-3">
          <Link href="/sales" className="flex items-center gap-1.5 text-[12.5px]" style={{ color: tone.ink50 }}>
            <Icons.Back /> {t.backToSales}
          </Link>
          <Pill tone={statusTone(saleDeal.status)}>{saleDeal.status}</Pill>
          <Pill tone="neutral">{saleStageLabel(saleDeal.stage)}</Pill>
          <span className="font-mono text-[12px]" style={{ color: tone.ink50 }}>
            #{saleDeal.id}
          </span>
        </div>
        <PageHeader
          eyebrow={saleRepresentationLabel(saleDeal.representationType)}
          title={saleDeal.propertyAddress}
          description={location || undefined}
          actions={
            <>
              <Btn variant="outline" icon={<Icons.Edit />} onClick={() => toast.message(t.editComingSoon)}>
                {t.edit}
              </Btn>
              {saleDeal.status !== "cancelled" && (
                <Btn variant="danger" icon={<Icons.Trash />} onClick={cancelSale}>
                  {t.cancelSale}
                </Btn>
              )}
            </>
          }
        />
      </div>

      <div className="grid gap-8" style={{ gridTemplateColumns: "minmax(0, 1fr) 520px" }}>
        <div className="space-y-6">
          <Card>
            <div className="p-8">
              <div className="text-[11px] uppercase tracking-[0.14em]" style={{ color: tone.ink50 }}>
                {t.grossCommission}
              </div>
              <div className="font-serif" style={{ fontSize: 76, lineHeight: 0.9, color: tone.ink, marginTop: 8 }}>
                <span style={{ fontSize: 32, color: tone.ink50, marginRight: 6 }}>$</span>
                {fmtMoney(Number(saleDeal.grossCommission || 0))}
              </div>
              <div className="mt-4 text-[12.5px]" style={{ color: tone.ink70 }}>
                {t.netSplitBase} <span className="font-mono">${fmtMoney(commissionBase)}</span>
              </div>
            </div>
          </Card>

          <div className="grid grid-cols-2 gap-4">
            <Card>
              <div className="p-6 space-y-4">
                <div className="text-[11px] uppercase tracking-[0.12em]" style={{ color: tone.ink50 }}>
                  {t.property}
                </div>
                <SoftField label={t.address} value={saleDeal.propertyAddress} />
                <SoftField label={t.location} value={location || "—"} />
                <SoftField label={t.propertyType} value={saleDeal.propertyType || "—"} />
                <SoftField label={t.mlsFile} value={[saleDeal.mlsNumber, saleDeal.fileId].filter(Boolean).join(" · ") || "—"} mono />
              </div>
            </Card>
            <Card>
              <div className="p-6 space-y-4">
                <div className="text-[11px] uppercase tracking-[0.12em]" style={{ color: tone.ink50 }}>
                  {t.dates}
                </div>
                <SoftField label={t.contractDate} value={saleDeal.contractDate ? fmtLongDate(saleDeal.contractDate) : "—"} />
                <SoftField label={t.closingDate} value={saleDeal.closingDate ? fmtLongDate(saleDeal.closingDate) : "—"} />
                <SoftField label={t.purchasePrice} value={saleDeal.purchasePrice ? `$${fmtMoney(Number(saleDeal.purchasePrice))}` : "—"} mono />
                <SoftField label={t.created} value={fmtDate(saleDeal.createdAt)} mono />
              </div>
            </Card>
          </div>

          <Card>
            <CardHeader title={t.parties} />
            <div className="p-6 grid grid-cols-2 gap-4">
              <SoftField label={t.buyers} value={saleDeal.buyerNames || "—"} />
              <SoftField label={t.sellers} value={saleDeal.sellerNames || "—"} />
            </div>
          </Card>

          <Card>
            <CardHeader title={t.homixAgents} />
            <div className="p-6 grid gap-4 md:grid-cols-2">
              {payload.agents.map((participant) => (
                <div
                  key={participant.agent.id}
                  className="rounded-xl p-4"
                  style={{ background: tone.paper, border: `1px solid ${tone.lineSoft}` }}
                >
                  <Pill tone={participant.isPrimary ? "accent" : "neutral"}>
                    {participant.isPrimary ? t.primary : t.agent} {Number(participant.sharePct || 0)}%
                  </Pill>
                  <div className="mt-3 font-serif" style={{ fontSize: 22, color: tone.ink }}>
                    {participant.agent.name}
                  </div>
                  <div className="mt-1 text-[12px]" style={{ color: tone.ink50 }}>
                    {Number(participant.agent.splitPct || 0)}% {t.agentSplit} · {participant.agent.licensedCompany || "Homix"}
                  </div>
                </div>
              ))}
            </div>
          </Card>

          <Card>
            <CardHeader title={t.outsideContacts} />
            <div className="p-6 grid grid-cols-2 gap-4">
              <SoftField label={t.listingAgent} value={saleDeal.listingAgentName || "—"} />
              <SoftField label={t.listingEmail} value={saleDeal.listingAgentEmail || "—"} mono />
              <SoftField label={t.listingBrokerage} value={saleDeal.listingBrokerage || "—"} />
              <SoftField label={t.cooperatingAgent} value={saleDeal.cooperatingAgentName || "—"} />
              <SoftField label={t.cooperatingEmail} value={saleDeal.cooperatingAgentEmail || "—"} mono />
              <SoftField label={t.cooperatingBrokerage} value={saleDeal.cooperatingBrokerage || "—"} />
            </div>
          </Card>

          <Card>
            <CardHeader title={t.closingContacts} />
            <div className="p-6 grid grid-cols-2 gap-4">
              <SoftField label={t.buyerAttorney} value={saleDeal.buyerAttorney || "—"} />
              <SoftField label={t.sellerAttorney} value={saleDeal.sellerAttorney || "—"} />
              <SoftField label={t.titleCompany} value={saleDeal.titleCompany || "—"} />
              <SoftField label={t.lender} value={saleDeal.lenderName || "—"} />
              <SoftField label={t.escrowHolder} value={saleDeal.escrowHolder || "—"} />
            </div>
          </Card>

          {saleDeal.notes && (
            <Card>
              <div className="p-6">
                <div className="text-[11px] uppercase tracking-[0.12em] mb-3" style={{ color: tone.ink50 }}>
                  {t.notes}
                </div>
                <div className="text-[13.5px] leading-relaxed" style={{ color: tone.ink70 }}>
                  {saleDeal.notes}
                </div>
              </div>
            </Card>
          )}
        </div>

        <div>
          <div className="sticky top-24 space-y-6">
            <Card>
              <CardHeader title={t.commissionBreakdown} />
              <div className="p-6">
                <DealBreakdownBar breakdown={breakdown} />
                <div className="mt-6 space-y-3 text-[13px]">
                  <div className="flex justify-between" style={{ color: tone.ink }}>
                    <span>{t.grossCommissionRow}</span>
                    <span className="font-mono">${fmtMoney(Number(saleDeal.grossCommission || 0))}</span>
                  </div>
                  {saleDeal.referralAmount ? (
                    <div className="flex justify-between" style={{ color: tone.amber }}>
                      <span>{t.referral}</span>
                      <span className="font-mono">-${fmtMoney(Number(saleDeal.referralAmount))}</span>
                    </div>
                  ) : null}
                  {saleDeal.brokerageFee ? (
                    <div className="flex justify-between" style={{ color: tone.amber }}>
                      <span>{t.brokerageAdminFee}</span>
                      <span className="font-mono">-${fmtMoney(Number(saleDeal.brokerageFee))}</span>
                    </div>
                  ) : null}
                  <div style={{ borderTop: `1px solid ${tone.lineSoft}` }} />
                  {breakdown.agents.map((agentBreakdown) => (
                    <div key={agentBreakdown.agentId} className="space-y-1">
                      <div className="flex justify-between" style={{ color: tone.ink }}>
                        <span>
                          {agentBreakdown.isPrimary ? t.primary : t.agent} — {agentBreakdown.name || t.unknown}
                        </span>
                        <span className="font-mono">${fmtMoney(agentBreakdown.agentTake)} {t.take}</span>
                      </div>
                      <div className="flex justify-between text-[12px]" style={{ color: tone.ink50 }}>
                        <span>{t.companyPool}</span>
                        <span className="font-mono">${fmtMoney(agentBreakdown.companyPool)}</span>
                      </div>
                    </div>
                  ))}
                  <div style={{ borderTop: `1px solid ${tone.lineSoft}` }} />
                  <div className="flex justify-between font-medium" style={{ color: tone.green }}>
                    <span>{t.agentTakeTotal}</span>
                    <span className="font-mono">${fmtMoney(breakdown.agentTakeTotal)}</span>
                  </div>
                  <div className="flex justify-between font-medium" style={{ color: tone.ink }}>
                    <span>{t.companyPool}</span>
                    <span className="font-mono">${fmtMoney(breakdown.companyPoolTotal)}</span>
                  </div>
                </div>
              </div>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
