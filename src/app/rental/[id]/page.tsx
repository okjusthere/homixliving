"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { toast } from "sonner";
import { Btn, Card, Icons, Pill, SoftField } from "@/components/homix/primitives";
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

function paymentDetail(summary: InvoicePaymentSummary) {
  if (summary.status === "awaiting_payment") {
    return `Homix has not received $${fmtMoney(summary.totalOutstanding)} from the building yet.`;
  }
  if (summary.status === "paid") {
    return summary.paidAt
      ? `Homix received payment on ${fmtDate(summary.paidAt)}.`
      : `Homix received $${fmtMoney(summary.totalPaid)}.`;
  }
  if (summary.status === "draft") {
    return "Invoice exists but has not been sent to the building yet.";
  }
  if (summary.status === "failed") {
    return "The latest invoice send failed and needs attention.";
  }
  return "No invoice has been created for this rental yet.";
}

export default function DealDetailPage() {
  const params = useParams();
  const router = useRouter();
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
      toast.success("Invoice created");
      router.push(`/invoices/${data.invoiceId}`);
    } catch {
      toast.error("Invoice creation failed");
    } finally {
      setCreatingInvoice(false);
    }
  };

  const cancelDeal = async () => {
    if (!payload?.deal) return;
    if (!confirm("Cancel this rental deal?")) return;
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
      toast.success("Rental cancelled");
      load();
    } catch {
      toast.error("Cancel failed");
    }
  };

  if (loading) {
    return (
      <div className="py-24 text-center text-[13px]" style={{ color: tone.ink50 }}>
        Loading…
      </div>
    );
  }

  if (!payload?.deal || !payload.building || !payload.primaryAgent || !breakdown) {
    return (
      <div className="py-24 text-center">
        <div className="font-serif text-2xl" style={{ color: tone.ink }}>
          Rental not found
        </div>
        <Link href="/rental" className="mt-4 inline-block text-[13px] underline" style={{ color: tone.accent }}>
          Back to rental
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
    <div>
      <div className="flex items-start justify-between mb-8 gap-6">
        <div>
          <Link href="/rental" className="flex items-center gap-1.5 text-[12.5px] mb-4" style={{ color: tone.ink50 }}>
            <Icons.Back /> Back to rental
          </Link>
          <div className="flex items-center gap-3 mb-2">
            <Pill tone={statusTone(deal.status)}>{deal.status}</Pill>
            <span className="font-mono text-[12px]" style={{ color: tone.ink50 }}>
              #{deal.id}
            </span>
          </div>
          <h1 className="font-serif" style={{ fontSize: 44, lineHeight: 1, color: tone.ink }}>
            {deal.tenantName}
          </h1>
          <div className="mt-3 text-[14px]" style={{ color: tone.ink70 }}>
            Unit {deal.unit} · {building.name}
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Btn variant="outline" icon={<Icons.Edit />} onClick={() => router.push(`/rental/${id}/edit`)}>
            Edit
          </Btn>
          {deal.status !== "cancelled" && (
            <Btn variant="danger" icon={<Icons.Trash />} onClick={cancelDeal}>
              Cancel rental
            </Btn>
          )}
          <Btn variant="primary" icon={<Icons.Doc />} onClick={createInvoice} disabled={creatingInvoice || deal.status === "cancelled"}>
            {creatingInvoice ? "Creating…" : "Create Invoice"}
          </Btn>
        </div>
      </div>

      <div className="grid gap-8" style={{ gridTemplateColumns: "minmax(0, 1fr) 520px" }}>
        <div className="space-y-6">
          <Card>
            <div className="p-8">
              <div className="text-[11px] uppercase tracking-[0.14em]" style={{ color: tone.ink50 }}>
                Total Commission
              </div>
              <div className="font-serif" style={{ fontSize: 76, lineHeight: 0.9, color: tone.ink, marginTop: 8 }}>
                <span style={{ fontSize: 32, color: tone.ink50, marginRight: 6 }}>$</span>
                {fmtMoney(Number(deal.totalCommission || 0))}
              </div>
              <div className="mt-4 text-[12.5px]" style={{ color: tone.ink70 }}>
                Rental date <span className="font-mono">{fmtDate(deal.dealDate || deal.createdAt)}</span>
              </div>
            </div>
          </Card>

          <div className="grid grid-cols-2 gap-4">
            <Card>
              <div className="p-6 space-y-4">
                <div className="text-[11px] uppercase tracking-[0.12em]" style={{ color: tone.ink50 }}>
                  Building / Tenant
                </div>
                <SoftField label="Building" value={building.name} />
                <SoftField label="Unit" value={deal.unit} mono />
                <SoftField label="Tenant" value={deal.tenantName} />
                <SoftField label="Address" value={deal.apartmentAddress || building.billToAddress || "—"} />
              </div>
            </Card>
            <Card>
              <div className="p-6 space-y-4">
                <div className="text-[11px] uppercase tracking-[0.12em]" style={{ color: tone.ink50 }}>
                  Lease Details
                </div>
                <SoftField label="Move-in" value={deal.moveInDate ? fmtLongDate(deal.moveInDate) : "—"} />
                <SoftField label="Term" value={deal.leaseLengthMonths ? `${deal.leaseLengthMonths} months` : "—"} mono />
                <SoftField label="Monthly rent" value={deal.rentAmount ? `$${fmtMoney(Number(deal.rentAmount))}` : "—"} mono />
                <SoftField label="Tenant contact" value={[deal.tenantEmail, deal.tenantPhone].filter(Boolean).join(" · ") || "—"} />
                <SoftField
                  label="Source"
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
            <div className="px-6 py-5" style={{ borderBottom: `1px solid ${tone.lineSoft}` }}>
              <div className="font-serif" style={{ fontSize: 20, color: tone.ink }}>
                Agents
              </div>
            </div>
            <div className="p-6 grid gap-4 md:grid-cols-2">
              {payload.agents.map((participant) => (
                <div
                  key={participant.agent.id}
                  className="rounded-xl p-4"
                  style={{ background: tone.paper, border: `1px solid ${tone.lineSoft}` }}
                >
                  <Pill tone={participant.isPrimary ? "accent" : "neutral"}>
                    {participant.isPrimary ? "Primary" : "Agent"} {Number(participant.sharePct || 0)}%
                  </Pill>
                  <div className="mt-3 font-serif" style={{ fontSize: 22, color: tone.ink }}>
                    {participant.agent.name}
                  </div>
                  <div className="mt-1 text-[12px]" style={{ color: tone.ink50 }}>
                    {splitLabel(participant.agent.splitPct)} split · Agent keeps {normalizeSplitPct(participant.agent.splitPct)}% · Homix keeps {companySplitPct(participant.agent.splitPct)}%
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
                  Notes
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
              <div className="px-6 py-5" style={{ borderBottom: `1px solid ${tone.lineSoft}` }}>
                <div className="flex items-center justify-between gap-3">
                  <div className="font-serif" style={{ fontSize: 22, color: tone.ink }}>
                    Payment Status
                  </div>
                  <Pill tone={invoicePaymentTone(invoiceSummary.status)}>
                    {invoiceSummary.label}
                  </Pill>
                </div>
              </div>
              <div className="p-6">
                <p className="text-[13.5px] leading-relaxed" style={{ color: tone.ink70 }}>
                  {paymentDetail(invoiceSummary)}
                </p>
                <div className="mt-5 grid grid-cols-2 gap-3">
                  <SoftField
                    label="Outstanding"
                    value={`$${fmtMoney(invoiceSummary.totalOutstanding)}`}
                    mono
                  />
                  <SoftField
                    label="Received"
                    value={`$${fmtMoney(invoiceSummary.totalPaid)}`}
                    mono
                  />
                  <SoftField
                    label="Sent"
                    value={invoiceSummary.sentAt ? fmtDate(invoiceSummary.sentAt) : "—"}
                    mono
                  />
                  <SoftField
                    label="Paid"
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
                    View {invoiceSummary.latestInvoiceNumber}
                  </Link>
                )}
              </div>
            </Card>

            <Card>
              <div className="px-6 py-5" style={{ borderBottom: `1px solid ${tone.lineSoft}` }}>
                <div className="font-serif" style={{ fontSize: 22, color: tone.ink }}>
                  Commission Breakdown
                </div>
              </div>
              <div className="p-6">
                <DealBreakdownBar breakdown={breakdown} />
                <div className="mt-6 space-y-3 text-[13px]">
                  <div className="flex justify-between" style={{ color: tone.ink }}>
                    <span>Total Commission</span>
                    <span className="font-mono">${fmtMoney(breakdown.totalCommission)}</span>
                  </div>
                  {referrerDisplayName && (
                    <div className="flex justify-between" style={{ color: tone.amber }}>
                      <span>Referrer ({referrerDisplayName}, {referrerLabel})</span>
                      <span className="font-mono">-${fmtMoney(breakdown.referrerCut)}</span>
                    </div>
                  )}
                  <div style={{ borderTop: `1px solid ${tone.lineSoft}` }} />
                  {breakdown.agents.map((agentBreakdown) => (
                    <div key={agentBreakdown.agentId} className="space-y-1">
                      <div className="flex justify-between" style={{ color: tone.ink }}>
                        <span>
                          {agentBreakdown.isPrimary ? "Primary" : "Agent"} — {agentBreakdown.name || "Unknown"}
                        </span>
                        <span className="font-mono">${fmtMoney(agentBreakdown.agentTake)} take</span>
                      </div>
                      <div className="flex justify-between text-[12px]" style={{ color: tone.ink50 }}>
                        <span>Company pool</span>
                        <span className="font-mono">${fmtMoney(agentBreakdown.companyPool)}</span>
                      </div>
                    </div>
                  ))}
                  <div style={{ borderTop: `1px solid ${tone.lineSoft}` }} />
                  <div className="flex justify-between font-medium" style={{ color: tone.green }}>
                    <span>Agent take total</span>
                    <span className="font-mono">${fmtMoney(breakdown.agentTakeTotal)}</span>
                  </div>
                  <div className="flex justify-between font-medium" style={{ color: tone.ink }}>
                    <span>Company pool</span>
                    <span className="font-mono">${fmtMoney(breakdown.companyPoolTotal)}</span>
                  </div>
                  <div className="flex justify-between font-medium" style={{ color: tone.amber }}>
                    <span>Referrer total</span>
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
                      Pay referrer via
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
              <div className="px-6 py-5 flex items-center justify-between" style={{ borderBottom: `1px solid ${tone.lineSoft}` }}>
                <div className="font-serif" style={{ fontSize: 22, color: tone.ink }}>
                  Linked Invoices
                </div>
                {linkedInvoices.length === 0 && (
                  <Btn variant="primary" size="sm" icon={<Icons.Doc />} onClick={createInvoice} disabled={creatingInvoice || deal.status === "cancelled"}>
                    Create
                  </Btn>
                )}
              </div>
              <div>
                {linkedInvoices.length === 0 ? (
                  <div className="px-6 py-10 text-center">
                    <div className="font-serif mb-2" style={{ fontSize: 22, color: tone.ink }}>
                      No invoices linked
                    </div>
                    <p className="text-[13px]" style={{ color: tone.ink50 }}>
                      Create a draft invoice from this rental.
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
                              ? `Paid ${fmtDate(invoice.paidAt)}`
                              : invoice.status === "sent" && invoice.sentAt
                              ? `Sent ${fmtDate(invoice.sentAt)}`
                              : `Created ${fmtDate(invoice.createdAt)}`}
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
