"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Btn, Card, EditorialInput, Icons, LabeledField, Pill } from "@/components/homix/primitives";
import { DealBreakdownBar } from "@/components/homix/deal-breakdown";
import { fmtMoney, tone } from "@/components/homix/tokens";
import { computeCommission } from "@/lib/commission";
import { SOURCE_OPTIONS, type DealSource } from "@/lib/sources";
import type { Agent, Building } from "@/db/schema";

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
  const [saving, setSaving] = useState(false);
  const [buildingSearch, setBuildingSearch] = useState("");

  const [buildingId, setBuildingId] = useState<number | null>(null);
  const [showAddBuilding, setShowAddBuilding] = useState(false);
  const [addingBuilding, setAddingBuilding] = useState(false);
  const [newBuildingName, setNewBuildingName] = useState("");
  const [newBuildingRegion, setNewBuildingRegion] = useState("");
  const [newBuildingMgmt, setNewBuildingMgmt] = useState("");
  const [newBuildingBillTo, setNewBuildingBillTo] = useState("");
  const [newBuildingBillToAddress, setNewBuildingBillToAddress] = useState("");
  const [newBuildingContactEmail, setNewBuildingContactEmail] = useState("");

  const resetAddBuilding = () => {
    setNewBuildingName("");
    setNewBuildingRegion("");
    setNewBuildingMgmt("");
    setNewBuildingBillTo("");
    setNewBuildingBillToAddress("");
    setNewBuildingContactEmail("");
  };

  const handleAddBuilding = async () => {
    if (!newBuildingName.trim() || !newBuildingRegion.trim()) {
      toast.error("Name and region are required");
      return;
    }
    setAddingBuilding(true);
    try {
      const res = await fetch("/api/buildings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newBuildingName.trim(),
          region: newBuildingRegion.trim(),
          managementCompany: newBuildingMgmt.trim() || null,
          billToCompany: newBuildingBillTo.trim() || null,
          billToAddress: newBuildingBillToAddress.trim() || null,
          contactEmail: newBuildingContactEmail.trim() || null,
          submissionType: "email",
        }),
      });
      if (!res.ok) throw new Error();
      const created = (await res.json()) as Building;
      setBuildings((prev) => [...prev, created]);
      setBuildingId(created.id);
      toast.success(`${created.name} added`);
      setShowAddBuilding(false);
      resetAddBuilding();
    } catch {
      toast.error("Could not add building");
    } finally {
      setAddingBuilding(false);
    }
  };
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
  // Free-text name + payment-info supersede the old `referrerId` dropdown.
  // Most referrers are ad-hoc external people (parent's friend, school staff)
  // that don't need a master record. The legacy `referrers` table is still
  // there for old deals; new deals just write these two strings to `deals`.
  const [referrerName, setReferrerName] = useState("");
  const [referrerType, setReferrerType] = useState<"percent" | "flat">("percent");
  const [referrerAmount, setReferrerAmount] = useState("");
  const [referrerPaymentInfo, setReferrerPaymentInfo] = useState("");
  const [totalCommission, setTotalCommission] = useState("");
  const [notes, setNotes] = useState("");
  const [source, setSource] = useState<DealSource | "">("");

  useEffect(() => {
    Promise.all([
      fetch("/api/buildings").then((r) => r.json()),
      fetch("/api/agents").then((r) => r.json()),
    ]).then(([buildingRows, agentRows]) => {
      setBuildings(buildingRows);
      setAgents(agentRows);
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
          referrerId: null, // legacy column — new deals always use free-text below
          referrerName: hasReferrer ? referrerName.trim() || null : null,
          referrerType: hasReferrer ? referrerType : null,
          referrerAmount: hasReferrer ? Number(referrerAmount || 0) : null,
          referrerPaymentInfo: hasReferrer ? referrerPaymentInfo.trim() || null : null,
          source: source || null,
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
                  <div className="flex items-center gap-2">
                    <div className="flex-1 flex items-center gap-2 h-10 px-3 rounded-lg" style={{ background: tone.card, border: `1px solid ${tone.line}` }}>
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
                    <Btn variant="outline" size="sm" icon={<Icons.Plus />} onClick={() => setShowAddBuilding(true)}>
                      Add new
                    </Btn>
                  </div>
                  <div className="max-h-72 overflow-y-auto rounded-lg" style={{ border: `1px solid ${tone.line}` }}>
                    {filteredBuildings.length === 0 ? (
                      <div className="px-4 py-8 text-center text-[12.5px]" style={{ color: tone.ink50 }}>
                        No matches.{" "}
                        <button
                          type="button"
                          onClick={() => {
                            setNewBuildingName(buildingSearch);
                            setShowAddBuilding(true);
                          }}
                          className="underline"
                          style={{ color: tone.accent }}
                        >
                          Add &ldquo;{buildingSearch}&rdquo; as a new building
                        </button>
                      </div>
                    ) : (
                      filteredBuildings.slice(0, 60).map((building) => (
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
                      ))
                    )}
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
                <div className="space-y-4">
                  <div className="grid grid-cols-3 gap-4">
                    <LabeledField label="Referrer name">
                      <EditorialInput
                        value={referrerName}
                        onChange={setReferrerName}
                        placeholder="e.g. Jane Smith / NYU housing office"
                      />
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
                  <div>
                    <div
                      className="text-[11px] uppercase tracking-[0.1em] mb-2"
                      style={{ color: tone.ink50 }}
                    >
                      Payment method
                    </div>
                    <textarea
                      value={referrerPaymentInfo}
                      onChange={(e) => setReferrerPaymentInfo(e.target.value)}
                      rows={3}
                      placeholder="Zelle: 555-0102&#10;or ACH: Bank XYZ, routing 12345, acct 67890"
                      className="w-full rounded-lg p-3 text-[13.5px] outline-none font-mono"
                      style={{
                        background: tone.card,
                        border: `1px solid ${tone.line}`,
                        color: tone.ink,
                        resize: "vertical",
                      }}
                    />
                    <div
                      className="text-[11.5px] mt-1.5"
                      style={{ color: tone.ink50 }}
                    >
                      How to pay this referrer once Homix collects from the
                      building. Free-text — Zelle, ACH, wire, etc.
                    </div>
                  </div>
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
                Source
              </div>
              <div className="text-[12px] mt-0.5" style={{ color: tone.ink50 }}>
                客源来自哪里？— 帮我们分析渠道转化
              </div>
            </div>
            <div className="p-6 grid grid-cols-3 gap-2">
              {SOURCE_OPTIONS.map((opt) => {
                const active = source === opt.value;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() =>
                      setSource((prev) => (prev === opt.value ? "" : opt.value))
                    }
                    className="rounded-lg px-3 py-3 flex items-center gap-2 transition-colors text-[13px] text-left"
                    style={{
                      background: active ? tone.accentSoft : tone.card,
                      border: `1px solid ${active ? tone.accent : tone.line}`,
                      color: active ? tone.ink : tone.ink70,
                    }}
                  >
                    <span style={{ fontSize: 16 }}>{opt.emoji}</span>
                    <span className={active ? "font-medium" : ""}>{opt.label}</span>
                  </button>
                );
              })}
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

      {/* Add new building dialog */}
      {showAddBuilding && (
        <div
          className="fixed inset-0 z-40 flex items-center justify-center p-4"
          style={{ background: "rgba(26, 24, 20, 0.45)" }}
          onClick={() => !addingBuilding && setShowAddBuilding(false)}
        >
          <div
            className="rounded-2xl w-full max-w-xl flex flex-col"
            style={{
              background: tone.paper,
              boxShadow: "0 30px 80px -20px rgba(0,0,0,0.3)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div
              className="px-7 py-5 flex items-center justify-between"
              style={{ borderBottom: `1px solid ${tone.line}` }}
            >
              <div>
                <div
                  className="text-[11px] uppercase tracking-[0.14em]"
                  style={{ color: tone.ink50 }}
                >
                  New building
                </div>
                <div
                  className="font-serif"
                  style={{ fontSize: 22, color: tone.ink, letterSpacing: "-0.01em", marginTop: 2 }}
                >
                  Add a building
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowAddBuilding(false)}
                disabled={addingBuilding}
                className="w-8 h-8 rounded-full flex items-center justify-center"
                style={{ background: tone.paperDeep, color: tone.ink70 }}
              >
                ×
              </button>
            </div>

            <div className="px-7 py-5 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <LabeledField label="Name *">
                  <EditorialInput
                    value={newBuildingName}
                    onChange={setNewBuildingName}
                    placeholder="e.g. The Octagon"
                  />
                </LabeledField>
                <LabeledField label="Region *">
                  <EditorialInput
                    value={newBuildingRegion}
                    onChange={setNewBuildingRegion}
                    placeholder="e.g. NJ, BK, LIC"
                  />
                </LabeledField>
                <LabeledField label="Management company">
                  <EditorialInput
                    value={newBuildingMgmt}
                    onChange={setNewBuildingMgmt}
                    placeholder="e.g. Greystar"
                  />
                </LabeledField>
                <LabeledField label="Contact email">
                  <EditorialInput
                    value={newBuildingContactEmail}
                    onChange={setNewBuildingContactEmail}
                    placeholder="leasing@..."
                    mono
                  />
                </LabeledField>
                <LabeledField label="Bill to (company)" wide>
                  <EditorialInput
                    value={newBuildingBillTo}
                    onChange={setNewBuildingBillTo}
                    placeholder="Who the invoice is billed to"
                  />
                </LabeledField>
                <LabeledField label="Bill to (address)" wide>
                  <EditorialInput
                    value={newBuildingBillToAddress}
                    onChange={setNewBuildingBillToAddress}
                    placeholder="Mailing address for invoices"
                  />
                </LabeledField>
              </div>
              <p className="text-[11.5px]" style={{ color: tone.ink50 }}>
                You can fill the rest later in the Buildings directory.
              </p>
            </div>

            <div
              className="px-7 py-4 flex items-center justify-end gap-2"
              style={{ borderTop: `1px solid ${tone.line}`, background: tone.paper }}
            >
              <Btn
                variant="outline"
                onClick={() => setShowAddBuilding(false)}
                disabled={addingBuilding}
              >
                Cancel
              </Btn>
              <Btn
                variant="primary"
                onClick={handleAddBuilding}
                disabled={addingBuilding}
              >
                {addingBuilding ? "Adding…" : "Add building"}
              </Btn>
            </div>
          </div>
        </div>
      )}
    </form>
  );
}
