"use client";

import React, { useState } from "react";
import { toast } from "sonner";
import { Btn, Icons } from "./primitives";
import { tone } from "./tokens";
import type { Building, Invoice } from "@/db/schema";

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
      toast.error("Please enter a recipient email");
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

      toast.success("Invoice sent");
      onSent();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to send";
      toast.error(msg);
    } finally {
      setSending(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-8"
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
          className="px-8 py-6 flex items-center justify-between"
          style={{ borderBottom: `1px solid ${tone.line}` }}
        >
          <div>
            <div
              className="text-[11px] uppercase tracking-[0.14em]"
              style={{ color: tone.ink50 }}
            >
              Compose email
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
              Send {invoice.invoiceNumber}
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full flex items-center justify-center"
            style={{ background: tone.paperDeep, color: tone.ink70 }}
            aria-label="Close"
          >
            ×
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-auto px-8 py-6 space-y-5">
          {/* Email composer */}
          <div className="rounded-lg overflow-hidden" style={{ border: `1px solid ${tone.line}` }}>
            <FieldRow
              label="From"
              locked
              value={
                <span style={{ color: tone.ink70 }}>
                  Homix Invoice &lt;{fromEmail}&gt;
                </span>
              }
            />
            <FieldRow
              label="To"
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
              label="Cc"
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
              label="Reply-To"
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
              label="Subject"
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
                Letter · 1 page
              </div>
            </div>
            <span className="text-[12px]" style={{ color: tone.accent }}>
              Preview
            </span>
          </button>

          {building.specialNotes && (
            <div
              className="rounded-lg p-4 text-[12.5px]"
              style={{ background: tone.roseSoft, color: tone.rose }}
            >
              <strong>Special requirement: </strong>
              {building.specialNotes}
            </div>
          )}
        </div>

        {/* Footer */}
        <div
          className="px-8 py-5 flex items-center justify-between"
          style={{ borderTop: `1px solid ${tone.line}`, background: tone.paper }}
        >
          <div className="text-[11.5px]" style={{ color: tone.ink50 }}>
            Sent via Resend · tracked
          </div>
          <div className="flex items-center gap-2">
            <Btn variant="outline" onClick={onClose}>
              Cancel
            </Btn>
            <Btn
              variant="primary"
              icon={<Icons.Send />}
              onClick={handleSend}
              disabled={sending || !emailTo.trim()}
            >
              {sending ? "Sending…" : "Send Invoice"}
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
      <div className="flex-1">{value}</div>
    </div>
  );
}
