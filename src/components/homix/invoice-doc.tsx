"use client";

import React from "react";
import { fmtMoney, fmtDate, fmtLongDate } from "./tokens";
import type { Building, LineItem } from "@/db/schema";

type InvoiceLike = {
  invoiceNumber: string;
  unit: string;
  tenantName: string;
  agentName?: string | null;
  agentEmail?: string | null;
  agentPhone?: string | null;
  apartmentAddress?: string | null;
  moveInDate?: string | null;
  licensedCompany?: string | null;
  lineItems: LineItem[];
  totalAmount: number;
  createdAt?: string | null;
  fileName?: string;
};

type InvoiceSettings = {
  companyName?: string;
  companyAddress?: string;
  fromEmail?: string;
  payableTo?: string;
  taxId?: string;
  mailCheckAddress?: string;
  achBankName?: string;
  achRoutingNumber?: string;
  achAccountNumber?: string;
  achAccountName?: string;
  wireAccountName?: string;
  wireBankName?: string;
  wireRoutingNumber?: string;
  wireAccountNumber?: string;
  wireBankAddress?: string;
  wireSwiftCode?: string;
};

/**
 * Beautiful editorial invoice document.
 * Rendered at base 816 x 1056 (8.5" x 11" @ 96dpi). Scales via `scale` prop.
 * Used both in-app as preview and (via @react-pdf) for PDF generation.
 */
