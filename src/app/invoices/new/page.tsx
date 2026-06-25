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
import { PageHeader, CardHeader } from "@/components/homix/page-kit";
import { tone, fmtMoney } from "@/components/homix/tokens";
import { ScaledInvoiceDoc } from "@/components/homix/invoice-doc";
import type { Building, LineItem } from "@/db/schema";
import { invoiceSettingsForDocument } from "@/lib/invoice-settings";
import { useLocale } from "@/lib/i18n-client";

const M = {
  en: {
    selectBuilding: "Please select a building",
    fillRequired: "Please fill out all required fields",
    invoiceCreated: "Invoice created",
    creationFailed: "Creation failed, please try again",
    eyebrow: "Create",
    title: "New invoice",
    back: "Back",
    cancel: "Cancel",
    creating: "Creating…",
    createInvoice: "Create Invoice",
    tip: "Tip",
    tipBody: "invoices are now created from a Rental.",
    browseRental: "Browse rental",
    building: "Building",
    billTo: "Bill to:",
    change: "Change",
    searchBuildings: "Search buildings…",
    specialRequirement: "Special requirement: ",
    submission: "Submission: ",
    tenantUnit: "Tenant & Unit",
    unitLabel: "Unit *",
    unitPlaceholder: "e.g. 12F",
    moveInDate: "Move-in Date",
    tenantNameLabel: "Tenant Name *",
    tenantNamePlaceholder: "Full name(s)",
    apartmentAddress: "Apartment Address",
    apartmentAddressPlaceholder: "e.g. 888 Main St, Apt 12F, New York, NY",
    agent: "Agent",
    nameLabel: "Name",
    namePlaceholder: "e.g. Sarah Kim",
    phoneLabel: "Phone",
    emailLabel: "Email (Reply-To)",
    licensedCompanyLabel: "Licensed Company *",
    commission: "Commission",
    addLine: "Add line",
    descriptionPlaceholder: "Description",
    invoicePreview: "Invoice № preview",
    total: "Total",
    notes: "Notes",
    notesPlaceholder: "Optional notes for this invoice…",
    livePreview: "Live Preview",
  },
  zh: {
    selectBuilding: "请选择楼盘",
    fillRequired: "请填写所有必填项",
    invoiceCreated: "发票已创建",
    creationFailed: "创建失败，请重试",
    eyebrow: "创建",
    title: "新建发票",
    back: "返回",
    cancel: "取消",
    creating: "创建中…",
    createInvoice: "创建发票",
    tip: "提示",
    tipBody: "发票现已改为从租赁创建。",
    browseRental: "查看租赁",
    building: "楼盘",
    billTo: "账单抬头：",
    change: "更改",
    searchBuildings: "搜索楼盘…",
    specialRequirement: "特殊要求：",
    submission: "提交：",
    tenantUnit: "租客与单元",
    unitLabel: "单元 *",
    unitPlaceholder: "例如 12F",
    moveInDate: "入住日期",
    tenantNameLabel: "租客姓名 *",
    tenantNamePlaceholder: "完整姓名",
    apartmentAddress: "公寓地址",
    apartmentAddressPlaceholder: "例如 888 Main St, Apt 12F, New York, NY",
    agent: "经纪人",
    nameLabel: "姓名",
    namePlaceholder: "例如 Sarah Kim",
    phoneLabel: "电话",
    emailLabel: "邮箱（回复地址）",
    licensedCompanyLabel: "持牌公司 *",
    commission: "佣金",
    addLine: "添加明细",
    descriptionPlaceholder: "描述",
    invoicePreview: "发票编号预览",
    total: "合计",
    notes: "备注",
    notesPlaceholder: "为此发票添加备注（可选）…",
    livePreview: "实时预览",
  },
} as const;

