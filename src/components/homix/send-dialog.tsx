"use client";

import React, { useState } from "react";
import { toast } from "sonner";
import { Btn, Icons } from "./primitives";
import { tone } from "./tokens";
import type { Building, Invoice } from "@/db/schema";
import { useLocale } from "@/lib/i18n-client";

const M = {
  en: {
    recipientRequired: "Please enter a recipient email",
    sent: "Invoice sent",
    failed: "Failed to send",
    compose: "Compose email",
    send: (number: string) => `Send ${number}`,
    close: "Close",
    from: "From",
    to: "To",
    cc: "Cc",
    replyTo: "Reply-To",
    subject: "Subject",
    preview: "Preview",
    onePage: "Letter · 1 page",
    specialRequirement: "Special requirement:",
    tracked: "Sent via Resend · tracked",
    cancel: "Cancel",
    sending: "Sending…",
    sendInvoice: "Send Invoice",
  },
  zh: {
    recipientRequired: "请输入收件人邮箱",
    sent: "发票已发送",
    failed: "发送失败",
    compose: "撰写邮件",
    send: (number: string) => `发送 ${number}`,
    close: "关闭",
    from: "发件人",
    to: "收件人",
    cc: "抄送",
    replyTo: "回复至",
    subject: "主题",
    preview: "预览",
    onePage: "Letter 纸 · 1 页",
    specialRequirement: "特别要求：",
    tracked: "通过 Resend 发送并追踪",
    cancel: "取消",
    sending: "发送中…",
    sendInvoice: "发送发票",
  },
} as const;

type Settings = Record<string, string>;