export function InvoiceDoc({
  invoice,
  building,
  settings,
  scale = 1,
  shadow = true,
}: {
  invoice: InvoiceLike;
  building: Building | null;
  settings: InvoiceSettings;
  scale?: number;
  shadow?: boolean;
}) {
  const lineItems = invoice.lineItems || [];
  const total = invoice.totalAmount;
  const issueDate = invoice.createdAt || new Date().toISOString();
  const dueDays = 30;
  const dueDate = new Date(new Date(issueDate).getTime() + dueDays * 86400000).toISOString();
  const hasCheck = settings.payableTo || settings.taxId || settings.mailCheckAddress;
  const hasACH =
    settings.achAccountName ||
    settings.achBankName ||
    settings.achRoutingNumber ||
    settings.achAccountNumber;
  const hasWire =
    settings.wireAccountName ||
    settings.wireBankName ||
    settings.wireRoutingNumber ||
    settings.wireAccountNumber ||
    settings.wireBankAddress ||
    settings.wireSwiftCode;
  const paymentColumnCount = [hasCheck, hasACH, hasWire].filter(Boolean).length || 1;

  const page: React.CSSProperties = {
    width: 816,
    height: 1056,
    padding: "56px 64px",
    background: "#FBF9F4",
    color: "#1A1814",
    fontFamily: "var(--font-geist-sans), 'Helvetica Neue', Arial, sans-serif",
    fontSize: 11,
    position: "relative",
    transform: `scale(${scale})`,
    transformOrigin: "top left",
    boxShadow: shadow
      ? "0 30px 60px -20px rgba(26, 24, 20, 0.18), 0 6px 20px -8px rgba(26, 24, 20, 0.12)"
      : "none",
  };
  const serif: React.CSSProperties = {
    fontFamily: "var(--font-instrument-serif), 'Times New Roman', serif",
    letterSpacing: "-0.01em",
  };
  const mono: React.CSSProperties = {
    fontFamily: "var(--font-geist-mono), 'SF Mono', Menlo, monospace",
  };
  const label: React.CSSProperties = {
    fontSize: 9,
    letterSpacing: "0.14em",
    textTransform: "uppercase",
    color: "#7A756C",
    fontWeight: 500,
  };
  const labelLine: React.CSSProperties = {
    ...label,
    display: "flex",
    alignItems: "center",
    gap: 8,
  };

  return (
    <div style={page}>
      {/* Olive corner stripe */}
      <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 6, background: "#5C6B3A" }} />

      {/* HEADER */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 48 }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <svg width={36} height={36} viewBox="0 0 40 40">
              <rect x="1" y="1" width="38" height="38" rx="8" fill="#1A1814" />
              <path d="M11 27V13h3v5.5h6V13h3v14h-3v-6h-6v6h-3z" fill="#FBF9F4" />
              <circle cx="30" cy="13.5" r="1.8" fill="#5C6B3A" />
            </svg>
            <div>
              <div style={{ ...serif, fontSize: 24, lineHeight: 1, color: "#1A1814" }}>
                {settings.companyName || "Homix Living"}
              </div>
              <div style={{ ...label, marginTop: 4 }}>Licensed Real Estate Broker · NY</div>
            </div>
          </div>
          <div style={{ ...mono, fontSize: 10, marginTop: 16, color: "#4A4640", lineHeight: 1.55, maxWidth: 260, whiteSpace: "pre-line" }}>
            {settings.companyAddress || "5 West 37th Street, Floor 2\nNew York, NY 10018"}
            {"\n"}
            {settings.fromEmail || "invoice@homixny.com"}
          </div>
        </div>

        <div style={{ textAlign: "right" }}>
          <div style={{ ...serif, fontSize: 54, lineHeight: 0.9, color: "#1A1814" }}>Invoice</div>
          <div style={{ ...mono, fontSize: 11, marginTop: 10, color: "#1A1814", letterSpacing: "0.02em" }}>
            № {invoice.invoiceNumber}
          </div>
          <div style={{ ...mono, fontSize: 9.5, marginTop: 4, color: "#7A756C" }}>
            Issued {fmtLongDate(issueDate)}
          </div>
        </div>
      </div>

      {/* KEY DATES BAND */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr 1fr 1.3fr",
          gap: 0,
          padding: "16px 0",
          borderTop: "1px solid #E4DED2",
          borderBottom: "1px solid #E4DED2",
          marginBottom: 36,
        }}
      >
        <div style={{ paddingRight: 16, borderRight: "1px solid #EDE8DD" }}>
          <div style={label}>Issue Date</div>
          <div style={{ ...mono, fontSize: 12, marginTop: 6, color: "#1A1814" }}>{fmtDate(issueDate)}</div>
        </div>
        <div style={{ padding: "0 16px", borderRight: "1px solid #EDE8DD" }}>
          <div style={label}>Due Date</div>
          <div style={{ ...mono, fontSize: 12, marginTop: 6, color: "#1A1814" }}>{fmtDate(dueDate)}</div>
        </div>
        <div style={{ padding: "0 16px", borderRight: "1px solid #EDE8DD" }}>
          <div style={label}>Terms</div>
          <div style={{ ...mono, fontSize: 12, marginTop: 6, color: "#1A1814" }}>Net {dueDays}</div>
        </div>
        <div style={{ paddingLeft: 16 }}>
          <div style={label}>Amount Due</div>
          <div style={{ ...serif, fontSize: 22, marginTop: 2, color: "#1A1814", lineHeight: 1.1 }}>
            <span style={{ fontSize: 13, color: "#7A756C", marginRight: 4 }}>USD</span>${fmtMoney(total)}
          </div>
        </div>
      </div>

      {/* BILL TO / TENANT */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 48, marginBottom: 40 }}>
        <div>
          <div style={labelLine}>
            <span>Billed To</span>
            <span style={{ flex: 1, height: 1, background: "#E4DED2" }} />
          </div>
          <div style={{ ...serif, fontSize: 19, marginTop: 10, color: "#1A1814", lineHeight: 1.2 }}>
            {building?.billToCompany || building?.name || "—"}
          </div>
          <div style={{ fontSize: 10.5, color: "#4A4640", marginTop: 6, lineHeight: 1.55 }}>
            {building?.billToAddress || invoice.apartmentAddress || ""}
          </div>
          {building?.managementCompany && (
            <div style={{ ...mono, fontSize: 9.5, color: "#7A756C", marginTop: 8 }}>
              c/o {building.managementCompany}
            </div>
          )}
        </div>
        <div>
          <div style={labelLine}>
            <span>For Tenant</span>
            <span style={{ flex: 1, height: 1, background: "#E4DED2" }} />
          </div>
          <div style={{ ...serif, fontSize: 19, marginTop: 10, color: "#1A1814", lineHeight: 1.2 }}>
            {invoice.tenantName}
          </div>
          <div style={{ fontSize: 10.5, color: "#4A4640", marginTop: 6, lineHeight: 1.55 }}>
            Unit {invoice.unit} · {building?.name || ""}
            <br />
            {invoice.moveInDate && `Move-in ${fmtLongDate(invoice.moveInDate)}`}
          </div>
          {invoice.agentName && (
            <div style={{ ...mono, fontSize: 9.5, color: "#7A756C", marginTop: 8 }}>
              Agent · {invoice.agentName}
              {invoice.agentPhone ? ` · ${invoice.agentPhone}` : ""}
            </div>
          )}
        </div>
      </div>

      {/* LINE ITEMS */}
      <div style={{ marginBottom: 40 }}>
        <div style={labelLine}>
          <span>Services</span>
          <span style={{ flex: 1, height: 1, background: "#E4DED2" }} />
        </div>
        <table style={{ width: "100%", borderCollapse: "collapse", marginTop: 14 }}>
          <thead>
            <tr>
              <th style={{ ...label, textAlign: "left", fontWeight: 500, padding: "0 0 10px 0", width: "60%" }}>Description</th>
              <th style={{ ...label, textAlign: "right", fontWeight: 500, padding: "0 0 10px 0", width: "10%" }}>Qty</th>
              <th style={{ ...label, textAlign: "right", fontWeight: 500, padding: "0 0 10px 0", width: "15%" }}>Rate</th>
              <th style={{ ...label, textAlign: "right", fontWeight: 500, padding: "0 0 10px 0", width: "15%" }}>Amount</th>
            </tr>
          </thead>
          <tbody>
            {lineItems.map((item, i) => (
              <tr key={i} style={{ borderTop: "1px solid #EDE8DD" }}>
                <td style={{ padding: "16px 12px 16px 0", fontSize: 12, color: "#1A1814", verticalAlign: "top" }}>
                  {item.description}
                  {invoice.apartmentAddress && (
                    <div style={{ ...mono, fontSize: 9.5, color: "#7A756C", marginTop: 3 }}>
                      {invoice.apartmentAddress}
                    </div>
                  )}
                </td>
                <td style={{ ...mono, padding: "16px 0", fontSize: 11, textAlign: "right", color: "#4A4640", verticalAlign: "top" }}>
                  {Number(item.quantity).toFixed(2)}
                </td>
                <td style={{ ...mono, padding: "16px 0", fontSize: 11, textAlign: "right", color: "#4A4640", verticalAlign: "top" }}>
                  ${fmtMoney(item.unitPrice)}
                </td>
                <td style={{ ...mono, padding: "16px 0", fontSize: 11, textAlign: "right", color: "#1A1814", verticalAlign: "top", fontWeight: 500 }}>
                  ${fmtMoney(item.amount)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* Totals */}
        <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 24 }}>
          <div style={{ width: 280 }}>
            <div style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", fontSize: 11, color: "#4A4640" }}>
              <span>Subtotal</span>
              <span style={mono}>${fmtMoney(total)}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", fontSize: 11, color: "#4A4640" }}>
              <span>Tax</span>
              <span style={mono}>$0.00</span>
            </div>
            <div style={{ height: 1, background: "#1A1814", margin: "10px 0" }} />
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", padding: "4px 0" }}>
              <span style={{ ...label, color: "#1A1814" }}>Total Due</span>
              <span style={{ ...serif, fontSize: 26, color: "#1A1814", lineHeight: 1 }}>
                <span style={{ fontSize: 12, color: "#7A756C", marginRight: 4, ...mono }}>USD</span>${fmtMoney(total)}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* PAYMENT METHODS */}
      <div
        style={{
          marginTop: 40,
          padding: "24px 28px",
          background: "#F3F0E7",
          borderRadius: 8,
          border: "1px solid #E4DED2",
        }}
      >
        <div style={labelLine}>
          <span>Payment Methods</span>
          <span style={{ flex: 1, height: 1, background: "#D9D3C5" }} />
        </div>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: `repeat(${paymentColumnCount}, 1fr)`,
            gap: 24,
            marginTop: 16,
          }}
        >
          {/* Check */}
          {hasCheck && (
            <div>
              <div style={{ ...serif, fontSize: 15, color: "#1A1814" }}>By Check</div>
              <div style={{ ...mono, fontSize: 10, color: "#4A4640", marginTop: 10, lineHeight: 1.7 }}>
                {settings.payableTo && (
                  <div>
                    <span style={{ color: "#7A756C" }}>Payable to</span>&nbsp;&nbsp;{settings.payableTo}
                  </div>
                )}
                {settings.taxId && (
                  <div>
                    <span style={{ color: "#7A756C" }}>Tax ID</span>&nbsp;&nbsp;{settings.taxId}
                  </div>
                )}
                {settings.mailCheckAddress && (
                  <>
                    <div style={{ marginTop: 8, color: "#7A756C" }}>Mail to</div>
                    <div style={{ whiteSpace: "pre-line" }}>{settings.mailCheckAddress}</div>
                  </>
                )}
              </div>
            </div>
          )}
          {/* ACH */}
          {hasACH && (
            <div>
              <div style={{ ...serif, fontSize: 15, color: "#1A1814" }}>By ACH</div>
              <div style={{ ...mono, fontSize: 10, color: "#4A4640", marginTop: 10, lineHeight: 1.7 }}>
                {settings.achAccountName && (
                  <div>
                    <span style={{ color: "#7A756C" }}>Account</span>&nbsp;&nbsp;{settings.achAccountName}
                  </div>
                )}
                {settings.achBankName && (
                  <div>
                    <span style={{ color: "#7A756C" }}>Bank</span>&nbsp;&nbsp;{settings.achBankName}
                  </div>
                )}
                {settings.achRoutingNumber && (
                  <div>
                    <span style={{ color: "#7A756C" }}>Routing</span>&nbsp;&nbsp;{settings.achRoutingNumber}
                  </div>
                )}
                {settings.achAccountNumber && (
                  <div>
                    <span style={{ color: "#7A756C" }}>Account №</span>&nbsp;&nbsp;{settings.achAccountNumber}
                  </div>
                )}
              </div>
            </div>
          )}
          {/* Wire */}
          {hasWire && (
            <div>
              <div style={{ ...serif, fontSize: 15, color: "#1A1814" }}>By Wire</div>
              <div style={{ ...mono, fontSize: 10, color: "#4A4640", marginTop: 10, lineHeight: 1.7 }}>
                {settings.wireAccountName && (
                  <div>
                    <span style={{ color: "#7A756C" }}>Account</span>&nbsp;&nbsp;{settings.wireAccountName}
                  </div>
                )}
                {settings.wireBankName && (
                  <div>
                    <span style={{ color: "#7A756C" }}>Bank</span>&nbsp;&nbsp;{settings.wireBankName}
                  </div>
                )}
                {settings.wireRoutingNumber && (
                  <div>
                    <span style={{ color: "#7A756C" }}>Routing</span>&nbsp;&nbsp;{settings.wireRoutingNumber}
                  </div>
                )}
                {settings.wireAccountNumber && (
                  <div>
                    <span style={{ color: "#7A756C" }}>Account №</span>&nbsp;&nbsp;{settings.wireAccountNumber}
                  </div>
                )}
                {settings.wireSwiftCode && (
                  <div>
                    <span style={{ color: "#7A756C" }}>SWIFT</span>&nbsp;&nbsp;{settings.wireSwiftCode}
                  </div>
                )}
                {settings.wireBankAddress && (
                  <>
                    <div style={{ marginTop: 8, color: "#7A756C" }}>Bank address</div>
                    <div style={{ whiteSpace: "pre-line" }}>{settings.wireBankAddress}</div>
                  </>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* FOOTER */}
      <div style={{ position: "absolute", left: 64, right: 64, bottom: 40 }}>
        <div style={{ height: 1, background: "#E4DED2", marginBottom: 16 }} />
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            fontSize: 10,
            color: "#7A756C",
          }}
        >
          <div style={{ ...serif, fontSize: 13, color: "#1A1814" }}>Thank you for your business.</div>
          <div style={mono}>{invoice.invoiceNumber} · Page 1 of 1</div>
        </div>
      </div>
    </div>
  );
}

/**
 * Wrapper that scales InvoiceDoc to fit a container width.
 */
export function ScaledInvoiceDoc({
  invoice,
  building,
  settings,
  targetWidth,
  shadow = true,
}: {
  invoice: InvoiceLike;
  building: Building | null;
  settings: InvoiceSettings;
  targetWidth: number;
  shadow?: boolean;
}) {
  const baseWidth = 816;
  const scale = targetWidth / baseWidth;
  return (
    <div style={{ width: targetWidth, height: 1056 * scale, position: "relative" }}>
      <InvoiceDoc invoice={invoice} building={building} settings={settings} scale={scale} shadow={shadow} />
    </div>
  );
}