export default function NewInvoicePage() {
  const router = useRouter();
  const t = M[useLocale()];
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

  const settingsForDoc = invoiceSettingsForDocument(settings);

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
    if (!buildingId) return toast.error(t.selectBuilding);
    if (!unit || !tenantName || !licensedCompany)
      return toast.error(t.fillRequired);

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
      toast.success(t.invoiceCreated);
      router.push(`/invoices/${invoice.id}`);
    } catch {
      toast.error(t.creationFailed);
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
    <form onSubmit={handleSubmit} className="space-y-7">
      <PageHeader
        eyebrow={t.eyebrow}
        title={t.title}
        actions={
          <>
            <Link href="/invoices">
              <Btn variant="ghost" icon={<Icons.Back />}>
                {t.back}
              </Btn>
            </Link>
            <Btn variant="outline" onClick={() => router.back()}>
              {t.cancel}
            </Btn>
            <Btn variant="primary" icon={<Icons.Send />} type="submit" disabled={loading}>
              {loading ? t.creating : t.createInvoice}
            </Btn>
          </>
        }
      />

      <Card>
        <div className="px-5 py-4 flex items-center justify-between gap-4">
          <div className="text-[13px]" style={{ color: tone.ink70 }}>
            <span className="font-medium" style={{ color: tone.ink }}>
              {t.tip}
            </span>{" "}
            {t.tipBody}
          </div>
          <Link href="/rental" className="text-[13px] flex items-center gap-1" style={{ color: tone.accent }}>
            {t.browseRental} <Icons.Arrow />
          </Link>
        </div>
      </Card>

      {/* Split layout */}
      <div className="grid gap-8" style={{ gridTemplateColumns: "minmax(0, 1fr) 560px" }}>
        <div className="space-y-6">
          {/* Building */}
          <Card>
            <CardHeader title={t.building} />
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
                        {t.billTo} {selectedBuilding.billToCompany}
                      </div>
                    )}
                  </div>
                  <Btn variant="ghost" size="sm" onClick={() => setBuildingId(null)}>
                    {t.change}
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
                      placeholder={t.searchBuildings}
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
                  <strong>{t.specialRequirement}</strong>
                  {selectedBuilding.specialNotes}
                </div>
              )}
              {selectedBuilding?.submissionNotes && (
                <div
                  className="rounded-lg p-3 text-[12.5px]"
                  style={{ background: tone.amberSoft, color: tone.amber }}
                >
                  <strong>{t.submission}</strong>
                  {selectedBuilding.submissionNotes}
                </div>
              )}
            </div>
          </Card>

          {/* Tenant & Unit */}
          <Card>
            <CardHeader title={t.tenantUnit} />
            <div className="p-6 grid grid-cols-2 gap-4">
              <LabeledField label={t.unitLabel}>
                <EditorialInput value={unit} onChange={setUnit} placeholder={t.unitPlaceholder} />
              </LabeledField>
              <LabeledField label={t.moveInDate}>
                <EditorialInput
                  value={moveInDate}
                  onChange={setMoveInDate}
                  type="date"
                />
              </LabeledField>
              <LabeledField label={t.tenantNameLabel} wide>
                <EditorialInput
                  value={tenantName}
                  onChange={setTenantName}
                  placeholder={t.tenantNamePlaceholder}
                />
              </LabeledField>
              <LabeledField label={t.apartmentAddress} wide>
                <EditorialInput
                  value={apartmentAddress}
                  onChange={setApartmentAddress}
                  placeholder={t.apartmentAddressPlaceholder}
                />
              </LabeledField>
            </div>
          </Card>

          {/* Agent */}
          <Card>
            <CardHeader title={t.agent} />
            <div className="p-6 grid grid-cols-2 gap-4">
              <LabeledField label={t.nameLabel}>
                <EditorialInput value={agentName} onChange={setAgentName} placeholder={t.namePlaceholder} />
              </LabeledField>
              <LabeledField label={t.phoneLabel}>
                <EditorialInput
                  value={agentPhone}
                  onChange={setAgentPhone}
                  placeholder="(917) 555-0134"
                  mono
                />
              </LabeledField>
              <LabeledField label={t.emailLabel}>
                <EditorialInput
                  value={agentEmail}
                  onChange={setAgentEmail}
                  placeholder="agent@homixny.com"
                  mono
                />
              </LabeledField>
              <LabeledField label={t.licensedCompanyLabel}>
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
            <CardHeader
              title={t.commission}
              action={
                <Btn variant="ghost" size="sm" icon={<Icons.Plus />} onClick={addLineItem}>
                  {t.addLine}
                </Btn>
              }
            />
            <div className="p-6 space-y-3">
              {lineItems.map((item, index) => (
                <div key={index} className="grid grid-cols-12 gap-2 items-center">
                  <div className="col-span-5">
                    <EditorialInput
                      value={item.description}
                      onChange={(v) => updateLineItem(index, "description", v)}
                      placeholder={t.descriptionPlaceholder}
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
                    {t.invoicePreview}
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
                    {t.total}
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
            <CardHeader title={t.notes} />
            <div className="p-6">
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder={t.notesPlaceholder}
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
              {t.livePreview}
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
