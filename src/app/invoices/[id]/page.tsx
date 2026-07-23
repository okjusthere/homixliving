"use client";

import { useEffect, useState, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import { useSession } from "next-auth/react";
import { Pill, Btn, Card, SoftField, Icons } from "@/components/homix/primitives";
import { PageHeader, CardHeader } from "@/components/homix/page-kit";
import { tone, fmtMoney, fmtDate } from "@/components/homix/tokens";
import { ScaledInvoiceDoc } from "@/components/homix/invoice-doc";
import { SendDialog } from "@/components/homix/send-dialog";
import type { Building, Invoice, InvoiceSendLog, LineItem } from "@/db/schema";
import { invoiceSettingsForDocument } from "@/lib/invoice-settings";
import { useLocale } from "@/lib/i18n-client";

const M = {
  en: {
    backToInvoices: "Back to invoices",
    downloadPDF: "Download PDF",
    delete: "Delete",
    markUnpaid: "Mark unpaid",
    markPaid: "Mark paid",
    resend: "Resend",
    sendInvoice: "Send Invoice",
    paid: "Paid",
    awaitingPayment: "Awaiting payment",
    failed: "Failed",
    draft: "Draft",
    paidLabel: "Paid",
    sentLabel: "Sent",
    at: "at",
    specialRequirement: "Special requirement: ",
    totalDue: "Total Due",
    issued: "Issued",
    companyReceivedPayment: "Company received payment",
    awaitingBuildingPayment: "Awaiting building payment",
    sendFailed: "Send failed",
    draftNotSent: "Draft not sent",
    billedTo: "Billed To",
    tenantAndUnit: "Tenant & Unit",
    unit: "Unit",
    moveIn: "Move-in",
    lineItems: "Line items",
    total: "Total",
    agent: "Agent",
    name: "Name",
    email: "Email",
    phone: "Phone",
    licensedCompany: "Licensed Company",
    submission: "Submission",
    emailPill: "Email",
    contactEmail: "Contact Email",
    notConfigured: "Not configured",
    region: "Region",
    outOfState: "Out of state",
    management: "Management",
    pdfPreview: "PDF Preview",
    sendHistory: "Send history",
    sentTo: "To",
    historyOk: "Sent",
    historyFailed: "Failed",
    download: "Download",
    letterOnePage: "Letter · 1 page",
    loading: "Loading…",
    invoiceNotFound: "Invoice not found",
    deleteConfirm: "Delete this invoice? This cannot be undone.",
    invoiceDeleted: "Invoice deleted",
    markedAsPaid: "Marked as paid",
    couldNotMarkPaid: "Could not mark as paid",
    unmarkConfirm: "Mark this invoice as unpaid again?",
    revertedToSent: "Reverted to sent",
    couldNotRevert: "Could not revert",
  },
  zh: {
    backToInvoices: "返回发票",
    downloadPDF: "下载 PDF",
    delete: "删除",
    markUnpaid: "标为未付款",
    markPaid: "标为已付款",
    resend: "重新发送",
    sendInvoice: "发送发票",
    paid: "已付款",
    awaitingPayment: "待付款",
    failed: "失败",
    draft: "草稿",
    paidLabel: "已付款",
    sentLabel: "已发送",
    at: "于",
    specialRequirement: "特殊要求：",
    totalDue: "应付合计",
    issued: "开具于",
    companyReceivedPayment: "公司已收到付款",
    awaitingBuildingPayment: "等待楼盘付款",
    sendFailed: "发送失败",
    draftNotSent: "草稿未发送",
    billedTo: "账单抬头",
    tenantAndUnit: "租客与单元",
    unit: "单元",
    moveIn: "入住",
    lineItems: "费用明细",
    total: "合计",
    agent: "经纪人",
    name: "姓名",
    email: "邮箱",
    phone: "电话",
    licensedCompany: "持牌公司",
    submission: "提交方式",
    emailPill: "邮箱",
    contactEmail: "联系邮箱",
    notConfigured: "未配置",
    region: "区域",
    outOfState: "州外",
    management: "管理公司",
    pdfPreview: "PDF 预览",
    sendHistory: "发送历史",
    sentTo: "收件",
    historyOk: "已发送",
    historyFailed: "失败",
    download: "下载",
    letterOnePage: "Letter · 1 页",
    loading: "加载中…",
    invoiceNotFound: "未找到发票",
    deleteConfirm: "删除此发票？此操作无法撤销。",
    invoiceDeleted: "发票已删除",
    markedAsPaid: "已标为已付款",
    couldNotMarkPaid: "无法标记为已付款",
    unmarkConfirm: "将此发票重新标记为未付款？",
    revertedToSent: "已恢复为已发送",
    couldNotRevert: "无法恢复",
  },
} as const;

type Settings = Record<string, string>;

export default function InvoiceDetailPage() {
  const params = useParams();
  const router = useRouter();
  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [building, setBuilding] = useState<Building | null>(null);
  const [sendLog, setSendLog] = useState<InvoiceSendLog[]>([]);
  const [settings, setSettings] = useState<Settings>({});
  const [loading, setLoading] = useState(true);
  const [showSend, setShowSend] = useState(false);
  const { data: session } = useSession();
  const isAdmin = Boolean(session?.user.isAdmin);
  const t = M[useLocale()];

  const previewRef = useRef<HTMLDivElement>(null);
  const [previewWidth, setPreviewWidth] = useState(520);

  useEffect(() => {
    Promise.all([
      fetch(`/api/invoices/${params.id}`).then((r) => r.json()),
      fetch("/api/settings").then((r) => r.json()),
    ]).then(([invoiceData, settingsData]) => {
      setInvoice(invoiceData.invoice);
      setBuilding(invoiceData.building);
      setSendLog(invoiceData.sendLog ?? []);
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
    if (!confirm(t.deleteConfirm)) return;
    await fetch(`/api/invoices/${params.id}`, { method: "DELETE" });
    toast.success(t.invoiceDeleted);
    router.push("/invoices");
  };

  const refreshInvoice = async () => {
    const updated = await fetch(`/api/invoices/${params.id}`).then((r) => r.json());
    setInvoice(updated.invoice);
    setBuilding(updated.building);
    setSendLog(updated.sendLog ?? []);
  };

  const handleMarkPaid = async () => {
    try {
      const res = await fetch(`/api/invoices/${params.id}/mark-paid`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      if (!res.ok) throw new Error();
      toast.success(t.markedAsPaid);
      await refreshInvoice();
    } catch {
      toast.error(t.couldNotMarkPaid);
    }
  };

  const handleUnmarkPaid = async () => {
    if (!confirm(t.unmarkConfirm)) return;
    try {
      const res = await fetch(`/api/invoices/${params.id}/mark-paid`, { method: "DELETE" });
      if (!res.ok) throw new Error();
      toast.success(t.revertedToSent);
      await refreshInvoice();
    } catch {
      toast.error(t.couldNotRevert);
    }
  };

  if (loading) {
    return (
      <div className="py-24 text-center text-[13px]" style={{ color: tone.ink50 }}>
        {t.loading}
      </div>
    );
  }
  if (!invoice || !building) {
    return (
      <div className="py-24 text-center">
        <div className="font-serif text-2xl" style={{ color: tone.ink }}>
          {t.invoiceNotFound}
        </div>
        <Link href="/invoices" className="mt-4 inline-block text-[13px] underline" style={{ color: tone.accent }}>
          {t.backToInvoices}
        </Link>
      </div>
    );
  }

  const lineItems: LineItem[] =
    typeof invoice.lineItems === "string"
      ? JSON.parse(invoice.lineItems)
      : invoice.lineItems || [];

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
    <div className="space-y-7">
      {/* Header */}
      <div className="space-y-4">
        <Link
          href="/invoices"
          className="inline-flex items-center gap-1.5 text-[12.5px]"
          style={{ color: tone.ink50 }}
        >
          <Icons.Back /> {t.backToInvoices}
        </Link>
        <PageHeader
          eyebrow={`${building.name} · Unit ${invoice.unit} · ${invoice.tenantName}`}
          title={invoice.invoiceNumber}
          actions={
            <>
              <Btn variant="outline" icon={<Icons.Download />} onClick={handleDownloadPDF}>
                {t.downloadPDF}
              </Btn>
              <Btn variant="danger" icon={<Icons.Trash />} onClick={handleDelete}>
                {t.delete}
              </Btn>
              {isAdmin && invoice.status === "paid" ? (
                <Btn variant="outline" onClick={handleUnmarkPaid}>
                  {t.markUnpaid}
                </Btn>
              ) : isAdmin && invoice.status === "sent" ? (
                <Btn variant="primary" icon={<Icons.Check />} onClick={handleMarkPaid}>
                  {t.markPaid}
                </Btn>
              ) : null}
              <Btn variant="primary" icon={<Icons.Send />} onClick={() => setShowSend(true)}>
                {invoice.status === "sent" || invoice.status === "paid" ? t.resend : t.sendInvoice}
              </Btn>
            </>
          }
        />
        <div className="flex items-center gap-3">
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
              ? t.paid
              : invoice.status === "sent"
              ? t.awaitingPayment
              : invoice.status === "failed"
              ? t.failed
              : t.draft}
          </Pill>
          {invoice.status === "paid" && invoice.paidAt && (
            <span className="text-[12px]" style={{ color: tone.green }}>
              {t.paidLabel} {fmtDate(invoice.paidAt)}
              {invoice.paidAmount !== invoice.totalAmount && invoice.paidAmount !== null && (
                <> · ${fmtMoney(Number(invoice.paidAmount))}</>
              )}
            </span>
          )}
          {invoice.status === "sent" && invoice.sentAt && (
            <span className="text-[12px]" style={{ color: tone.ink50 }}>
              {t.sentLabel} {fmtDate(invoice.sentAt)} {t.at}{" "}
              {new Date(invoice.sentAt).toLocaleTimeString("en-US", {
                hour: "numeric",
                minute: "2-digit",
              })}
            </span>
          )}
        </div>
      </div>

      {/* Special notes alert */}
      {building.specialNotes && (
        <div
          className="rounded-lg p-4 text-[13px]"
          style={{ background: tone.roseSoft, color: tone.rose, border: `1px solid ${tone.rose}20` }}
        >
          <strong>{t.specialRequirement}</strong>
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
                {t.totalDue}
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
                  {t.issued} <span className="font-mono">{fmtDate(invoice.createdAt)}</span>
                </span>
                <span>
                  {invoice.status === "paid"
                    ? t.companyReceivedPayment
                    : invoice.status === "sent"
                    ? t.awaitingBuildingPayment
                    : invoice.status === "failed"
                    ? t.sendFailed
                    : t.draftNotSent}
                </span>
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
                  {t.billedTo}
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
                  {t.tenantAndUnit}
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
                  {invoice.apartmentAddress || `${t.unit} ${invoice.unit} · ${building.name}`}
                </div>
                {invoice.moveInDate && (
                  <div
                    className="mt-3 font-mono text-[11.5px]"
                    style={{ color: tone.ink50 }}
                  >
                    {t.moveIn} {fmtDate(invoice.moveInDate)}
                  </div>
                )}
              </div>
            </Card>
          </div>

          {/* Line items */}
          <Card>
            <CardHeader title={t.lineItems} />
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
                {t.total}
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
                  {t.agent}
                </div>
                <SoftField label={t.name} value={invoice.agentName || "—"} />
                <SoftField label={t.email} value={invoice.agentEmail || "—"} mono />
                <SoftField label={t.phone} value={invoice.agentPhone || "—"} mono />
                <SoftField label={t.licensedCompany} value={invoice.licensedCompany} />
              </div>
            </Card>
            <Card>
              <div className="p-6 space-y-4">
                <div className="flex items-center justify-between">
                  <div
                    className="text-[11px] uppercase tracking-[0.12em]"
                    style={{ color: tone.ink50 }}
                  >
                    {t.submission}
                  </div>
                  {building.contactEmail && <Pill tone="accent">{t.emailPill}</Pill>}
                </div>
                <SoftField label={t.contactEmail} value={building.contactEmail || t.notConfigured} mono />
                <SoftField
                  label={t.region}
                  value={`${building.region}${building.isOutOfState ? ` · ${t.outOfState}` : ""}`}
                />
                <SoftField label={t.management} value={building.managementCompany || "—"} />
              </div>
            </Card>
          </div>

          {/* Send history — every attempt, including failures a later resend
              overwrote in invoices.status */}
          {sendLog.length > 0 && (
            <Card>
              <CardHeader title={t.sendHistory} />
              <div className="px-6 py-2">
                {sendLog.map((entry, index) => (
                  <div
                    key={entry.id}
                    className="py-3 flex items-start justify-between gap-4"
                    style={{
                      borderBottom:
                        index < sendLog.length - 1 ? `1px solid ${tone.lineSoft}` : "none",
                    }}
                  >
                    <div className="min-w-0">
                      <div className="text-[13px]" style={{ color: tone.ink }}>
                        {t.sentTo} <span className="font-mono text-[12.5px]">{entry.toRecipients}</span>
                        {entry.ccRecipients && (
                          <span className="ml-2 text-[12px]" style={{ color: tone.ink50 }}>
                            CC: <span className="font-mono">{entry.ccRecipients}</span>
                          </span>
                        )}
                      </div>
                      <div className="mt-0.5 text-[12px]" style={{ color: tone.ink50 }}>
                        {/* Full ISO through fmtDate keeps date and time in the
                            SAME (local) zone — slicing to the UTC day made
                            evening sends show tomorrow's date. */}
                        {fmtDate(entry.sentAt)}{" "}
                        {entry.sentAt
                          ? new Date(entry.sentAt).toLocaleTimeString("en-US", {
                              hour: "numeric",
                              minute: "2-digit",
                            })
                          : ""}
                        {entry.sentByEmail ? ` · ${entry.sentByEmail}` : ""}
                      </div>
                      {entry.status === "failed" && entry.errorMessage && (
                        <div className="mt-1 text-[12px]" style={{ color: tone.rose }}>
                          {entry.errorMessage}
                        </div>
                      )}
                    </div>
                    <Pill tone={entry.status === "sent" ? "sent" : "failed"}>
                      {entry.status === "sent" ? t.historyOk : t.historyFailed}
                    </Pill>
                  </div>
                ))}
              </div>
            </Card>
          )}
        </div>

        {/* RIGHT: PDF preview */}
        <div>
          <div className="sticky top-24">
            <div className="flex items-center justify-between mb-3">
              <div
                className="text-[11px] uppercase tracking-[0.14em]"
                style={{ color: tone.ink50 }}
              >
                {t.pdfPreview}
              </div>
              <button
                onClick={handleDownloadPDF}
                className="h-7 px-2 rounded flex items-center gap-1 text-[11px]"
                style={{ color: tone.ink70 }}
              >
                <Icons.Download /> {t.download}
              </button>
            </div>
            <div
              ref={previewRef}
              style={{ background: tone.paperDeep, padding: 16, borderRadius: 12 }}
            >
              <ScaledInvoiceDoc
                invoice={invoiceForDoc}
                building={building}
                settings={invoiceSettingsForDocument(settings)}
                targetWidth={Math.max(320, previewWidth - 32)}
              />
            </div>
            <div
              className="mt-3 font-mono text-[10.5px] text-center"
              style={{ color: tone.ink50 }}
            >
              {invoice.fileName}.pdf · {t.letterOnePage}
            </div>
          </div>
        </div>
      </div>

      {showSend && (
        <SendDialog
          invoice={invoice}
          building={building}
          settings={settings}
          onClose={() => {
            setShowSend(false);
            // A FAILED send also wrote invoices.status + a send-log row, but
            // the dialog only fires onSent on success — refresh on close so
            // the failed attempt shows up without a manual reload.
            refreshInvoice();
          }}
          onSent={() => {
            setShowSend(false);
            refreshInvoice();
          }}
        />
      )}
    </div>
  );
}
