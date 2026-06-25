"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { toast } from "sonner";
import { Btn, Card, Icons, Pill, SoftField } from "@/components/homix/primitives";
import { CardHeader, PageHeader } from "@/components/homix/page-kit";
import { DealBreakdownBar } from "@/components/homix/deal-breakdown";
import { fmtDate, fmtLongDate, fmtMoney, tone } from "@/components/homix/tokens";
import type { Agent, Building, Deal, Invoice } from "@/db/schema";
import type { CommissionBreakdown } from "@/lib/commission";
import { sourceEmoji, sourceLabel } from "@/lib/sources";
import { companySplitPct, normalizeSplitPct, splitLabel } from "@/lib/splits";
import {
  invoicePaymentTone,
  summarizeInvoicePayment,
  type InvoicePaymentSummary,
} from "@/lib/invoice-payment";
import { useLocale } from "@/lib/i18n-client";

const M = {
  en: {
    backToRental: "Back to rental",
    rentalNotFound: "Rental not found",
    loading: "Loading…",
    edit: "Edit",
    cancelRental: "Cancel rental",
    creating: "Creating…",
    createInvoice: "Create Invoice",
    totalCommission: "Total Commission",
    rentalDate: "Rental date",
    buildingTenant: "Building / Tenant",
    building: "Building",
    unit: "Unit",
    tenant: "Tenant",
    address: "Address",
    leaseDetails: "Lease Details",
    moveIn: "Move-in",
    term: "Term",
    months: "months",
    monthlyRent: "Monthly rent",
    tenantContact: "Tenant contact",
    source: "Source",
    agents: "Agents",
    primary: "Primary",
    agent: "Agent",
    split: "split",
    agentKeeps: "Agent keeps",
    homixKeeps: "Homix keeps",
    notes: "Notes",
    paymentStatus: "Payment Status",
    outstanding: "Outstanding",
    received: "Received",
    sent: "Sent",
    paid: "Paid",
    view: "View",
    commissionBreakdown: "Commission Breakdown",
    referrer: "Referrer",
    companyPool: "Company pool",
    take: "take",
    agentTakeTotal: "Agent take total",
    referrerTotal: "Referrer total",
    payReferrerVia: "Pay referrer via",
    unknown: "Unknown",
    linkedInvoices: "Linked Invoices",
    create: "Create",
    noInvoicesLinked: "No invoices linked",
    createDraftInvoice: "Create a draft invoice from this rental.",
    paidPrefix: "Paid",
    sentPrefix: "Sent",
    createdPrefix: "Created",
    toastInvoiceCreated: "Invoice created",
    toastInvoiceFailed: "Invoice creation failed",
    confirmCancel: "Cancel this rental deal?",
    toastRentalCancelled: "Rental cancelled",
    toastCancelFailed: "Cancel failed",
    payAwaiting: (amt: string) => `Homix has not received $${amt} from the building yet.`,
    payReceivedOn: (date: string) => `Homix received payment on ${date}.`,
    payReceived: (amt: string) => `Homix received $${amt}.`,
    payDraft: "Invoice exists but has not been sent to the building yet.",
    payFailed: "The latest invoice send failed and needs attention.",
    payNone: "No invoice has been created for this rental yet.",
  },
  zh: {
    backToRental: "返回租赁",
    rentalNotFound: "未找到租赁",
    loading: "加载中…",
    edit: "编辑",
    cancelRental: "取消租赁",
    creating: "创建中…",
    createInvoice: "创建发票",
    totalCommission: "佣金合计",
    rentalDate: "租赁日期",
    buildingTenant: "楼盘 / 租客",
    building: "楼盘",
    unit: "单元",
    tenant: "租客",
    address: "地址",
    leaseDetails: "租约详情",
    moveIn: "入住",
    term: "租期",
    months: "个月",
    monthlyRent: "月租金",
    tenantContact: "租客联系方式",
    source: "来源",
    agents: "经纪人",
    primary: "主理",
    agent: "经纪人",
    split: "分成",
    agentKeeps: "经纪人保留",
    homixKeeps: "Homix 保留",
    notes: "备注",
    paymentStatus: "付款状态",
    outstanding: "待付",
    received: "已收",
    sent: "已发送",
    paid: "已付款",
    view: "查看",
    commissionBreakdown: "佣金明细",
    referrer: "推荐人",
    companyPool: "公司池",
    take: "所得",
    agentTakeTotal: "经纪人所得合计",
    referrerTotal: "推荐人合计",
    payReferrerVia: "付款给推荐人方式",
    unknown: "未知",
    linkedInvoices: "关联发票",
    create: "创建",
    noInvoicesLinked: "暂无关联发票",
    createDraftInvoice: "从此租赁创建一张草稿发票。",
    paidPrefix: "已付款",
    sentPrefix: "已发送",
    createdPrefix: "已创建",
    toastInvoiceCreated: "发票已创建",
    toastInvoiceFailed: "发票创建失败",
    confirmCancel: "取消这笔租赁交易？",
    toastRentalCancelled: "租赁已取消",
    toastCancelFailed: "取消失败",
    payAwaiting: (amt: string) => `Homix 尚未收到来自楼盘的 $${amt}。`,
    payReceivedOn: (date: string) => `Homix 已于 ${date} 收到付款。`,
    payReceived: (amt: string) => `Homix 已收到 $${amt}。`,
    payDraft: "发票已存在，但尚未发送给楼盘。",
    payFailed: "最近一次发票发送失败，需要处理。",
    payNone: "尚未为此租赁创建发票。",
  },
} as const;