export function SendDialog({
  invoice,
  building,
  settings,
  onClose,
  onSent,
}: {
  invoice: Invoice;
  building: Building;
  settings: Settings;
  onClose: () => void;
  onSent: () => void;
}) {
  const locale = useLocale();
  const t = M[locale];
  const [emailTo, setEmailTo] = useState(building.contactEmail || "");
  const [emailCc, setEmailCc] = useState(settings.cc_email || "homix@homixny.com");
  const [emailReplyTo, setEmailReplyTo] = useState(invoice.agentEmail || "");
  const [emailSubject, setEmailSubject] = useState(
    invoice.emailSubject || invoice.invoiceNumber
  );
  const [sending, setSending] = useState(false);
  const fromEmail = settings.from_email || "invoice@homixny.com";

  const handleSend = async () => {
    if (!emailTo.trim()) {
      toast.error(t.recipientRequired);
      return;
    }
    setSending(true);
    try {
      const res = await fetch(`/api/invoices/${invoice.id}/send`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          to: emailTo,
          cc: emailCc,
          replyTo: emailReplyTo,
          subject: emailSubject,
        }),
      });

      // Parse response body defensively. Vercel can occasionally truncate
      // a serverless response (e.g. on slow Resend round-trips that hit the
      // function timeout window) — the email itself has already been sent
      // by Resend and the DB updated, but the JSON body never reaches the
      // client. Treat any 2xx as success regardless of body, and only show
      // a parse error when the HTTP status itself is non-OK.
      let data: { error?: string; success?: boolean } = {};
      const raw = await res.text().catch(() => "");
      if (raw) {
        try {
          data = JSON.parse(raw);
        } catch {
          // Non-JSON body, leave `data` empty and let res.ok decide.
        }
      }

      if (!res.ok) {
        throw new Error(data.error || `Send failed (HTTP ${res.status})`);
      }

      toast.success(t.sent);
      onSent();
    } catch (err) {
      const msg = locale === "en" && err instanceof Error ? err.message : t.failed;
      toast.error(msg);
    } finally {
      setSending(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-8"
      style={{ background: "rgba(26, 24, 20, 0.4)", backdropFilter: "blur(4px)" }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl rounded-2xl max-h-[90vh] overflow-hidden flex flex-col"
        style={{
          background: tone.card,
          border: `1px solid ${tone.line}`,
          boxShadow: "0 30px 80px -20px rgba(0,0,0,0.3)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between gap-4 px-5 py-4 sm:px-8 sm:py-6"
          style={{ borderBottom: `1px solid ${tone.line}` }}
        >
          <div>
            <div
              className="text-[11px] uppercase tracking-[0.14em]"
              style={{ color: tone.ink50 }}
            >
              {t.compose}
            </div>
            <div
              className="font-serif"
              style={{
                fontSize: 26,
                color: tone.ink,
                letterSpacing: "-0.01em",
                marginTop: 2,
              }}
            >
              {t.send(invoice.invoiceNumber)}
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full flex items-center justify-center"
            style={{ background: tone.paperDeep, color: tone.ink70 }}
            aria-label={t.close}
          >
            ×
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 space-y-5 overflow-auto px-5 py-5 sm:px-8 sm:py-6">
          {/* Email composer */}
          <div className="rounded-lg overflow-hidden" style={{ border: `1px solid ${tone.line}` }}>
            <FieldRow
              label={t.from}
              locked
              value={
                <span style={{ color: tone.ink70 }}>
                  Homix Invoice &lt;{fromEmail}&gt;
                </span>
              }
            />
            <FieldRow
              label={t.to}
              value={
                <input
                  value={emailTo}
                  onChange={(e) => setEmailTo(e.target.value)}
                  placeholder="recipient@example.com"
                  className="w-full bg-transparent outline-none text-[13px]"
                  style={{ color: tone.ink }}
                />
              }
            />
            <FieldRow
              label={t.cc}
              value={
                <input
                  value={emailCc}
                  onChange={(e) => setEmailCc(e.target.value)}
                  className="w-full bg-transparent outline-none text-[13px]"
                  style={{ color: tone.ink }}
                />
              }
            />
            <FieldRow
              label={t.replyTo}
              value={
                <input
                  value={emailReplyTo}
                  onChange={(e) => setEmailReplyTo(e.target.value)}
                  placeholder="agent@homixny.com"
                  className="w-full bg-transparent outline-none text-[13px]"
                  style={{ color: tone.ink }}
                />
              }
            />
            <FieldRow
              last
              label={t.subject}
              value={
                <input
                  value={emailSubject}
                  onChange={(e) => setEmailSubject(e.target.value)}
                  className="w-full bg-transparent outline-none text-[13px] font-medium"
                  style={{ color: tone.ink }}
                />
              }
            />
          </div>

          {/* Body preview */}
          <div
            className="rounded-lg p-5 text-[13px] leading-relaxed space-y-3"
            style={{
              background: tone.paper,
              border: `1px solid ${tone.lineSoft}`,
              color: tone.ink70,
            }}
          >
            <p>Dear Property Management,</p>
            <p>Please find the attached OP Invoice for:</p>
            <ul className="pl-4 space-y-1" style={{ listStyle: "disc" }}>
              <li>
                Building: <span style={{ color: tone.ink }}>{building.name}</span>
              </li>
              <li>
                Unit: <span style={{ color: tone.ink }}>{invoice.unit}</span>
              </li>
              <li>
                Tenant: <span style={{ color: tone.ink }}>{invoice.tenantName}</span>
              </li>
            </ul>
            <p>Let us know if you need anything else.</p>
            <p style={{ color: tone.ink }}>— {settings.company_name || "Homix Living"}</p>
          </div>

          {/* Attachment card */}
          <button
            type="button"
            onClick={() => window.open(`/api/invoices/${invoice.id}/pdf`, "_blank")}
            className="flex items-center gap-3 px-4 py-3 rounded-lg w-full text-left hover:bg-[#FAF7F0] transition-colors"
            style={{ border: `1px dashed ${tone.line}` }}
          >
            <div
              className="w-10 h-12 rounded flex items-center justify-center text-[10px] font-mono"
              style={{ background: tone.ink, color: tone.paper }}
            >
              PDF
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-[13px] truncate" style={{ color: tone.ink }}>
                {invoice.fileName}.pdf
              </div>
              <div className="text-[11px] font-mono" style={{ color: tone.ink50 }}>
                {t.onePage}
              </div>
            </div>
            <span className="text-[12px]" style={{ color: tone.accent }}>
              {t.preview}
            </span>
          </button>

          {building.specialNotes && (
            <div
              className="rounded-lg p-4 text-[12.5px]"
              style={{ background: tone.roseSoft, color: tone.rose }}
            >
              <strong>{t.specialRequirement} </strong>
              {building.specialNotes}
            </div>
          )}
        </div>

        {/* Footer */}
        <div
          className="flex flex-col items-stretch gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-8 sm:py-5"
          style={{ borderTop: `1px solid ${tone.line}`, background: tone.paper }}
        >
          <div className="text-[11.5px]" style={{ color: tone.ink50 }}>
            {t.tracked}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Btn variant="outline" onClick={onClose}>
              {t.cancel}
            </Btn>
            <Btn
              variant="primary"
              icon={<Icons.Send />}
              onClick={handleSend}
              disabled={sending || !emailTo.trim()}
            >
              {sending ? t.sending : t.sendInvoice}
            </Btn>
          </div>
        </div>
      </div>
    </div>
  );
}

function FieldRow({
  label,
  value,
  last,
  locked,
}: {
  label: string;
  value: React.ReactNode;
  last?: boolean;
  locked?: boolean;
}) {
  return (
    <div
      className="flex items-center px-4 py-3"
      style={{
        borderBottom: last ? "none" : `1px solid ${tone.lineSoft}`,
        background: locked ? tone.paper : tone.card,
      }}
    >
      <div
        className="w-20 text-[11px] uppercase tracking-[0.1em]"
        style={{ color: tone.ink50 }}
      >
        {label}
      </div>
      <div className="min-w-0 flex-1">{value}</div>
    </div>
  );
}
