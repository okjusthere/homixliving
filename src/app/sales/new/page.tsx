"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { toast } from "sonner";
import { Btn, Card, EditorialInput, Icons, LabeledField, Pill } from "@/components/homix/primitives";
import { PageHeader, CardHeader } from "@/components/homix/page-kit";
import { DealBreakdownBar } from "@/components/homix/deal-breakdown";
import { fmtMoney, tone } from "@/components/homix/tokens";
import { computeCommission } from "@/lib/commission";
import {
  SALE_REPRESENTATION_OPTIONS,
  SALE_STAGE_OPTIONS,
  type SaleRepresentation,
  type SaleStage,
} from "@/lib/sales";
import type { Agent } from "@/db/schema";

type SaleParticipantInput = {
  agentId: number | null;
  sharePct: number;
  isPrimary: boolean;
};

function initials(name: string) {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join("");
}

function SelectShell({
  value,
  onChange,
  children,
}: {
  value: string | number;
  onChange: (value: string) => void;
  children: React.ReactNode;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full h-10 rounded-lg px-3 text-[13.5px] outline-none"
      style={{ background: tone.card, border: `1px solid ${tone.line}`, color: tone.ink }}
    >
      {children}
    </select>
  );
}

export default function NewSalePage() {
  const router = useRouter();
  const { data: session } = useSession();
  const [agents, setAgents] = useState<Array<{ agent: Agent; teamName: string | null }>>([]);
  const [saving, setSaving] = useState(false);

  const [representationType, setRepresentationType] = useState<SaleRepresentation>("buyer_rep");
  const [stage, setStage] = useState<SaleStage>("pre_contract");
  const [propertyAddress, setPropertyAddress] = useState("");
  const [city, setCity] = useState("");
  const [state, setState] = useState("NY");
  const [zip, setZip] = useState("");
  const [propertyType, setPropertyType] = useState("");
  const [mlsNumber, setMlsNumber] = useState("");
  const [fileId, setFileId] = useState("");
  const [buyerNames, setBuyerNames] = useState("");
  const [sellerNames, setSellerNames] = useState("");
  const [contractDate, setContractDate] = useState("");
  const [closingDate, setClosingDate] = useState("");
  const [purchasePrice, setPurchasePrice] = useState("");
  const [grossCommission, setGrossCommission] = useState("");
  const [referralAmount, setReferralAmount] = useState("");
  const [brokerageFee, setBrokerageFee] = useState("");
  const [listingAgentName, setListingAgentName] = useState("");
  const [listingAgentEmail, setListingAgentEmail] = useState("");
  const [listingBrokerage, setListingBrokerage] = useState("");
  const [cooperatingAgentName, setCooperatingAgentName] = useState("");
  const [cooperatingAgentEmail, setCooperatingAgentEmail] = useState("");
  const [cooperatingBrokerage, setCooperatingBrokerage] = useState("");
  const [buyerAttorney, setBuyerAttorney] = useState("");
  const [sellerAttorney, setSellerAttorney] = useState("");
  const [titleCompany, setTitleCompany] = useState("");
  const [lenderName, setLenderName] = useState("");
  const [escrowHolder, setEscrowHolder] = useState("");
  const [notes, setNotes] = useState("");
  const [saleParticipants, setSaleParticipants] = useState<SaleParticipantInput[]>([
    { agentId: null, sharePct: 100, isPrimary: true },
  ]);

  useEffect(() => {
    fetch("/api/agents")
      .then((r) => r.json())
      .then((rows) => setAgents(rows));
  }, []);

  useEffect(() => {
    if (saleParticipants[0]?.agentId || agents.length === 0) return;
    const currentAgentId = session?.user?.agentId;
    const defaultAgent =
      agents.find((row) => row.agent.id === currentAgentId)?.agent ||
      agents[0]?.agent;
    if (defaultAgent) {
      setSaleParticipants([{ agentId: defaultAgent.id, sharePct: 100, isPrimary: true }]);
    }
  }, [agents, saleParticipants, session?.user?.agentId]);

  const selectedParticipants = useMemo(
    () =>
      saleParticipants.map((participant) => ({
        ...participant,
        agent: agents.find((row) => row.agent.id === participant.agentId)?.agent || null,
      })),
    [agents, saleParticipants]
  );

  const shareTotal = selectedParticipants.reduce((sum, participant) => sum + Number(participant.sharePct || 0), 0);
  const referral = Number(referralAmount || 0);
  const brokerage = Number(brokerageFee || 0);
  const commissionBase = Math.max(0, Number(grossCommission || 0) - referral - brokerage);
  const breakdown = useMemo(
    () =>
      computeCommission({
        totalCommission: commissionBase,
        agents: selectedParticipants
          .filter((participant) => participant.agent)
          .map((participant) => ({
            agentId: participant.agent!.id,
            name: participant.agent!.name,
            sharePct: Number(participant.sharePct || 0),
            splitPct: Number(participant.agent!.splitPct || 0),
            isPrimary: participant.isPrimary,
          })),
      }),
    [commissionBase, selectedParticipants]
  );

  const updateParticipant = (
    index: number,
    patch: Partial<SaleParticipantInput>
  ) => {
    setSaleParticipants((prev) =>
      prev.map((participant, i) =>
        i === index ? { ...participant, ...patch } : participant
      )
    );
  };

  const setPrimaryParticipant = (index: number) => {
    setSaleParticipants((prev) =>
      prev.map((participant, i) => ({ ...participant, isPrimary: i === index }))
    );
  };

  const addParticipant = () => {
    setSaleParticipants((prev) => [...prev, { agentId: null, sharePct: 0, isPrimary: false }]);
  };

  const removeParticipant = (index: number) => {
    setSaleParticipants((prev) => {
      const next = prev.filter((_, i) => i !== index);
      if (!next.some((participant) => participant.isPrimary) && next[0]) {
        next[0] = { ...next[0], isPrimary: true };
      }
      return next.length > 0 ? next : [{ agentId: null, sharePct: 100, isPrimary: true }];
    });
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!propertyAddress.trim()) return toast.error("Property address is required");
    if (selectedParticipants.some((participant) => !participant.agentId)) {
      return toast.error("Every sale agent must be selected");
    }
    if (new Set(selectedParticipants.map((participant) => participant.agentId)).size !== selectedParticipants.length) {
      return toast.error("Sale agents must be unique");
    }
    if (selectedParticipants.filter((participant) => participant.isPrimary).length !== 1) {
      return toast.error("Exactly one primary agent is required");
    }
    if (Math.abs(shareTotal - 100) > 0.01) {
      return toast.error("Agent shares must total 100%");
    }

    setSaving(true);
    try {
      const res = await fetch("/api/sales", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          representationType,
          stage,
          propertyAddress,
          city,
          state,
          zip,
          propertyType,
          mlsNumber,
          fileId,
          buyerNames,
          sellerNames,
          contractDate,
          closingDate,
          purchasePrice: purchasePrice ? Number(purchasePrice) : null,
          grossCommission: Number(grossCommission || 0),
          referralAmount: referralAmount ? Number(referralAmount) : null,
          brokerageFee: brokerageFee ? Number(brokerageFee) : null,
          listingAgentName,
          listingAgentEmail,
          listingBrokerage,
          cooperatingAgentName,
          cooperatingAgentEmail,
          cooperatingBrokerage,
          buyerAttorney,
          sellerAttorney,
          titleCompany,
          lenderName,
          escrowHolder,
          notes,
          agents: selectedParticipants.map((participant) => ({
            agentId: participant.agentId,
            sharePct: Number(participant.sharePct || 0),
            isPrimary: participant.isPrimary,
          })),
        }),
      });
      if (!res.ok) throw new Error(await res.text());
      const saleDeal = await res.json();
      toast.success("Sale created");
      router.push(`/sales/${saleDeal.id}`);
    } catch {
      toast.error("Save failed");
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-7">
      <div className="space-y-4">
        <Link href="/sales" className="flex w-fit items-center gap-1.5 text-[12.5px]" style={{ color: tone.ink50 }}>
          <Icons.Back /> Back
        </Link>
        <PageHeader
          eyebrow="Create"
          title="New sale"
          actions={
            <>
              <Btn variant="outline" onClick={() => router.back()}>
                Cancel
              </Btn>
              <Btn variant="primary" icon={<Icons.Check />} type="submit" disabled={saving}>
                {saving ? "Saving…" : "Save Sale"}
              </Btn>
            </>
          }
        />
      </div>

      <div className="grid gap-8" style={{ gridTemplateColumns: "minmax(0, 1fr) 520px" }}>
        <div className="space-y-6">
          <Card>
            <CardHeader title="Transaction" />
            <div className="p-6 grid grid-cols-2 gap-4">
              <LabeledField label="Representation">
                <SelectShell value={representationType} onChange={(value) => setRepresentationType(value as SaleRepresentation)}>
                  {SALE_REPRESENTATION_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </SelectShell>
              </LabeledField>
              <LabeledField label="Stage">
                <SelectShell value={stage} onChange={(value) => setStage(value as SaleStage)}>
                  {SALE_STAGE_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </SelectShell>
              </LabeledField>
              <LabeledField label="Contract date">
                <EditorialInput value={contractDate} onChange={setContractDate} type="date" mono />
              </LabeledField>
              <LabeledField label="Closing date">
                <EditorialInput value={closingDate} onChange={setClosingDate} type="date" mono />
              </LabeledField>
            </div>
          </Card>

          <Card>
            <CardHeader title="Property" />
            <div className="p-6 grid grid-cols-2 gap-4">
              <LabeledField label="Address *" wide>
                <EditorialInput value={propertyAddress} onChange={setPropertyAddress} placeholder="Street address, unit" />
              </LabeledField>
              <LabeledField label="City">
                <EditorialInput value={city} onChange={setCity} />
              </LabeledField>
              <LabeledField label="State">
                <EditorialInput value={state} onChange={setState} mono />
              </LabeledField>
              <LabeledField label="ZIP">
                <EditorialInput value={zip} onChange={setZip} mono />
              </LabeledField>
              <LabeledField label="Property type">
                <EditorialInput value={propertyType} onChange={setPropertyType} placeholder="Condo, co-op, house..." />
              </LabeledField>
              <LabeledField label="MLS #">
                <EditorialInput value={mlsNumber} onChange={setMlsNumber} mono />
              </LabeledField>
              <LabeledField label="File ID">
                <EditorialInput value={fileId} onChange={setFileId} mono />
              </LabeledField>
            </div>
          </Card>

          <Card>
            <CardHeader title="Parties" />
            <div className="p-6 grid grid-cols-2 gap-4">
              <LabeledField label="Buyer name(s)" wide>
                <EditorialInput value={buyerNames} onChange={setBuyerNames} placeholder="Use commas for multiple buyers" />
              </LabeledField>
              <LabeledField label="Seller name(s)" wide>
                <EditorialInput value={sellerNames} onChange={setSellerNames} placeholder="Use commas for multiple sellers" />
              </LabeledField>
            </div>
          </Card>

          <Card>
            <CardHeader title="Agents" />
            <div className="p-6 space-y-4">
              {saleParticipants.map((participant, index) => (
                <div
                  key={index}
                  className="rounded-xl p-4 space-y-4"
                  style={{ background: tone.paper, border: `1px solid ${tone.lineSoft}` }}
                >
                  <div className="grid grid-cols-[1fr_120px_auto] gap-3 items-end">
                    <LabeledField label={participant.isPrimary ? "Primary agent *" : "Agent"}>
                      <SelectShell
                        value={participant.agentId || ""}
                        onChange={(value) =>
                          updateParticipant(index, {
                            agentId: Number(value) || null,
                          })
                        }
                      >
                        <option value="">Select agent</option>
                        {agents.map(({ agent, teamName }) => (
                          <option key={agent.id} value={agent.id}>
                            {agent.name} {teamName ? `· ${teamName}` : ""}
                          </option>
                        ))}
                      </SelectShell>
                    </LabeledField>
                    <LabeledField label="Share %">
                      <EditorialInput
                        value={participant.sharePct}
                        onChange={(value) => updateParticipant(index, { sharePct: Number(value) })}
                        type="number"
                        mono
                      />
                    </LabeledField>
                    <div className="flex items-center gap-2 pb-1">
                      <button
                        type="button"
                        onClick={() => setPrimaryParticipant(index)}
                        className="h-9 px-3 rounded-md text-[12px]"
                        style={{
                          background: participant.isPrimary ? tone.accentSoft : tone.card,
                          border: `1px solid ${participant.isPrimary ? tone.accent : tone.line}`,
                          color: participant.isPrimary ? tone.accent : tone.ink70,
                        }}
                      >
                        Primary
                      </button>
                      {saleParticipants.length > 1 && (
                        <button
                          type="button"
                          onClick={() => removeParticipant(index)}
                          className="h-9 px-3 rounded-md text-[12px]"
                          style={{ background: tone.card, border: `1px solid ${tone.line}`, color: tone.rose }}
                        >
                          Remove
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
              <div className="flex items-center justify-between">
                <Btn variant="outline" size="sm" icon={<Icons.Plus />} onClick={addParticipant}>
                  Add agent
                </Btn>
                <div
                  className="text-[12px] font-mono"
                  style={{ color: Math.abs(shareTotal - 100) > 0.01 ? tone.rose : tone.ink50 }}
                >
                  Total share {shareTotal}%
                </div>
              </div>
            </div>
          </Card>

          <Card>
            <CardHeader title="Commission" />
            <div className="p-6 grid grid-cols-2 gap-4">
              <LabeledField label="Purchase price">
                <EditorialInput value={purchasePrice} onChange={setPurchasePrice} type="number" prefix="$" mono />
              </LabeledField>
              <LabeledField label="Gross commission">
                <EditorialInput value={grossCommission} onChange={setGrossCommission} type="number" prefix="$" mono />
              </LabeledField>
              <LabeledField label="Referral amount">
                <EditorialInput value={referralAmount} onChange={setReferralAmount} type="number" prefix="$" mono />
              </LabeledField>
              <LabeledField label="Brokerage/admin fee">
                <EditorialInput value={brokerageFee} onChange={setBrokerageFee} type="number" prefix="$" mono />
              </LabeledField>
            </div>
          </Card>

          <Card>
            <CardHeader title="Outside Contacts" />
            <div className="p-6 grid grid-cols-2 gap-4">
              <LabeledField label="Listing agent">
                <EditorialInput value={listingAgentName} onChange={setListingAgentName} />
              </LabeledField>
              <LabeledField label="Listing agent email">
                <EditorialInput value={listingAgentEmail} onChange={setListingAgentEmail} mono />
              </LabeledField>
              <LabeledField label="Listing brokerage" wide>
                <EditorialInput value={listingBrokerage} onChange={setListingBrokerage} />
              </LabeledField>
              <LabeledField label="Cooperating agent">
                <EditorialInput value={cooperatingAgentName} onChange={setCooperatingAgentName} />
              </LabeledField>
              <LabeledField label="Cooperating agent email">
                <EditorialInput value={cooperatingAgentEmail} onChange={setCooperatingAgentEmail} mono />
              </LabeledField>
              <LabeledField label="Cooperating brokerage" wide>
                <EditorialInput value={cooperatingBrokerage} onChange={setCooperatingBrokerage} />
              </LabeledField>
            </div>
          </Card>

          <Card>
            <CardHeader title="Closing Contacts" />
            <div className="p-6 grid grid-cols-2 gap-4">
              <LabeledField label="Buyer attorney">
                <EditorialInput value={buyerAttorney} onChange={setBuyerAttorney} />
              </LabeledField>
              <LabeledField label="Seller attorney">
                <EditorialInput value={sellerAttorney} onChange={setSellerAttorney} />
              </LabeledField>
              <LabeledField label="Title company">
                <EditorialInput value={titleCompany} onChange={setTitleCompany} />
              </LabeledField>
              <LabeledField label="Lender">
                <EditorialInput value={lenderName} onChange={setLenderName} />
              </LabeledField>
              <LabeledField label="Escrow holder" wide>
                <EditorialInput value={escrowHolder} onChange={setEscrowHolder} />
              </LabeledField>
            </div>
          </Card>

          <Card>
            <CardHeader title="Notes" />
            <div className="p-6">
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={4}
                className="w-full rounded-lg p-3 text-[13.5px] outline-none"
                style={{ background: tone.card, border: `1px solid ${tone.line}`, color: tone.ink, resize: "vertical" }}
              />
            </div>
          </Card>
        </div>

        <div>
          <div className="sticky top-24 space-y-4">
            <div className="text-[11px] font-medium uppercase tracking-[0.16em]" style={{ color: tone.ink50 }}>
              Sale Summary
            </div>
            <Card>
              <div className="p-6">
                <div className="font-serif" style={{ fontSize: 30, color: tone.ink, lineHeight: 1 }}>
                  {propertyAddress || "Property address"}
                </div>
                <div className="mt-2 text-[13px]" style={{ color: tone.ink70 }}>
                  {[city, state, zip].filter(Boolean).join(", ") || "Location pending"}
                </div>
                <div className="mt-5 flex flex-wrap gap-2">
                  <Pill tone="accent">{SALE_REPRESENTATION_OPTIONS.find((option) => option.value === representationType)?.label}</Pill>
                  <Pill tone="neutral">{SALE_STAGE_OPTIONS.find((option) => option.value === stage)?.label}</Pill>
                  {closingDate && <Pill tone="draft">Closing set</Pill>}
                </div>

                <div className="mt-8 rounded-lg p-4" style={{ background: tone.paper }}>
                  <div className="text-[11px] uppercase tracking-[0.12em]" style={{ color: tone.ink50 }}>
                    Gross Commission
                  </div>
                  <div className="mt-2 font-serif" style={{ fontSize: 44, color: tone.ink, lineHeight: 1 }}>
                    ${fmtMoney(Number(grossCommission || 0))}
                  </div>
                  <div className="mt-2 text-[12px] font-mono" style={{ color: tone.ink50 }}>
                    Net split base ${fmtMoney(commissionBase)}
                  </div>
                </div>

                <div className="mt-6 flex flex-col gap-3">
                  {selectedParticipants.filter((participant) => participant.agent).map((participant) => (
                    <div key={participant.agent!.id} className="flex items-center gap-2">
                      <div className="w-9 h-9 rounded-full flex items-center justify-center font-serif" style={{ background: tone.accentSoft, color: tone.accent }}>
                        {initials(participant.agent!.name)}
                      </div>
                      <div>
                        <div className="text-[12.5px]" style={{ color: tone.ink }}>
                          {participant.agent!.name}
                        </div>
                        <div className="text-[11px]" style={{ color: tone.ink50 }}>
                          {participant.sharePct}% share · {Number(participant.agent!.splitPct || 0)}% split
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="mt-8">
                  <DealBreakdownBar breakdown={breakdown} />
                </div>
              </div>
            </Card>
          </div>
        </div>
      </div>
    </form>
  );
}
