"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Btn, Card, EditorialInput, Icons, LabeledField, Pill } from "@/components/homix/primitives";
import { DealBreakdownBar } from "@/components/homix/deal-breakdown";
import { fmtMoney, tone } from "@/components/homix/tokens";
import { computeCommission } from "@/lib/commission";
import type { Agent, Building, Referrer } from "@/db/schema";

type ReferrerRow = { referrer: Referrer };

function initials(name: string) {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join("");
}

export default function NewDealPage() {
  const router = useRouter();
  const [buildings, setBuildings] = useState<Building[]>([]);
  const [agents, setAgents] = useState<Array<{ agent: Agent; teamName: string | null }>>([]);
  const [referrers, setReferrers] = useState<Referrer[]>([]);
  const [saving, setSaving] = useState(false);
  const [buildingSearch, setBuildingSearch] = useState("");

  const [buildingId, setBuildingId] = useState<number | null>(null);
  const [unit, setUnit] = useState("");
  const [tenantName, setTenantName] = useState("");
  const [tenantEmail, setTenantEmail] = useState("");
  const [tenantPhone, setTenantPhone] = useState("");
  const [apartmentAddress, setApartmentAddress] = useState("");
  const [moveInDate, setMoveInDate] = useState("");
  const [leaseLengthMonths, setLeaseLengthMonths] = useState(12);
  const [rentAmount, setRentAmount] = useState("");
  const [primaryAgentId, setPrimaryAgentId] = useState<number | null>(null);
  const [hasCoAgent, setHasCoAgent] = useState(false);
  const [coAgentId, setCoAgentId] = useState<number | null>(null);
  const [primaryAgentSharePct, setPrimaryAgentSharePct] = useState(50);
  const [hasReferrer, setHasReferrer] = useState(false);
  const [referrerId, setReferrerId] = useState<number | null>(null);
  const [referrerType, setReferrerType] = useState<"percent" | "flat">("percent");
  const [referrerAmount, setReferrerAmount] = useState("");
  const [totalCommission, setTotalCommission] = useState("");
  const [notes, setNotes] = useState("");

  useEffect(() => {
    Promise.all([
      fetch("/api/buildings").then((r) => r.json()),
      fetch("/api/agents").then((r) => r.json()),
      fetch("/api/referrers").then((r) => r.json()),
    ]).then(([buildingRows, agentRows, referrerRows]) => {
      setBuildings(buildingRows);
      setAgents(agentRows);
      setReferrers(referrerRows.map((row: ReferrerRow) => row.referrer));
      const initialBuildingId = new URLSearchParams(window.location.search).get("buildingId");
      if (initialBuildingId) setBuildingId(Number(initialBuildingId));
      if (agentRows[0]?.agent?.id) setPrimaryAgentId(agentRows[0].agent.id);
    });
  }, []);

  const selectedBuilding = useMemo(
    () => buildings.find((building) => building.id === buildingId) || null,
    [buildings, buildingId]
  );
  const primaryAgent = useMemo(
    () => agents.find((row) => row.agent.id === primaryAgentId)?.agent || null,
    [agents, primaryAgentId]
  );
  const coAgent = useMemo(
    () => agents.find((row) => row.agent.id === coAgentId)?.agent || null,
    [agents, coAgentId]
  );

  useEffect(() => {
    if (selectedBuilding && !apartmentAddress) {
      setApartmentAddress(selectedBuilding.billToAddress || "");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedBuilding?.id]);

  useEffect(() => {
    if (!hasCoAgent) {
      setPrimaryAgentSharePct(100);
      setCoAgentId(null);
    } else if (primaryAgentSharePct === 100) {
      setPrimaryAgentSharePct(50);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasCoAgent]);

  const selectedReferrer = useMemo(
    () => referrers.find((referrer) => referrer.id === referrerId) || null,
    [referrers, referrerId]
  );

  useEffect(() => {
    if (selectedReferrer?.defaultReferralType === "percent" || selectedReferrer?.defaultReferralType === "flat") {
      setReferrerType(selectedReferrer.defaultReferralType);
      setReferrerAmount(String(selectedReferrer.defaultReferralAmount || ""));
    }
  }, [selectedReferrer]);

  const breakdown = useMemo(
    () =>
      computeCommission({
        totalCommission: Number(totalCommission || 0),
        referrer: hasReferrer
          ? { type: referrerType, amount: Number(referrerAmount || 0) }
          : null,
        primaryAgentSharePct: hasCoAgent ? primaryAgentSharePct : 100,
        primaryAgentSplitPct: Number(primaryAgent?.splitPct || 0),
        coAgent: hasCoAgent
          ? { sharePct: 100 - primaryAgentSharePct, splitPct: Number(coAgent?.splitPct || 0) }
          : null,
      }),
    [coAgent, hasCoAgent, hasReferrer, primaryAgent, primaryAgentSharePct, referrerAmount, referrerType, totalCommission]
  );

  const filteredBuildings = useMemo(() => {
    if (!buildingSearch) return buildings;
    const q = buildingSearch.toLowerCase();
    return buildings.filter(
      (building) =>
        building.name.toLowerCase().includes(q) ||
        building.region.toLowerCase().includes(q) ||
        (building.managementCompany || "").toLowerCase().includes(q)
    );
  }, [buildingSearch, buildings]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!buildingId) return toast.error("Please select a building");
    if (!unit.trim()) return toast.error("Unit is required");
    if (!tenantName.trim()) return toast.error("Tenant name is required");
    if (!primaryAgentId) return toast.error("Primary agent is required");
    if (!totalCommission || Number(totalCommission) <= 0) return toast.error("Commission is required");
    if (hasCoAgent && !coAgentId) return toast.error("Co-agent is required");

    setSaving(true);
    try {
      const res = await fetch("/api/deals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          buildingId,
          unit,
          tenantName,
          tenantEmail,
          tenantPhone,
          apartmentAddress,
          moveInDate,
          leaseStartDate: moveInDate,
          leaseLengthMonths,
          rentAmount: rentAmount ? Number(rentAmount) : null,
          totalCommission: Number(totalCommission),
          licensedCompany: primaryAgent?.licensedCompany,
          primaryAgentId,
          primaryAgentSharePct: hasCoAgent ? primaryAgentSharePct : 100,
          coAgentId: hasCoAgent ? coAgentId : null,
          coAgentSharePct: hasCoAgent ? 100 - primaryAgentSharePct : null,
          referrerId: hasReferrer ? referrerId : null,
          referrerType: hasReferrer ? referrerType : null,
          referrerAmount: hasReferrer ? Number(referrerAmount || 0) : null,
          notes,
        }),
      });
      if (!res.ok) throw new Error(await res.text());
      const deal = await res.json();
      toast.success("Deal created");
      router.push(`/deals/${deal.id}`);
    } catch {
      toast.error("Save failed");
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={submit}>
      <div className="flex items-start justify-between mb-8">
        <div>
          <Link href="/deals" className="flex items-center gap-1.5 text-[12.5px] mb-4" style={{ color: tone.ink50 }}>
            <Icons.Back /> Back
          </Link>
          <div className="text-[11px] uppercase tracking-[0.16em] mb-2" style={{ color: tone.ink50 }}>
            Create
          </div>
          <h1 className="font-serif" style={{ fontSize: 52, lineHeight: 0.95, color: tone.ink }}>
            New deal
          </h1>
        </div>
        <div className="flex gap-2 shrink-0">
          <Btn variant="outline" onClick={() => router.back()}>
            Cancel
          </Btn>
          <Btn variant="primary" icon={<Icons.Check />} type="submit" disabled={saving}>
            {saving ? "Saving…" : "Save Deal"}
          </Btn>
        </div>
      </div>

      <div className="grid gap-8" style={{ gridTemplateColumns: "minmax(0, 1fr) 520px" }}>
        <div className="space-y-6">
          <Card>
            <div className="px-6 py-5" style={{ borderBottom: `1px solid ${tone.lineSoft}` }}>
              <div className="font-serif" style={{ fontSize: 20, color: tone.ink }}>
                Building
              </div>
            </div>
            <div className="p-6 space-y-4">
              {selectedBuilding ? (
                <div className="flex items-center justify-between rounded-lg p-4" style={{ background: tone.accentSoft, border: `1px solid ${tone.accent}` }}>
                  <div>
                    <div className="font-serif" style={{ fontSize: 20, color: tone.ink }}>
                      {selectedBuilding.name}
                    </div>
                    <div className="text-[12px] mt-1" style={{ color: tone.ink70 }}>
                      {selectedBuilding.region}
                      {selectedBuilding.managementCompany && ` · ${selectedBuilding.managementCompany}`}
                    </div>
                  </div>
                  <Btn variant="ghost" size="sm" onClick={() => setBuildingId(null)}>
                    Change
                  </Btn>
                </div>
              ) : (
                <>
                  <div className="flex items-center gap-2 h-10 px-3 rounded-lg" style={{ background: tone.card, border: `1px solid ${tone.line}` }}>
                    <span style={{ color: tone.ink30 }}>
                      <Icons.Search />
                    </span>
                    <input
                      value={buildingSearch}
                      onChange={(e) => setBuildingSearch(e.target.value)}
                      placeholder="Search buildings..."
                      className="flex-1 bg-transparent outline-none text-[13.5px]"
                      style={{ color: tone.ink }}
                    />
                  </div>
                  <div className="max-h-72 overflow-y-auto rounded-lg" style={{ border: `1px solid ${tone.line}` }}>
                    {filteredBuildings.slice(0, 60).map((building) => (
                      <button
                        key={building.id}
                        type="button"
                        onClick={() => setBuildingId(building.id)}
                        className="w-full text-left px-4 py-2.5 transition-colors hover:bg-[#FAF7F0]"
                        style={{ borderBottom: `1px solid ${tone.lineSoft}` }}
                      >
                        <div className="text-[13px]" style={{ color: tone.ink }}>
                          {building.name}
                        </div>
                        <div className="text-[11px] mt-0.5" style={{ color: tone.ink50 }}>
                          {building.region}
                          {building.managementCompany && ` · ${building.managementCompany}`}
                        </div>
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
          </Card>

          <Card>
            <div className="px-6 py-5" style={{ borderBottom: `1px solid ${tone.lineSoft}` }}>
              <div className="font-serif" style={{ fontSize: 20, color: tone.ink }}>
                Tenant & Lease
              </div>
            </div>
            <div className="p-6 grid grid-cols-2 gap-4">
              <LabeledField label="Unit *">
                <EditorialInput value={unit} onChange={setUnit} placeholder="12F" />
              </LabeledField>
              <LabeledField label="Move-in date">
                <EditorialInput value={moveInDate} onChange={setMoveInDate} type="date" mono />
              </LabeledField>
              <LabeledField label="Tenant name *" wide>
                <EditorialInput value={tenantName} onChange={setTenantName} placeholder="Full name(s)" />
              </LabeledField>
              <LabeledField label="Tenant email">
                <EditorialInput value={tenantEmail} onChange={setTenantEmail} mono />
              </LabeledField>
              <LabeledField label="Tenant phone">
                <EditorialInput value={tenantPhone} onChange={setTenantPhone} mono />
              </LabeledField>
              <LabeledField label="Apartment address" wide>
                <EditorialInput value={apartmentAddress} onChange={setApartmentAddress} />
              </LabeledField>
              <LabeledField label="Lease length">
                <EditorialInput value={leaseLengthMonths} onChange={(v) => setLeaseLengthMonths(Number(v))} type="number" mono />
              </LabeledField>
              <LabeledField label="Monthly rent">
                <EditorialInput value={rentAmount} onChange={setRentAmount} type="number" prefix="$" mono />
              </LabeledField>
            </div>
          </Card>

          <Card>
            <div className="px-6 py-5" style={{ borderBottom: `1px solid ${tone.lineSoft}` }}>
              <div className="font-serif" style={{ fontSize: 20, color: tone.ink }}>
                Agent
              </div>
            </div>
            <div className="p-6 space-y-4">
              <LabeledField label="Primary agent *">
                <select value={primaryAgentId || ""} onChange={(e) => setPrimaryAgentId(Number(e.target.value) || null)} className="w-full h-10 rounded-lg px-3 text-[13.5px] outline-none" style={{ background: tone.card, border: `1px solid ${tone.line}`, color: tone.ink }}>
                  <option value="">Select agent</option>
                  {agents.map(({ agent, teamName }) => (
                    <option key={agent.id} value={agent.id}>
                      {agent.name} {teamName ? `· ${teamName}` : ""}
                    </option>
                  ))}
                </select>
              </LabeledField>
              <label className="flex items-center gap-2 text-[13px]" style={{ color: tone.ink70 }}>
                <input type="checkbox" checked={hasCoAgent} onChange={(e) => setHasCoAgent(e.target.checked)} />
                Add co-agent
              </label>
              {hasCoAgent && (
                <div className="rounded-xl p-4 space-y-4" style={{ background: tone.paper, border: `1px solid ${tone.lineSoft}` }}>
                  <LabeledField label="Co-agent">
                    <select value={coAgentId || ""} onChange={(e) => setCoAgentId(Number(e.target.value) || null)} className="w-full h-10 rounded-lg px-3 text-[13.5px] outline-none" style={{ background: tone.card, border: `1px solid ${tone.line}`, color: tone.ink }}>
                      <option value="">Select co-agent</option>
                      {agents
                        .filter(({ agent }) => agent.id !== primaryAgentId)
                        .map(({ agent, teamName }) => (
                          <option key={agent.id} value={agent.id}>
                            {agent.name} {teamName ? `· ${teamName}` : ""}
                          </option>
                        ))}
                    </select>
                  </LabeledField>
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-[11px] uppercase tracking-[0.1em]" style={{ color: tone.ink50 }}>
                        Share split
                      </span>
                      <span className="font-mono text-[12px]" style={{ color: tone.ink70 }}>
                        Primary {primaryAgentSharePct}% · Co {100 - primaryAgentSharePct}%
                      </span>
                    </div>
                    <input
                      type="range"
                      min={0}
                      max={100}
                      value={primaryAgentSharePct}
                      onChange={(e) => setPrimaryAgentSharePct(Number(e.target.value))}
                      className="w-full"
                    />
                  </div>
                </div>
              )}
            </div>
          </Card>

          <Card>
            <div className="px-6 py-5" style={{ borderBottom: `1px solid ${tone.lineSoft}` }}>
              <div className="font-serif" style={{ fontSize: 20, color: tone.ink }}>
                Referral
              </div>
            </div>
            <div className="p-6 space-y-4">
              <label className="flex items-center gap-2 text-[13px]" style={{ color: tone.ink70 }}>
                <input type="checkbox" checked={hasReferrer} onChange={(e) => setHasReferrer(e.target.checked)} />
                Has referrer
              </label>
              {hasReferrer && (
                <div className="grid grid-cols-3 gap-4">
                  <LabeledField label="Referrer">
                    <select value={referrerId || ""} onChange={(e) => setReferrerId(Number(e.target.value) || null)} className="w-full h-10 rounded-lg px-3 text-[13.5px] outline-none" style={{ background: tone.card, border: `1px solid ${tone.line}`, color: tone.ink }}>
                      <option value="">Select</option>
                      {referrers.map((referrer) => (
                        <option key={referrer.id} value={referrer.id}>
                          {referrer.name}
                        </option>
                      ))}
                    </select>
                  </LabeledField>
                  <LabeledField label="Type">
                    <select value={referrerType} onChange={(e) => setReferrerType(e.target.value as "percent" | "flat")} className="w-full h-10 rounded-lg px-3 text-[13.5px] outline-none" style={{ background: tone.card, border: `1px solid ${tone.line}`, color: tone.ink }}>
                      <option value="percent">Percent</option>
                      <option value="flat">Flat</option>
                    </select>
                  </LabeledField>
                  <LabeledField label="Amount">
                    <EditorialInput value={referrerAmount} onChange={setReferrerAmount} type="number" prefix={referrerType === "flat" ? "$" : undefined} mono />
                  </LabeledField>
                </div>
              )}
            </div>
          </Card>

          <Card>
            <div className="px-6 py-5" style={{ borderBottom: `1px solid ${tone.lineSoft}` }}>
              <div className="font-serif" style={{ fontSize: 20, color: tone.ink }}>
                Commission
              </div>
            </div>
            <div className="p-6 space-y-4">
              <LabeledField label="Total commission *">
                <EditorialInput value={totalCommission} onChange={setTotalCommission} type="number" prefix="$" mono />
              </LabeledField>
              <div className="rounded-lg p-4 text-[13px]" style={{ background: tone.paper, color: tone.ink70 }}>
                Referrer gets <span className="font-mono">${fmtMoney(breakdown.referrerCut)}</span> · Primary agent takes{" "}
                <span className="font-mono">${fmtMoney(breakdown.primaryAgentTake)}</span> · Co-agent takes{" "}
                <span className="font-mono">${fmtMoney(breakdown.coAgentTake)}</span> · Company pool{" "}
                <span className="font-mono">${fmtMoney(breakdown.companyPoolTotal)}</span>
              </div>
            </div>
          </Card>

          <Card>
            <div className="px-6 py-5" style={{ borderBottom: `1px solid ${tone.lineSoft}` }}>
              <div className="font-serif" style={{ fontSize: 20, color: tone.ink }}>
                Notes
              </div>
            </div>
            <div className="p-6">
              <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} className="w-full rounded-lg p-3 text-[13.5px] outline-none" style={{ background: tone.card, border: `1px solid ${tone.line}`, color: tone.ink, resize: "vertical" }} />
            </div>
          </Card>
        </div>

        <div>
          <div className="sticky top-24 space-y-4">
            <div className="text-[11px] uppercase tracking-[0.14em]" style={{ color: tone.ink50 }}>
              Deal Summary
            </div>
            <Card>
              <div className="p-6">
                <div className="font-serif" style={{ fontSize: 30, color: tone.ink, lineHeight: 1 }}>
                  {selectedBuilding?.name || "Select building"}
                </div>
                <div className="mt-2 text-[13px]" style={{ color: tone.ink70 }}>
                  Unit {unit || "—"} · {tenantName || "Tenant"}
                </div>
                <div className="mt-6 flex items-center gap-3">
                  {[primaryAgent, hasCoAgent ? coAgent : null].filter(Boolean).map((agent) => (
                    <div key={agent!.id} className="flex items-center gap-2">
                      <div className="w-9 h-9 rounded-full flex items-center justify-center font-serif" style={{ background: tone.accentSoft, color: tone.accent }}>
                        {initials(agent!.name)}
                      </div>
                      <div>
                        <div className="text-[12.5px]" style={{ color: tone.ink }}>
                          {agent!.name}
                        </div>
                        <div className="text-[11px]" style={{ color: tone.ink50 }}>
                          {Number(agent!.splitPct || 0)}% split
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="mt-8">
                  <DealBreakdownBar breakdown={breakdown} />
                </div>
                <div className="mt-8 rounded-lg p-4" style={{ background: tone.paper }}>
                  <div className="text-[11px] uppercase tracking-[0.12em]" style={{ color: tone.ink50 }}>
                    Total Commission
                  </div>
                  <div className="mt-2 font-serif" style={{ fontSize: 44, color: tone.ink, lineHeight: 1 }}>
                    ${fmtMoney(Number(totalCommission || 0))}
                  </div>
                </div>
                <div className="mt-4 flex flex-wrap gap-2">
                  {hasReferrer && <Pill tone="draft">Referral</Pill>}
                  {hasCoAgent && <Pill tone="neutral">Co-agent</Pill>}
                  {moveInDate && <Pill tone="accent">Move-in set</Pill>}
                </div>
              </div>
            </Card>
          </div>
        </div>
      </div>
    </form>
  );
}
