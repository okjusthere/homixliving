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
import type { Agent, SaleDeal } from "@/db/schema";

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
    if (!confirm("Cancel this sale?")) return;
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
      toast.success("Sale cancelled");
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

  if (!payload?.saleDeal) {
    return (
      <div className="py-24 text-center">
        <div className="font-serif text-2xl" style={{ color: tone.ink }}>
          Sale not found
        </div>
        <Link href="/sales" className="mt-4 inline-block text-[13px] underline" style={{ color: tone.accent }}>
          Back to sales
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
            <Icons.Back /> Back to sales
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
              <Btn variant="outline" icon={<Icons.Edit />} onClick={() => toast.message("Edit is coming in the next pass")}>
                Edit
              </Btn>
              {saleDeal.status !== "cancelled" && (
                <Btn variant="danger" icon={<Icons.Trash />} onClick={cancelSale}>
                  Cancel sale
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
                Gross Commission
              </div>
              <div className="font-serif" style={{ fontSize: 76, lineHeight: 0.9, color: tone.ink, marginTop: 8 }}>
                <span style={{ fontSize: 32, color: tone.ink50, marginRight: 6 }}>$</span>
                {fmtMoney(Number(saleDeal.grossCommission || 0))}
              </div>
              <div className="mt-4 text-[12.5px]" style={{ color: tone.ink70 }}>
                Net split base <span className="font-mono">${fmtMoney(commissionBase)}</span>
              </div>
            </div>
          </Card>

          <div className="grid grid-cols-2 gap-4">
            <Card>
              <div className="p-6 space-y-4">
                <div className="text-[11px] uppercase tracking-[0.12em]" style={{ color: tone.ink50 }}>
                  Property
                </div>
                <SoftField label="Address" value={saleDeal.propertyAddress} />
                <SoftField label="Location" value={location || "—"} />
                <SoftField label="Property type" value={saleDeal.propertyType || "—"} />
                <SoftField label="MLS / File" value={[saleDeal.mlsNumber, saleDeal.fileId].filter(Boolean).join(" · ") || "—"} mono />
              </div>
            </Card>
            <Card>
              <div className="p-6 space-y-4">
                <div className="text-[11px] uppercase tracking-[0.12em]" style={{ color: tone.ink50 }}>
                  Dates
                </div>
                <SoftField label="Contract date" value={saleDeal.contractDate ? fmtLongDate(saleDeal.contractDate) : "—"} />
                <SoftField label="Closing date" value={saleDeal.closingDate ? fmtLongDate(saleDeal.closingDate) : "—"} />
                <SoftField label="Purchase price" value={saleDeal.purchasePrice ? `$${fmtMoney(Number(saleDeal.purchasePrice))}` : "—"} mono />
                <SoftField label="Created" value={fmtDate(saleDeal.createdAt)} mono />
              </div>
            </Card>
          </div>

          <Card>
            <CardHeader title="Parties" />
            <div className="p-6 grid grid-cols-2 gap-4">
              <SoftField label="Buyer(s)" value={saleDeal.buyerNames || "—"} />
              <SoftField label="Seller(s)" value={saleDeal.sellerNames || "—"} />
            </div>
          </Card>

          <Card>
            <CardHeader title="Homix Agents" />
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
                    {Number(participant.agent.splitPct || 0)}% agent split · {participant.agent.licensedCompany || "Homix"}
                  </div>
                </div>
              ))}
            </div>
          </Card>

          <Card>
            <CardHeader title="Outside Contacts" />
            <div className="p-6 grid grid-cols-2 gap-4">
              <SoftField label="Listing agent" value={saleDeal.listingAgentName || "—"} />
              <SoftField label="Listing email" value={saleDeal.listingAgentEmail || "—"} mono />
              <SoftField label="Listing brokerage" value={saleDeal.listingBrokerage || "—"} />
              <SoftField label="Cooperating agent" value={saleDeal.cooperatingAgentName || "—"} />
              <SoftField label="Cooperating email" value={saleDeal.cooperatingAgentEmail || "—"} mono />
              <SoftField label="Cooperating brokerage" value={saleDeal.cooperatingBrokerage || "—"} />
            </div>
          </Card>

          <Card>
            <CardHeader title="Closing Contacts" />
            <div className="p-6 grid grid-cols-2 gap-4">
              <SoftField label="Buyer attorney" value={saleDeal.buyerAttorney || "—"} />
              <SoftField label="Seller attorney" value={saleDeal.sellerAttorney || "—"} />
              <SoftField label="Title company" value={saleDeal.titleCompany || "—"} />
              <SoftField label="Lender" value={saleDeal.lenderName || "—"} />
              <SoftField label="Escrow holder" value={saleDeal.escrowHolder || "—"} />
            </div>
          </Card>

          {saleDeal.notes && (
            <Card>
              <div className="p-6">
                <div className="text-[11px] uppercase tracking-[0.12em] mb-3" style={{ color: tone.ink50 }}>
                  Notes
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
              <CardHeader title="Commission Breakdown" />
              <div className="p-6">
                <DealBreakdownBar breakdown={breakdown} />
                <div className="mt-6 space-y-3 text-[13px]">
                  <div className="flex justify-between" style={{ color: tone.ink }}>
                    <span>Gross commission</span>
                    <span className="font-mono">${fmtMoney(Number(saleDeal.grossCommission || 0))}</span>
                  </div>
                  {saleDeal.referralAmount ? (
                    <div className="flex justify-between" style={{ color: tone.amber }}>
                      <span>Referral</span>
                      <span className="font-mono">-${fmtMoney(Number(saleDeal.referralAmount))}</span>
                    </div>
                  ) : null}
                  {saleDeal.brokerageFee ? (
                    <div className="flex justify-between" style={{ color: tone.amber }}>
                      <span>Brokerage/admin fee</span>
                      <span className="font-mono">-${fmtMoney(Number(saleDeal.brokerageFee))}</span>
                    </div>
                  ) : null}
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
                </div>
              </div>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
