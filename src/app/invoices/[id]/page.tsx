"use client";

import { useEffect, useState, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import { Pill, Btn, Card, SoftField, Icons } from "@/components/homix/primitives";
import { tone, fmtMoney, fmtDate } from "@/components/homix/tokens";
import { ScaledInvoiceDoc } from "@/components/homix/invoice-doc";
import { SendDialog } from "@/components/homix/send-dialog";
import type { Building, Invoice, LineItem } from "@/db/schema";

type Settings = Record<string, string>;

function settingsForDoc(s: Settings) {
  return {
    companyName: s.company_name,
    companyAddress: s.company_address,
    fromEmail: s.from_email,
    ccEmail: s.cc_email,
    payableTo: s.payable_to,
    taxId: s.tax_id,
    mailCheckAddress: s.mail_check_address,
    achBankName: s.ach_bank_name,
    achRoutingNumber: s.ach_routing_number,
    achAccountNumber: s.ach_account_number,
    achAccountName: s.ach_account_name,
    wireAccountName: s.wire_account_name,
    wireBankName: s.wire_bank_name,
    wireRoutingNumber: s.wire_routing_number,
    wireAccountNumber: s.wire_account_number,
    wireBankAddress: s.wire_bank_address,
    wireSwiftCode: s.wire_swift_code,
  };
}

export default function InvoiceDetailPage() {
  const params = useParams();
  const router = useRouter();
  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [building, setBuilding] = useState<Building | null>(null);
  const [settings, setSettings] = useState<Settings>({});
  const [loading, setLoading] = useState(true);
  const [showSend, setShowSend] = useState(false);

  const previewRef = useRef<HTMLDivElement>(null);
  const [previewWidth, setPreviewWidth] = useState(520);

  useEffect(() => {
    Promise.all([
      fetch(`/api/invoices/${params.id}`).then((r) => r.json()),
      fetch("/api/settings").then((r) => r.json()),
    ]).then(([invoiceData, settingsData]) => {
      setInvoice(invoiceData.invoice);
      setBuilding(invoiceData.building);
      setSettings(settingsData);
      setLoading(false);
    });
  }, [params.id]);

  useEffect(() => {
    const update = () => {
      if (previewRef.current) {
        setPreviewWidth(Math.min(previewRef.current.clientWidth, 720));
      }
    };
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, [loading]);

  const handleDownloadPDF = () => {
    window.open(`/api/invoices/${params.id}/pdf`, "_blank");
  };

  const handleDelete = async () => {
    if (!confirm("Delete this invoice? This cannot be undone.")) return;
    await fetch(`/api/invoices/${params.id}`, { method: "DELETE" });
    toast.success("Invoice deleted");
    router.push("/invoices");
  };

  const refreshInvoice = async () => {
    const updated = await fetch(`/api/invoices/${params.id}`).then((r) => r.json());
    setInvoice(updated.invoice);
    setBuilding(updated.building);
  };

  const handleMarkPaid = async () => {
    try {
      const res = await fetch(`/api/invoices/${params.id}/mark-paid`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      if (!res.ok) throw new Error();
      toast.success("Marked as paid");
      await refreshInvoice();
    } catch {
      toast.error("Could not mark as paid");
    }
  };

  const handleUnmarkPaid = async () => {
    if (!confirm("Mark this invoice as unpaid again?")) return;
    try {
      const res = await fetch(`/api/invoices/${params.id}/mark-paid`, { method: "DELETE" });
      if (!res.ok) throw new Error();
      toast.success("Reverted to sent");
      await refreshInvoice();
    } catch {
      toast.error("Could not revert");
    }
  };

  if (loading) {
    return (
      <div className="py-24 text-center text-[13px]" style={{ color: tone.ink50 }}>
        Loading…
      </div>
    );
  }
  if (!invoice || !building) {
    return (
      <div className="py-24 text-center">
        <div className="font-serif text-2xl" style={{ color: tone.ink }}>
          Invoice not found
        </div>
        <Link href="/invoices" className="mt-4 inline-block text-[13px] underline" style={{ color: tone.accent }}>
          Back to invoices
        </Link>
      </div>
    );
  }

  const lineItems: LineItem[] =
    typeof invoice.lineItems === "string"
      ? JSON.parse(invoice.lineItems)
      : invoice.lineItems || [];

  const issueDate = invoice.createdAt || new Date().toISOString();
  const dueDate = new Date(new Date(issueDate).getTime() + 30 * 86400000).toISOString();

  const invoiceForDoc = {
    invoiceNumber: invoice.invoiceNumber,
    unit: invoice.unit,
    tenantName: invoice.tenantName,
    agentName: invoice.agentName,
    agentEmail: invoice.agentEmail,
    agentPhone: invoice.agentPhone,
    apartmentAddress: invoice.apartmentAddress,
    moveInDate: invoice.moveInDate,
    licensedCompany: invoice.licensedCompany,
    lineItems,
    totalAmount: invoice.totalAmount,
    createdAt: invoice.createdAt,
    fileName: invoice.fileName,
  };

  return (
    <div>
      {/* Header */}
      <div className="flex items-start justify-between mb-8 gap-6">
        <div>
          <Link
            href="/invoices"
            className="flex items-center gap-1.5 text-[12.5px] mb-4"
            style={{ color: tone.ink50 }}
          >
            <Icons.Back /> Back to invoices
          </Link>
          <div className="flex items-center gap-3 mb-2">
            <Pill
              tone={
                invoice.status === "paid"
                  ? "sent"
                  : invoice.status === "sent"
                  ? "accent"
                  : invoice.status === "failed"
                  ? "failed"
                  : "draft"
              }
            >
              {invoice.status === "paid"
                ? "Paid"
                : invoice.status === "sent"
                ? "Sent"
                : invoice.status === "failed"
                ? "Failed"
                : "Draft"}
            </Pill>
            {invoice.status === "paid" && invoice.paidAt && (
              <span className="text-[12px]" style={{ color: tone.green }}>
                Paid {fmtDate(invoice.paidAt)}
                {invoice.paidAmount !== invoice.totalAmount && invoice.paidAmount !== null && (
                  <> · ${fmtMoney(Number(invoice.paidAmount))}</>
                )}
              </span>
            )}
            {invoice.status === "sent" && invoice.sentAt && (
              <span className="text-[12px]" style={{ color: tone.ink50 }}>
                Sent {fmtDate(invoice.sentAt)} at{" "}
                {new Date(invoice.sentAt).toLocaleTimeString("en-US", {
                  hour: "numeric",
                  minute: "2-digit",
                })}
              </span>
            )}
          </div>
          <h1
            className="font-serif"
            style={{
              fontSize: 44,
              lineHeight: 1,
              letterSpacing: "-0.02em",
              color: tone.ink,
              wordBreak: "break-all",
            }}
          >
            {invoice.invoiceNumber}
          </h1>
          <div className="mt-3 text-[14px]" style={{ color: tone.ink70 }}>
            {building.name} · Unit {invoice.unit} · {invoice.tenantName}
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Btn variant="outline" icon={<Icons.Download />} onClick={handleDownloadPDF}>
            Download PDF
          </Btn>
          <Btn variant="danger" icon={<Icons.Trash />} onClick={handleDelete}>
            Delete
          </Btn>
          {invoice.status === "paid" ? (
            <Btn variant="outline" onClick={handleUnmarkPaid}>
              Mark unpaid
            </Btn>
          ) : invoice.status === "sent" ? (
            <Btn variant="primary" icon={<Icons.Check />} onClick={handleMarkPaid}>
              Mark paid
            </Btn>
          ) : null}
          <Btn variant="primary" icon={<Icons.Send />} onClick={() => setShowSend(true)}>
            {invoice.status === "sent" || invoice.status === "paid" ? "Resend" : "Send Invoice"}
          </Btn>
        </div>
      </div>

      {/* Special notes alert */}
      {building.specialNotes && (
        <div
          className="rounded-lg p-4 text-[13px] mb-6"
          style={{ background: tone.roseSoft, color: tone.rose, border: `1px solid ${tone.rose}20` }}
        >
          <strong>Special requirement: </strong>
          {building.specialNotes}
        </div>
      )}

      {/* Split layout */}
      <div className="grid gap-8" style={{ gridTemplateColumns: "minmax(0, 1fr) 560px" }}>
        {/* LEFT: details */}
        <div className="space-y-6">
          {/* Amount hero */}
          <Card>
            <div className="p-8">
              <div
                className="text-[11px] uppercase tracking-[0.14em]"
                style={{ color: tone.ink50 }}
              >
                Total Due
              </div>
              <div
                className="font-serif"
                style={{
                  fontSize: 76,
                  lineHeight: 0.9,
                  letterSpacing: "-0.03em",
                  color: tone.ink,
                  marginTop: 8,
                }}
              >
                <span style={{ fontSize: 32, color: tone.ink50, marginRight: 6 }}>$</span>
                {fmtMoney(invoice.totalAmount)}
              </div>
              <div
                className="mt-4 flex items-center gap-6 text-[12.5px]"
                style={{ color: tone.ink70 }}
              >
                <span>
                  Due <span className="font-mono">{fmtDate(dueDate)}</span>
                </span>
                <span>·</span>
                <span>Net 30</span>
                <span>·</span>
                <span>USD</span>
              </div>
            </div>
          </Card>

          {/* Two-column info */}
          <div className="grid grid-cols-2 gap-4">
            <Card>
              <div className="p-6">
                <div
                  className="text-[11px] uppercase tracking-[0.12em] mb-4"
                  style={{ color: tone.ink50 }}
                >
                  Billed To
                </div>
                <div
                  className="font-serif"
                  style={{
                    fontSize: 20,
                    color: tone.ink,
                    letterSpacing: "-0.01em",
                  }}
                >
                  {building.billToCompany || building.name}
                </div>
                <div
                  className="mt-3 text-[12.5px] leading-relaxed"
                  style={{ color: tone.ink70 }}
                >
                  {building.billToAddress || "—"}
                </div>
                {building.managementCompany && (
                  <div
                    className="mt-3 font-mono text-[11.5px]"
                    style={{ color: tone.ink50 }}
                  >
                    c/o {building.managementCompany}
                  </div>
                )}
              </div>
            </Card>
            <Card>
              <div className="p-6">
                <div
                  className="text-[11px] uppercase tracking-[0.12em] mb-4"
                  style={{ color: tone.ink50 }}
                >
                  Tenant & Unit
                </div>
                <div
                  className="font-serif"
                  style={{
                    fontSize: 20,
                    color: tone.ink,
                    letterSpacing: "-0.01em",
                  }}
                >
                  {invoice.tenantName}
                </div>
                <div
                  className="mt-3 text-[12.5px] leading-relaxed"
                  style={{ color: tone.ink70 }}
                >
                  {invoice.apartmentAddress || `Unit ${invoice.unit} · ${building.name}`}
                </div>
                {invoice.moveInDate && (
                  <div
                    className="mt-3 font-mono text-[11.5px]"
                    style={{ color: tone.ink50 }}
                  >
                    Move-in {fmtDate(invoice.moveInDate)}
                  </div>
                )}
              </div>
            </Card>
          </div>

          {/* Line items */}
          <Card>
            <div
              className="px-6 py-5"
              style={{ borderBottom: `1px solid ${tone.lineSoft}` }}
            >
              <div
                className="font-serif"
                style={{
                  fontSize: 18,
                  color: tone.ink,
                  letterSpacing: "-0.01em",
                }}
              >
                Line items
              </div>
            </div>
            <div className="px-6 py-2">
              {lineItems.map((it, i) => (
                <div
                  key={i}
                  className="py-4 flex items-start justify-between gap-6"
                  style={{
                    borderBottom:
                      i < lineItems.length - 1 ? `1px solid ${tone.lineSoft}` : "none",
                  }}
                >
                  <div className="flex-1">
                    <div className="text-[13.5px]" style={{ color: tone.ink }}>
                      {it.description}
                    </div>
                    <div
                      className="mt-1 font-mono text-[11.5px]"
                      style={{ color: tone.ink50 }}
                    >
                      {it.quantity} × ${fmtMoney(it.unitPrice)}
                    </div>
                  </div>
                  <div
                    className="font-serif"
                    style={{
                      fontSize: 20,
                      color: tone.ink,
                      letterSpacing: "-0.01em",
                    }}
                  >
                    ${fmtMoney(it.amount)}
                  </div>
                </div>
              ))}
            </div>
            <div
              className="px-6 py-4 flex items-center justify-between"
              style={{ background: tone.paper, borderTop: `1px solid ${tone.lineSoft}` }}
            >
              <span
                className="text-[11px] uppercase tracking-[0.12em]"
                style={{ color: tone.ink50 }}
              >
                Total
              </span>
              <span
                className="font-serif"
                style={{
                  fontSize: 22,
                  color: tone.ink,
                  letterSpacing: "-0.01em",
                }}
              >
                ${fmtMoney(invoice.totalAmount)}
              </span>
            </div>
          </Card>

          {/* Agent + Building meta */}
          <div className="grid grid-cols-2 gap-4">
            <Card>
              <div className="p-6 space-y-4">
                <div
                  className="text-[11px] uppercase tracking-[0.12em]"
                  style={{ color: tone.ink50 }}
                >
                  Agent
                </div>
                <SoftField label="Name" value={invoice.agentName || "—"} />
                <SoftField label="Email" value={invoice.agentEmail || "—"} mono />
                <SoftField label="Phone" value={invoice.agentPhone || "—"} mono />
                <SoftField label="Licensed Company" value={invoice.licensedCompany} />
              </div>
            </Card>
            <Card>
              <div className="p-6 space-y-4">
                <div className="flex items-center justify-between">
                  <div
                    className="text-[11px] uppercase tracking-[0.12em]"
                    style={{ color: tone.ink50 }}
                  >
                    Submission
                  </div>
                  {building.contactEmail && <Pill tone="accent">Email</Pill>}
                </div>
                <SoftField label="Contact Email" value={building.contactEmail || "Not configured"} mono />
                <SoftField
                  label="Region"
                  value={`${building.region}${building.isOutOfState ? " · Out of state" : ""}`}
                />
                <SoftField label="Management" value={building.managementCompany || "—"} />
              </div>
            </Card>
          </div>
        </div>

        {/* RIGHT: PDF preview */}
        <div>
          <div className="sticky top-24">
            <div className="flex items-center justify-between mb-3">
              <div
                className="text-[11px] uppercase tracking-[0.14em]"
                style={{ color: tone.ink50 }}
              >
                PDF Preview
              </div>
              <button
                onClick={handleDownloadPDF}
                className="h-7 px-2 rounded flex items-center gap-1 text-[11px]"
                style={{ color: tone.ink70 }}
              >
                <Icons.Download /> Download
              </button>
            </div>
            <div
              ref={previewRef}
              style={{ background: tone.paperDeep, padding: 16, borderRadius: 12 }}
            >
              <ScaledInvoiceDoc
                invoice={invoiceForDoc}
                building={building}
                settings={settingsForDoc(settings)}
                targetWidth={Math.max(320, previewWidth - 32)}
              />
            </div>
            <div
              className="mt-3 font-mono text-[10.5px] text-center"
              style={{ color: tone.ink50 }}
            >
              {invoice.fileName}.pdf · Letter · 1 page
            </div>
          </div>
        </div>
      </div>

      {showSend && (
        <SendDialog
          invoice={invoice}
          building={building}
          settings={settings}
          onClose={() => setShowSend(false)}
          onSent={() => {
            setShowSend(false);
            refreshInvoice();
          }}
        />
      )}
    </div>
  );
}
