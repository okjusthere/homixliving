"use client";

import { useEffect, useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import {
  Btn,
  Card,
  Icons,
  EditorialInput,
  LabeledField,
} from "@/components/homix/primitives";
import { tone, fmtMoney } from "@/components/homix/tokens";
import { ScaledInvoiceDoc } from "@/components/homix/invoice-doc";
import type { Building, LineItem } from "@/db/schema";

export default function NewInvoicePage() {
  const router = useRouter();
  const [buildings, setBuildings] = useState<Building[]>([]);
  const [settings, setSettings] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");

  const [buildingId, setBuildingId] = useState<number | null>(null);
  const [unit, setUnit] = useState("");
  const [tenantName, setTenantName] = useState("");
  const [agentName, setAgentName] = useState("");
  const [agentEmail, setAgentEmail] = useState("");
  const [agentPhone, setAgentPhone] = useState("");
  const [apartmentAddress, setApartmentAddress] = useState("");
  const [moveInDate, setMoveInDate] = useState("");
  const [licensedCompany, setLicensedCompany] = useState("Homix Living");
  const [year] = useState(2026);
  const [notes, setNotes] = useState("");
  const [lineItems, setLineItems] = useState<LineItem[]>([
    { description: "Rental Commission — 12 month lease", quantity: 1, unitPrice: 5000, amount: 5000 },
  ]);

  const selectedBuilding = useMemo(
    () => buildings.find((b) => b.id === buildingId) || null,
    [buildings, buildingId]
  );

  useEffect(() => {
    fetch("/api/buildings")
      .then((r) => r.json())
      .then(setBuildings);
    fetch("/api/settings")
      .then((r) => r.json())
      .then(setSettings);
  }, []);

  const totalAmount = useMemo(
    () => lineItems.reduce((sum, item) => sum + Number(item.amount || 0), 0),
    [lineItems]
  );

  // Auto-fill apartment address from building bill-to when building changes
  useEffect(() => {
    if (selectedBuilding && !apartmentAddress) {
      setApartmentAddress(selectedBuilding.billToAddress || "");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedBuilding?.id]);

  const previewInvoiceNumber = useMemo(() => {
    if (!unit || !selectedBuilding) return "—";
    if (selectedBuilding.invoiceNumberFormat) {
      return selectedBuilding.invoiceNumberFormat
        .replace("Unit", unit)
        .replace("{year}", String(year));
    }
    const key = selectedBuilding.name.toUpperCase().replace(/\s+/g, " ");
    return `${unit}-${key}-${year}`;
  }, [unit, selectedBuilding, year]);

  const previewFileName = useMemo(() => {
    if (!unit || !selectedBuilding) return "—";
    return `${unit}-${selectedBuilding.name}-Invoice-${licensedCompany || "Homix Living"}`;
  }, [unit, selectedBuilding, licensedCompany]);

  const previewInvoice = useMemo(
    () => ({
      invoiceNumber: previewInvoiceNumber,
      unit: unit || "—",
      tenantName: tenantName || "Tenant Name",
      agentName: agentName || undefined,
      agentEmail: agentEmail || undefined,
      agentPhone: agentPhone || undefined,
      apartmentAddress: apartmentAddress || (selectedBuilding?.billToAddress || ""),
      moveInDate: moveInDate || undefined,
      licensedCompany: licensedCompany || "Homix Living",
      lineItems,
      totalAmount,
      createdAt: new Date().toISOString(),
      fileName: previewFileName,
    }),
    [
      previewInvoiceNumber,
      previewFileName,
      unit,
      tenantName,
      agentName,
      agentEmail,
      agentPhone,
      apartmentAddress,
      moveInDate,
      licensedCompany,
      lineItems,
      totalAmount,
      selectedBuilding,
    ]
  );

  const settingsForDoc = {
    companyName: settings.company_name,
    companyAddress: settings.company_address,
    fromEmail: settings.from_email,
    payableTo: settings.payable_to,
    taxId: settings.tax_id,
    mailCheckAddress: settings.mail_check_address,
    achBankName: settings.ach_bank_name,
    achRoutingNumber: settings.ach_routing_number,
    achAccountNumber: settings.ach_account_number,
    achAccountName: settings.ach_account_name,
  };

  const updateLineItem = (
    index: number,
    field: keyof LineItem,
    value: string | number
  ) => {
    const updated = [...lineItems];
    (updated[index] as Record<string, unknown>)[field] = value;
    if (field === "quantity" || field === "unitPrice") {
      updated[index].amount =
        Number(updated[index].quantity) * Number(updated[index].unitPrice);
    }
    setLineItems(updated);
  };

  const addLineItem = () => {
    setLineItems([...lineItems, { description: "", quantity: 1, unitPrice: 0, amount: 0 }]);
  };

  const removeLineItem = (index: number) => {
    if (lineItems.length > 1) {
      setLineItems(lineItems.filter((_, i) => i !== index));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!buildingId) return toast.error("Please select a building");
    if (!unit || !tenantName || !licensedCompany)
      return toast.error("Please fill out all required fields");

    setLoading(true);
    try {
      const res = await fetch("/api/invoices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          buildingId,
          unit,
          tenantName,
          agentName,
          agentEmail,
          agentPhone,
          apartmentAddress,
          moveInDate,
          licensedCompany,
          year,
          lineItems,
          totalAmount,
          notes,
        }),
      });
      if (!res.ok) throw new Error("Failed to create invoice");
      const invoice = await res.json();
      toast.success("Invoice created");
      router.push(`/invoices/${invoice.id}`);
    } catch {
      toast.error("Creation failed, please try again");
    } finally {
      setLoading(false);
    }
  };

  const filteredBuildings = useMemo(() => {
    if (!search) return buildings;
    const q = search.toLowerCase();
    return buildings.filter(
      (b) =>
        b.name.toLowerCase().includes(q) ||
        b.region.toLowerCase().includes(q) ||
        (b.managementCompany || "").toLowerCase().includes(q)
    );
  }, [buildings, search]);

  return (
    <form onSubmit={handleSubmit}>
      {/* Header */}
      <div className="flex items-start justify-between mb-8">
        <div>
          <Link
            href="/invoices"
            className="flex items-center gap-1.5 text-[12.5px] mb-4"
            style={{ color: tone.ink50 }}
          >
            <Icons.Back /> Back
          </Link>
          <div
            className="text-[11px] uppercase tracking-[0.16em] mb-2"
            style={{ color: tone.ink50 }}
          >
            Create
          </div>
          <h1
            className="font-serif"
            style={{
              fontSize: 52,
              lineHeight: 0.95,
              letterSpacing: "-0.02em",
              color: tone.ink,
            }}
          >
            New invoice
          </h1>
        </div>
        <div className="flex gap-2 shrink-0">
          <Btn variant="outline" onClick={() => router.back()}>
            Cancel
          </Btn>
          <Btn variant="primary" icon={<Icons.Send />} type="submit" disabled={loading}>
            {loading ? "Creating…" : "Create Invoice"}
          </Btn>
        </div>
      </div>

      <Card className="mb-6">
        <div className="px-5 py-4 flex items-center justify-between gap-4">
          <div className="text-[13px]" style={{ color: tone.ink70 }}>
            <span className="font-medium" style={{ color: tone.ink }}>
              Tip
            </span>{" "}
            invoices are now created from a Deal.
          </div>
          <Link href="/deals" className="text-[13px] flex items-center gap-1" style={{ color: tone.accent }}>
            Browse deals <Icons.Arrow />
          </Link>
        </div>
      </Card>

      {/* Split layout */}
      <div className="grid gap-8" style={{ gridTemplateColumns: "minmax(0, 1fr) 560px" }}>
        <div className="space-y-6">
          {/* Building */}
          <Card>
            <div className="px-6 py-5" style={{ borderBottom: `1px solid ${tone.lineSoft}` }}>
              <div
                className="font-serif"
                style={{
                  fontSize: 20,
                  color: tone.ink,
                  letterSpacing: "-0.01em",
                }}
              >
                Building
              </div>
            </div>
            <div className="p-6 space-y-4">
              {selectedBuilding ? (
                <div
                  className="flex items-center justify-between rounded-lg p-4"
                  style={{
                    background: tone.accentSoft,
                    border: `1px solid ${tone.accent}`,
                  }}
                >
                  <div>
                    <div
                      className="font-serif"
                      style={{ fontSize: 20, color: tone.ink, letterSpacing: "-0.01em" }}
                    >
                      {selectedBuilding.name}
                    </div>
                    <div className="text-[12px] mt-1" style={{ color: tone.ink70 }}>
                      {selectedBuilding.region}
                      {selectedBuilding.managementCompany && ` · ${selectedBuilding.managementCompany}`}
                    </div>
                    {selectedBuilding.billToCompany && (
                      <div className="text-[11.5px] mt-1 font-mono" style={{ color: tone.ink50 }}>
                        Bill to: {selectedBuilding.billToCompany}
                      </div>
                    )}
                  </div>
                  <Btn variant="ghost" size="sm" onClick={() => setBuildingId(null)}>
                    Change
                  </Btn>
                </div>
              ) : (
                <>
                  <div
                    className="flex items-center gap-2 h-10 px-3 rounded-lg"
                    style={{ background: tone.card, border: `1px solid ${tone.line}` }}
                  >
                    <span style={{ color: tone.ink30 }}>
                      <Icons.Search />
                    </span>
                    <input
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      placeholder="Search buildings…"
                      className="flex-1 bg-transparent outline-none text-[13.5px]"
                      style={{ color: tone.ink }}
                    />
                  </div>
                  <div
                    className="max-h-72 overflow-y-auto rounded-lg"
                    style={{ border: `1px solid ${tone.line}` }}
                  >
                    {filteredBuildings.slice(0, 50).map((b) => (
                      <button
                        key={b.id}
                        type="button"
                        onClick={() => setBuildingId(b.id)}
                        className="w-full text-left px-4 py-2.5 transition-colors hover:bg-[#FAF7F0]"
                        style={{ borderBottom: `1px solid ${tone.lineSoft}` }}
                      >
                        <div className="text-[13px]" style={{ color: tone.ink }}>
                          {b.name}
                        </div>
                        <div className="text-[11px] mt-0.5" style={{ color: tone.ink50 }}>
                          {b.region}
                          {b.managementCompany && ` · ${b.managementCompany}`}
                        </div>
                      </button>
                    ))}
                  </div>
                </>
              )}

              {selectedBuilding?.specialNotes && (
                <div
                  className="rounded-lg p-3 text-[12.5px]"
                  style={{ background: tone.roseSoft, color: tone.rose }}
                >
                  <strong>Special requirement: </strong>
                  {selectedBuilding.specialNotes}
                </div>
              )}
              {selectedBuilding?.submissionNotes && (
                <div
                  className="rounded-lg p-3 text-[12.5px]"
                  style={{ background: tone.amberSoft, color: tone.amber }}
                >
                  <strong>Submission: </strong>
                  {selectedBuilding.submissionNotes}
                </div>
              )}
            </div>
          </Card>

          {/* Tenant & Unit */}
          <Card>
            <div className="px-6 py-5" style={{ borderBottom: `1px solid ${tone.lineSoft}` }}>
              <div
                className="font-serif"
                style={{
                  fontSize: 20,
                  color: tone.ink,
                  letterSpacing: "-0.01em",
                }}
              >
                Tenant & Unit
              </div>
            </div>
            <div className="p-6 grid grid-cols-2 gap-4">
              <LabeledField label="Unit *">
                <EditorialInput value={unit} onChange={setUnit} placeholder="e.g. 12F" />
              </LabeledField>
              <LabeledField label="Move-in Date">
                <EditorialInput
                  value={moveInDate}
                  onChange={setMoveInDate}
                  type="date"
                />
              </LabeledField>
              <LabeledField label="Tenant Name *" wide>
                <EditorialInput
                  value={tenantName}
                  onChange={setTenantName}
                  placeholder="Full name(s)"
                />
              </LabeledField>
              <LabeledField label="Apartment Address" wide>
                <EditorialInput
                  value={apartmentAddress}
                  onChange={setApartmentAddress}
                  placeholder="e.g. 888 Main St, Apt 12F, New York, NY"
                />
              </LabeledField>
            </div>
          </Card>

          {/* Agent */}
          <Card>
            <div className="px-6 py-5" style={{ borderBottom: `1px solid ${tone.lineSoft}` }}>
              <div
                className="font-serif"
                style={{
                  fontSize: 20,
                  color: tone.ink,
                  letterSpacing: "-0.01em",
                }}
              >
                Agent
              </div>
            </div>
            <div className="p-6 grid grid-cols-2 gap-4">
              <LabeledField label="Name">
                <EditorialInput value={agentName} onChange={setAgentName} placeholder="e.g. Sarah Kim" />
              </LabeledField>
              <LabeledField label="Phone">
                <EditorialInput
                  value={agentPhone}
                  onChange={setAgentPhone}
                  placeholder="(917) 555-0134"
                  mono
                />
              </LabeledField>
              <LabeledField label="Email (Reply-To)">
                <EditorialInput
                  value={agentEmail}
                  onChange={setAgentEmail}
                  placeholder="agent@homixny.com"
                  mono
                />
              </LabeledField>
              <LabeledField label="Licensed Company *">
                <EditorialInput
                  value={licensedCompany}
                  onChange={setLicensedCompany}
                  placeholder="Homix Living"
                />
              </LabeledField>
            </div>
          </Card>

          {/* Commission line items */}
          <Card>
            <div
              className="px-6 py-5 flex items-center justify-between"
              style={{ borderBottom: `1px solid ${tone.lineSoft}` }}
            >
              <div
                className="font-serif"
                style={{
                  fontSize: 20,
                  color: tone.ink,
                  letterSpacing: "-0.01em",
                }}
              >
                Commission
              </div>
              <Btn variant="ghost" size="sm" icon={<Icons.Plus />} onClick={addLineItem}>
                Add line
              </Btn>
            </div>
            <div className="p-6 space-y-3">
              {lineItems.map((item, index) => (
                <div key={index} className="grid grid-cols-12 gap-2 items-center">
                  <div className="col-span-5">
                    <EditorialInput
                      value={item.description}
                      onChange={(v) => updateLineItem(index, "description", v)}
                      placeholder="Description"
                    />
                  </div>
                  <div className="col-span-2">
                    <EditorialInput
                      value={item.quantity}
                      onChange={(v) => updateLineItem(index, "quantity", Number(v))}
                      type="number"
                      mono
                    />
                  </div>
                  <div className="col-span-2">
                    <EditorialInput
                      value={item.unitPrice}
                      onChange={(v) => updateLineItem(index, "unitPrice", Number(v))}
                      type="number"
                      mono
                      prefix="$"
                    />
                  </div>
                  <div
                    className="col-span-2 text-right font-mono text-[13.5px]"
                    style={{ color: tone.ink }}
                  >
                    ${fmtMoney(Number(item.amount || 0))}
                  </div>
                  <div className="col-span-1 flex justify-end">
                    <button
                      type="button"
                      onClick={() => removeLineItem(index)}
                      disabled={lineItems.length === 1}
                      className="h-8 w-8 flex items-center justify-center rounded disabled:opacity-30"
                      style={{ color: tone.ink50 }}
                    >
                      <Icons.Trash size={14} />
                    </button>
                  </div>
                </div>
              ))}

              <div
                className="rounded-lg p-4 flex items-center justify-between mt-4"
                style={{ background: tone.paper }}
              >
                <div>
                  <div
                    className="text-[11px] uppercase tracking-[0.12em]"
                    style={{ color: tone.ink50 }}
                  >
                    Invoice № preview
                  </div>
                  <div className="mt-1 font-mono text-[14px]" style={{ color: tone.ink }}>
                    {previewInvoiceNumber}
                  </div>
                </div>
                <div className="text-right">
                  <div
                    className="text-[11px] uppercase tracking-[0.12em]"
                    style={{ color: tone.ink50 }}
                  >
                    Total
                  </div>
                  <div
                    className="font-serif"
                    style={{
                      fontSize: 26,
                      color: tone.ink,
                      letterSpacing: "-0.01em",
                    }}
                  >
                    ${fmtMoney(totalAmount)}
                  </div>
                </div>
              </div>
            </div>
          </Card>

          {/* Notes */}
          <Card>
            <div className="px-6 py-5" style={{ borderBottom: `1px solid ${tone.lineSoft}` }}>
              <div
                className="font-serif"
                style={{
                  fontSize: 20,
                  color: tone.ink,
                  letterSpacing: "-0.01em",
                }}
              >
                Notes
              </div>
            </div>
            <div className="p-6">
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Optional notes for this invoice…"
                rows={3}
                className="w-full rounded-lg p-3 text-[13.5px] outline-none"
                style={{
                  background: tone.card,
                  border: `1px solid ${tone.line}`,
                  color: tone.ink,
                  resize: "vertical",
                }}
              />
            </div>
          </Card>
        </div>

        {/* RIGHT: Live preview */}
        <div>
          <div className="sticky top-24">
            <div
              className="text-[11px] uppercase tracking-[0.14em] mb-3"
              style={{ color: tone.ink50 }}
            >
              Live Preview
            </div>
            <div style={{ background: tone.paperDeep, padding: 16, borderRadius: 12 }}>
              <ScaledInvoiceDoc
                invoice={previewInvoice}
                building={selectedBuilding}
                settings={settingsForDoc}
                targetWidth={528}
              />
            </div>
            <div
              className="mt-3 font-mono text-[10.5px] text-center"
              style={{ color: tone.ink50 }}
            >
              {previewFileName}.pdf
            </div>
          </div>
        </div>
      </div>

      <input type="hidden" name="year" value={year} />
      {/* Hidden year input for accessibility */}
      <div style={{ display: "none" }}>{year}</div>
    </form>
  );
}