type DealPayload = {
  deal: Deal;
  building: Building | null;
  agents: Array<{
    agent: Agent;
    sharePct: number;
    isPrimary: boolean;
  }>;
  primaryAgent: Agent | null;
  linkedInvoices: Invoice[];
  invoiceSummary: InvoicePaymentSummary;
};

function statusTone(status: string) {
  if (status === "completed") return "sent";
  if (status === "cancelled") return "failed";
  return "accent";
}

function paymentDetail(summary: InvoicePaymentSummary, t: (typeof M)[keyof typeof M]) {
  if (summary.status === "awaiting_payment") {
    return t.payAwaiting(fmtMoney(summary.totalOutstanding));
  }
  if (summary.status === "paid") {
    return summary.paidAt
      ? t.payReceivedOn(fmtDate(summary.paidAt))
      : t.payReceived(fmtMoney(summary.totalPaid));
  }
  if (summary.status === "draft") {
    return t.payDraft;
  }
  if (summary.status === "failed") {
    return t.payFailed;
  }
  return t.payNone;
}

export default function DealDetailPage() {
  const params = useParams();
  const router = useRouter();
  const t = M[useLocale()];
  const id = String(params.id);
  const [payload, setPayload] = useState<DealPayload | null>(null);
  const [breakdown, setBreakdown] = useState<CommissionBreakdown | null>(null);
  const [loading, setLoading] = useState(true);
  const [creatingInvoice, setCreatingInvoice] = useState(false);

  const load = () => {
    setLoading(true);
    Promise.all([
      fetch(`/api/rental/${id}`).then((r) => r.json()),
      fetch(`/api/rental/${id}/breakdown`).then((r) => r.json()),
    ])
      .then(([dealData, breakdownData]) => {
        setPayload(dealData);
        setBreakdown(breakdownData);
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const createInvoice = async () => {
    setCreatingInvoice(true);
    try {
      const res = await fetch(`/api/rental/${id}/create-invoice`, { method: "POST" });
      if (!res.ok) throw new Error();
      const data = await res.json();
      toast.success(t.toastInvoiceCreated);
      router.push(`/invoices/${data.invoiceId}`);
    } catch {
      toast.error(t.toastInvoiceFailed);
    } finally {
      setCreatingInvoice(false);
    }
  };

  const cancelDeal = async () => {
    if (!payload?.deal) return;
    if (!confirm(t.confirmCancel)) return;
    const updatePayload = {
      ...payload.deal,
      status: "cancelled",
      agents: payload.agents.map((participant) => ({
        agentId: participant.agent.id,
        sharePct: participant.sharePct,
        isPrimary: participant.isPrimary,
      })),
    };
    try {
      const res = await fetch(`/api/rental/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updatePayload),
      });
      if (!res.ok) throw new Error();
      toast.success(t.toastRentalCancelled);
      load();
    } catch {
      toast.error(t.toastCancelFailed);
    }
  };

  if (loading) {
    return (
      <div className="py-24 text-center text-[13px]" style={{ color: tone.ink50 }}>
        {t.loading}
      </div>
    );
  }

  if (!payload?.deal || !payload.building || !payload.primaryAgent || !breakdown) {
    return (
      <div className="py-24 text-center">
        <div className="font-serif text-2xl" style={{ color: tone.ink }}>
          {t.rentalNotFound}
        </div>
        <Link href="/rental" className="mt-4 inline-block text-[13px] underline" style={{ color: tone.accent }}>
          {t.backToRental}
        </Link>
      </div>
    );
  }

  const { deal, building, linkedInvoices, invoiceSummary } = payload;
  const referrerDisplayName = deal.referrerName || null;
  const referrerLabel =
    deal.referrerType === "percent"
      ? `${deal.referrerAmount || 0}%`
      : deal.referrerType === "flat"
      ? `$${fmtMoney(Number(deal.referrerAmount || 0))}`
      : "";

  return (
    <div className="space-y-7">
      <div className="space-y-4">
        <Link href="/rental" className="flex w-fit items-center gap-1.5 text-[12.5px]" style={{ color: tone.ink50 }}>
          <Icons.Back /> {t.backToRental}
        </Link>
        <PageHeader
          eyebrow={`Rental · #${deal.id}`}
          title={deal.tenantName}
          description={`${t.unit} ${deal.unit} · ${building.name}`}
          actions={
            <>
              <Pill tone={statusTone(deal.status)}>{deal.status}</Pill>
              <Btn variant="outline" icon={<Icons.Edit />} onClick={() => router.push(`/rental/${id}/edit`)}>
                {t.edit}
              </Btn>
              {deal.status !== "cancelled" && (
                <Btn variant="danger" icon={<Icons.Trash />} onClick={cancelDeal}>
                  {t.cancelRental}
                </Btn>
              )}
              <Btn variant="primary" icon={<Icons.Doc />} onClick={createInvoice} disabled={creatingInvoice || deal.status === "cancelled"}>
                {creatingInvoice ? t.creating : t.createInvoice}
              </Btn>
            </>
          }
        />
      </div>

      <div className="grid gap-8" style={{ gridTemplateColumns: "minmax(0, 1fr) 520px" }}>
        <div className="space-y-6">
          <Card>
            <div className="p-8">
              <div className="text-[11px] uppercase tracking-[0.14em]" style={{ color: tone.ink50 }}>
                {t.totalCommission}
              </div>
              <div className="font-serif" style={{ fontSize: 76, lineHeight: 0.9, color: tone.ink, marginTop: 8 }}>
                <span style={{ fontSize: 32, color: tone.ink50, marginRight: 6 }}>$</span>
                {fmtMoney(Number(deal.totalCommission || 0))}
              </div>
              <div className="mt-4 text-[12.5px]" style={{ color: tone.ink70 }}>
                {t.rentalDate} <span className="font-mono">{fmtDate(deal.dealDate || deal.createdAt)}</span>
              </div>
            </div>
          </Card>

          <div className="grid grid-cols-2 gap-4">
            <Card>
              <div className="p-6 space-y-4">
                <div className="text-[11px] uppercase tracking-[0.12em]" style={{ color: tone.ink50 }}>
                  {t.buildingTenant}
                </div>
                <SoftField label={t.building} value={building.name} />
                <SoftField label={t.unit} value={deal.unit} mono />
                <SoftField label={t.tenant} value={deal.tenantName} />
                <SoftField label={t.address} value={deal.apartmentAddress || building.billToAddress || "—"} />
              </div>
            </Card>
            <Card>
              <div className="p-6 space-y-4">
                <div className="text-[11px] uppercase tracking-[0.12em]" style={{ color: tone.ink50 }}>
                  {t.leaseDetails}
                </div>
                <SoftField label={t.moveIn} value={deal.moveInDate ? fmtLongDate(deal.moveInDate) : "—"} />
                <SoftField label={t.term} value={deal.leaseLengthMonths ? `${deal.leaseLengthMonths} ${t.months}` : "—"} mono />
                <SoftField label={t.monthlyRent} value={deal.rentAmount ? `$${fmtMoney(Number(deal.rentAmount))}` : "—"} mono />
                <SoftField label={t.tenantContact} value={[deal.tenantEmail, deal.tenantPhone].filter(Boolean).join(" · ") || "—"} />
                <SoftField
                  label={t.source}
                  value={
                    deal.source ? (
                      <span className="inline-flex items-center gap-1.5">
                        <span>{sourceEmoji(deal.source)}</span>
                        <span>{sourceLabel(deal.source)}</span>
                      </span>
                    ) : (
                      "—"
                    )
                  }
                />
              </div>
            </Card>
          </div>

          <Card>
            <CardHeader title={t.agents} />
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
                    {splitLabel(participant.agent.splitPct)} {t.split} · {t.agentKeeps} {normalizeSplitPct(participant.agent.splitPct)}% · {t.homixKeeps} {companySplitPct(participant.agent.splitPct)}%
                  </div>
                  <div className="mt-1 text-[12px]" style={{ color: tone.ink50 }}>
                    {participant.agent.licensedCompany || deal.licensedCompany}
                  </div>
                </div>
              ))}
            </div>
          </Card>

          {deal.notes && (
            <Card>
              <div className="p-6">
                <div className="text-[11px] uppercase tracking-[0.12em] mb-3" style={{ color: tone.ink50 }}>
                  {t.notes}
                </div>
                <div className="text-[13.5px] leading-relaxed" style={{ color: tone.ink70 }}>
                  {deal.notes}
                </div>
              </div>
            </Card>
          )}
        </div>

        <div>
          <div className="sticky top-24 space-y-6">
            <Card>
              <CardHeader
                title={t.paymentStatus}
                action={
                  <Pill tone={invoicePaymentTone(invoiceSummary.status)}>
                    {invoiceSummary.label}
                  </Pill>
                }
              />
              <div className="p-6">
                <p className="text-[13.5px] leading-relaxed" style={{ color: tone.ink70 }}>
                  {paymentDetail(invoiceSummary, t)}
                </p>
                <div className="mt-5 grid grid-cols-2 gap-3">
                  <SoftField
                    label={t.outstanding}
                    value={`$${fmtMoney(invoiceSummary.totalOutstanding)}`}
                    mono
                  />
                  <SoftField
                    label={t.received}
                    value={`$${fmtMoney(invoiceSummary.totalPaid)}`}
                    mono
                  />
                  <SoftField
                    label={t.sent}
                    value={invoiceSummary.sentAt ? fmtDate(invoiceSummary.sentAt) : "—"}
                    mono
                  />
                  <SoftField
                    label={t.paid}
                    value={invoiceSummary.paidAt ? fmtDate(invoiceSummary.paidAt) : "—"}
                    mono
                  />
                </div>
                {invoiceSummary.latestInvoiceId && (
                  <Link
                    href={`/invoices/${invoiceSummary.latestInvoiceId}`}
                    className="mt-5 inline-flex items-center gap-1.5 text-[12.5px] underline"
                    style={{ color: tone.accent }}
                  >
                    {t.view} {invoiceSummary.latestInvoiceNumber}
                  </Link>
                )}
              </div>
            </Card>

            <Card>
              <CardHeader title={t.commissionBreakdown} />
              <div className="p-6">
                <DealBreakdownBar breakdown={breakdown} />
                <div className="mt-6 space-y-3 text-[13px]">
                  <div className="flex justify-between" style={{ color: tone.ink }}>
                    <span>{t.totalCommission}</span>
                    <span className="font-mono">${fmtMoney(breakdown.totalCommission)}</span>
                  </div>
                  {referrerDisplayName && (
                    <div className="flex justify-between" style={{ color: tone.amber }}>
                      <span>{t.referrer} ({referrerDisplayName}, {referrerLabel})</span>
                      <span className="font-mono">-${fmtMoney(breakdown.referrerCut)}</span>
                    </div>
                  )}
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
                  <div className="flex justify-between font-medium" style={{ color: tone.amber }}>
                    <span>{t.referrerTotal}</span>
                    <span className="font-mono">${fmtMoney(breakdown.referrerCut)}</span>
                  </div>
                </div>
                {deal.referrerPaymentInfo && (
                  <div
                    className="mt-6 rounded-lg p-4"
                    style={{ background: tone.amberSoft }}
                  >
                    <div
                      className="text-[10.5px] uppercase tracking-[0.14em] mb-1.5"
                      style={{ color: tone.amber }}
                    >
                      {t.payReferrerVia}
                    </div>
                    <pre
                      className="font-mono text-[12.5px] whitespace-pre-wrap break-words"
                      style={{ color: tone.ink }}
                    >
                      {deal.referrerPaymentInfo}
                    </pre>
                  </div>
                )}
              </div>
            </Card>

            <Card>
              <CardHeader
                title={t.linkedInvoices}
                action={
                  linkedInvoices.length === 0 ? (
                    <Btn variant="primary" size="sm" icon={<Icons.Doc />} onClick={createInvoice} disabled={creatingInvoice || deal.status === "cancelled"}>
                      {t.create}
                    </Btn>
                  ) : undefined
                }
              />
              <div>
                {linkedInvoices.length === 0 ? (
                  <div className="px-6 py-10 text-center">
                    <div className="font-serif mb-2" style={{ fontSize: 22, color: tone.ink }}>
                      {t.noInvoicesLinked}
                    </div>
                    <p className="text-[13px]" style={{ color: tone.ink50 }}>
                      {t.createDraftInvoice}
                    </p>
                  </div>
                ) : (
                  linkedInvoices.map((invoice, index) => {
                    const summary = summarizeInvoicePayment([invoice]);
                    return (
                      <Link
                        key={invoice.id}
                        href={`/invoices/${invoice.id}`}
                        className="flex items-center justify-between gap-4 px-6 py-4 transition-colors hover:bg-[#FAF7F0]"
                        style={{ borderBottom: index < linkedInvoices.length - 1 ? `1px solid ${tone.lineSoft}` : "none" }}
                      >
                        <div>
                          <div className="font-mono text-[12.5px]" style={{ color: tone.ink }}>
                            {invoice.invoiceNumber}
                          </div>
                          <div className="text-[11.5px] mt-0.5" style={{ color: tone.ink50 }}>
                            {invoice.status === "paid" && invoice.paidAt
                              ? `${t.paidPrefix} ${fmtDate(invoice.paidAt)}`
                              : invoice.status === "sent" && invoice.sentAt
                              ? `${t.sentPrefix} ${fmtDate(invoice.sentAt)}`
                              : `${t.createdPrefix} ${fmtDate(invoice.createdAt)}`}
                          </div>
                        </div>
                        <div className="text-right">
                          <Pill tone={invoicePaymentTone(summary.status)}>
                            {summary.label}
                          </Pill>
                          <div className="mt-1 font-serif" style={{ fontSize: 18, color: tone.ink }}>
                            ${fmtMoney(Number(invoice.totalAmount || 0))}
                          </div>
                        </div>
                      </Link>
                    );
                  })
                )}
              </div>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
