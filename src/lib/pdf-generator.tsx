import React from "react";
import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
  renderToBuffer,
  Font,
  Svg,
  Rect,
  Path,
  Circle,
} from "@react-pdf/renderer";
import type { LineItem, Building } from "@/db/schema";

// Register fonts. For reliability, we use Helvetica (built-in) as body/mono
// and Inter Display (or Times) as a serif stand-in for Instrument Serif.
// Disable font hyphenation so long invoice numbers don't get broken.
Font.registerHyphenationCallback((word) => [word]);

// ---------- Styles ----------
const COLORS = {
  paper: "#FBF9F4",
  ink: "#1A1814",
  ink70: "#4A4640",
  ink50: "#7A756C",
  ink30: "#B5AFA4",
  line: "#E4DED2",
  lineSoft: "#EDE8DD",
  accent: "#5C6B3A",
  paperDeep: "#F3F0E7",
  paperDeeper: "#D9D3C5",
};

const styles = StyleSheet.create({
  page: {
    padding: "42px 54px",
    backgroundColor: COLORS.paper,
    color: COLORS.ink,
    fontFamily: "Helvetica",
    fontSize: 11,
    position: "relative",
  },
  // Top olive stripe
  topStripe: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: 6,
    backgroundColor: COLORS.accent,
  },
  // Header
  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 28,
  },
  brandRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  brandName: {
    fontFamily: "Times-Roman",
    fontSize: 24,
    lineHeight: 1,
    color: COLORS.ink,
  },
  label: {
    fontSize: 9,
    letterSpacing: 1.3,
    textTransform: "uppercase",
    color: COLORS.ink50,
    fontWeight: 500,
  },
  brandTag: {
    fontSize: 9,
    letterSpacing: 1.3,
    textTransform: "uppercase",
    color: COLORS.ink50,
    marginTop: 4,
  },
  companyInfo: {
    fontFamily: "Courier",
    fontSize: 10,
    marginTop: 16,
    color: COLORS.ink70,
    lineHeight: 1.55,
    maxWidth: 260,
  },
  invoiceTitleBlock: {
    textAlign: "right",
  },
  invoiceTitle: {
    fontFamily: "Times-Roman",
    fontSize: 46,
    lineHeight: 0.9,
    color: COLORS.ink,
  },
  invoiceNumber: {
    fontFamily: "Courier",
    fontSize: 11,
    marginTop: 10,
    color: COLORS.ink,
    letterSpacing: 0.2,
  },
  invoiceIssued: {
    fontFamily: "Courier",
    fontSize: 9.5,
    marginTop: 4,
    color: COLORS.ink50,
  },
  // Key dates band
  datesBand: {
    flexDirection: "row",
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: COLORS.line,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.line,
    marginBottom: 24,
  },
  datesCell: {
    flex: 1,
    paddingHorizontal: 16,
    borderRightWidth: 1,
    borderRightColor: COLORS.lineSoft,
  },
  datesCellLast: {
    flex: 1.3,
    paddingLeft: 16,
  },
  datesCellFirst: {
    flex: 1,
    paddingRight: 16,
    borderRightWidth: 1,
    borderRightColor: COLORS.lineSoft,
  },
  dateValue: {
    fontFamily: "Courier",
    fontSize: 12,
    marginTop: 6,
    color: COLORS.ink,
  },
  amountBig: {
    fontFamily: "Times-Roman",
    fontSize: 22,
    marginTop: 2,
    color: COLORS.ink,
    lineHeight: 1.1,
  },
  amountCurrency: {
    fontSize: 13,
    color: COLORS.ink50,
    marginRight: 4,
  },
  // Bill to / Tenant
  twoCol: {
    flexDirection: "row",
    gap: 36,
    marginBottom: 28,
  },
  col: {
    flex: 1,
  },
  sectionLabel: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  sectionLabelText: {
    fontSize: 9,
    letterSpacing: 1.3,
    textTransform: "uppercase",
    color: COLORS.ink50,
    fontWeight: 500,
  },
  sectionLine: {
    flex: 1,
    height: 1,
    backgroundColor: COLORS.line,
    marginLeft: 8,
  },
  partyName: {
    fontFamily: "Times-Roman",
    fontSize: 18,
    marginTop: 8,
    color: COLORS.ink,
    lineHeight: 1.2,
  },
  partyAddress: {
    fontSize: 10,
    color: COLORS.ink70,
    marginTop: 6,
    lineHeight: 1.55,
  },
  partyMeta: {
    fontFamily: "Courier",
    fontSize: 9,
    color: COLORS.ink50,
    marginTop: 8,
  },
  // Line items
  itemsSection: {
    marginBottom: 24,
  },
  itemsTable: {
    marginTop: 10,
  },
  itemsHeader: {
    flexDirection: "row",
    paddingBottom: 8,
  },
  itemsHeaderCell: {
    fontSize: 9,
    letterSpacing: 1.3,
    textTransform: "uppercase",
    color: COLORS.ink50,
    fontWeight: 500,
  },
  itemRow: {
    flexDirection: "row",
    borderTopWidth: 1,
    borderTopColor: COLORS.lineSoft,
    paddingVertical: 10,
  },
  itemDescCol: {
    width: "60%",
    paddingRight: 12,
  },
  itemQtyCol: {
    width: "10%",
    textAlign: "right",
  },
  itemRateCol: {
    width: "15%",
    textAlign: "right",
  },
  itemAmountCol: {
    width: "15%",
    textAlign: "right",
  },
  itemDesc: {
    fontSize: 11,
    color: COLORS.ink,
  },
  itemSubDesc: {
    fontFamily: "Courier",
    fontSize: 8.5,
    color: COLORS.ink50,
    marginTop: 3,
  },
  itemNumber: {
    fontFamily: "Courier",
    fontSize: 10,
    color: COLORS.ink70,
  },
  itemAmount: {
    fontFamily: "Courier",
    fontSize: 10,
    color: COLORS.ink,
    fontWeight: 500,
  },
  // Totals
  totalsWrap: {
    flexDirection: "row",
    justifyContent: "flex-end",
    marginTop: 10,
  },
  totalsBox: {
    width: 250,
  },
  totalsRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 4,
  },
  totalsLabel: {
    fontSize: 11,
    color: COLORS.ink70,
  },
  totalsValue: {
    fontFamily: "Courier",
    fontSize: 11,
    color: COLORS.ink70,
  },
  totalsDivider: {
    height: 1,
    backgroundColor: COLORS.ink,
    marginVertical: 10,
  },
  totalDueRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "baseline",
    paddingVertical: 4,
  },
  totalDueLabel: {
    fontSize: 9,
    letterSpacing: 1.3,
    textTransform: "uppercase",
    color: COLORS.ink,
    fontWeight: 500,
  },
  totalDueValue: {
    fontFamily: "Times-Roman",
    fontSize: 22,
    color: COLORS.ink,
    lineHeight: 1,
  },
  totalDueCurrency: {
    fontFamily: "Courier",
    fontSize: 12,
    color: COLORS.ink50,
    marginRight: 4,
  },
  // Payment methods
  paymentBox: {
    marginTop: 18,
    padding: "14px 16px",
    backgroundColor: COLORS.paperDeep,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: COLORS.line,
  },
  paymentGrid: {
    flexDirection: "row",
    gap: 18,
    marginTop: 10,
  },
  paymentCol: {
    flex: 1,
  },
  paymentTitle: {
    fontFamily: "Times-Roman",
    fontSize: 13,
    color: COLORS.ink,
  },
  paymentBody: {
    fontFamily: "Courier",
    fontSize: 8.5,
    color: COLORS.ink70,
    marginTop: 6,
    lineHeight: 1.35,
  },
  paymentRow: {
    flexDirection: "row",
    marginBottom: 2,
  },
  paymentLabel: {
    color: COLORS.ink50,
    width: 58,
  },
  paymentValue: {
    flex: 1,
    color: COLORS.ink70,
  },
  // Footer
  footer: {
    position: "absolute",
    left: 54,
    right: 54,
    bottom: 24,
  },
  footerDivider: {
    height: 1,
    backgroundColor: COLORS.line,
    marginBottom: 10,
  },
  footerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  footerThanks: {
    fontFamily: "Times-Roman",
    fontSize: 13,
    color: COLORS.ink,
  },
  footerPage: {
    fontFamily: "Courier",
    fontSize: 10,
    color: COLORS.ink50,
  },
});

function fmtMoney(n: number): string {
  return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function fmtDateShort(s: string): string {
  const d = new Date(s);
  if (isNaN(d.getTime())) return s;
  return `${String(d.getMonth() + 1).padStart(2, "0")}/${String(d.getDate()).padStart(2, "0")}/${d.getFullYear()}`;
}
function fmtDateLong(s: string): string {
  const d = new Date(s);
  if (isNaN(d.getTime())) return s;
  return d.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
}

type InvoicePDFProps = {
  invoiceNumber: string;
  date: string;
  building: Building;
  unit: string;
  tenantName: string;
  licensedCompany: string;
  agentName?: string;
  agentPhone?: string;
  agentEmail?: string;
  apartmentAddress?: string;
  moveInDate?: string;
  lineItems: LineItem[];
  totalAmount: number;
  notes?: string;
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

// Homix logo SVG for PDF
function HomixLogo() {
  return (
    <Svg width={36} height={36} viewBox="0 0 40 40">
      <Rect x={1} y={1} width={38} height={38} rx={8} fill={COLORS.ink} />
      <Path d="M11 27V13h3v5.5h6V13h3v14h-3v-6h-6v6h-3z" fill={COLORS.paper} />
      <Circle cx={30} cy={13.5} r={1.8} fill={COLORS.accent} />
    </Svg>
  );
}

function InvoicePDF(props: InvoicePDFProps) {
  const {
    invoiceNumber,
    date,
    building,
    unit,
    tenantName,
    agentName,
    agentPhone,
    apartmentAddress,
    moveInDate,
    lineItems,
    totalAmount,
    companyName = "Homix Living",
    companyAddress = "5 West 37th Street, Floor 2\nNew York, NY 10018",
    fromEmail = "invoice@homixny.com",
    payableTo,
    taxId,
    mailCheckAddress,
    achBankName,
    achRoutingNumber,
    achAccountNumber,
    achAccountName,
    wireAccountName,
    wireBankName,
    wireRoutingNumber,
    wireAccountNumber,
    wireBankAddress,
    wireSwiftCode,
  } = props;

  const issueDate = date || new Date().toISOString();

  const hasCheck = payableTo || mailCheckAddress;
  const hasACH = achAccountName || achBankName || achRoutingNumber || achAccountNumber;
  const hasWire =
    wireAccountName || wireBankName || wireRoutingNumber || wireAccountNumber || wireBankAddress || wireSwiftCode;

  return (
    <Document>
      <Page size="LETTER" style={styles.page}>
        <View style={styles.topStripe} fixed />

        {/* Header */}
        <View style={styles.headerRow}>
          <View>
            <View style={styles.brandRow}>
              <HomixLogo />
              <View style={{ marginLeft: 12 }}>
                <Text style={styles.brandName}>{companyName}</Text>
                <Text style={styles.brandTag}>Licensed Real Estate Broker · NY</Text>
              </View>
            </View>
            <Text style={styles.companyInfo}>
              {companyAddress}
              {"\n"}
              {fromEmail}
            </Text>
          </View>
          <View style={styles.invoiceTitleBlock}>
            <Text style={styles.invoiceTitle}>Invoice</Text>
            <Text style={styles.invoiceNumber}>№ {invoiceNumber}</Text>
            <Text style={styles.invoiceIssued}>Issued {fmtDateLong(issueDate)}</Text>
          </View>
        </View>

        {/* Key Dates */}
        <View style={styles.datesBand}>
          <View style={styles.datesCellFirst}>
            <Text style={styles.label}>Issue Date</Text>
            <Text style={styles.dateValue}>{fmtDateShort(issueDate)}</Text>
          </View>
          <View style={styles.datesCellLast}>
            <Text style={styles.label}>Amount Due</Text>
            <Text style={styles.amountBig}>
              <Text style={styles.amountCurrency}>USD </Text>${fmtMoney(totalAmount)}
            </Text>
          </View>
        </View>

        {/* Bill To / Tenant */}
        <View style={styles.twoCol}>
          <View style={styles.col}>
            <View style={styles.sectionLabel}>
              <Text style={styles.sectionLabelText}>Billed To</Text>
              <View style={styles.sectionLine} />
            </View>
            <Text style={styles.partyName}>{building.billToCompany || building.name}</Text>
            <Text style={styles.partyAddress}>
              {building.billToAddress || apartmentAddress || ""}
            </Text>
            {building.managementCompany && (
              <Text style={styles.partyMeta}>c/o {building.managementCompany}</Text>
            )}
          </View>
          <View style={styles.col}>
            <View style={styles.sectionLabel}>
              <Text style={styles.sectionLabelText}>For Tenant</Text>
              <View style={styles.sectionLine} />
            </View>
            <Text style={styles.partyName}>{tenantName}</Text>
            <Text style={styles.partyAddress}>
              Unit {unit} · {building.name}
              {moveInDate ? `\nMove-in ${fmtDateLong(moveInDate)}` : ""}
            </Text>
            {agentName && (
              <Text style={styles.partyMeta}>
                Agent · {agentName}
                {agentPhone ? ` · ${agentPhone}` : ""}
              </Text>
            )}
          </View>
        </View>

        {/* Line items */}
        <View style={styles.itemsSection}>
          <View style={styles.sectionLabel}>
            <Text style={styles.sectionLabelText}>Services</Text>
            <View style={styles.sectionLine} />
          </View>
          <View style={styles.itemsTable}>
            <View style={styles.itemsHeader}>
              <Text style={[styles.itemsHeaderCell, styles.itemDescCol, { textAlign: "left" }]}>
                Description
              </Text>
              <Text style={[styles.itemsHeaderCell, styles.itemQtyCol]}>Qty</Text>
              <Text style={[styles.itemsHeaderCell, styles.itemRateCol]}>Rate</Text>
              <Text style={[styles.itemsHeaderCell, styles.itemAmountCol]}>Amount</Text>
            </View>
            {lineItems.map((item, i) => (
              <View key={i} style={styles.itemRow}>
                <View style={styles.itemDescCol}>
                  <Text style={styles.itemDesc}>{item.description}</Text>
                  {apartmentAddress && (
                    <Text style={styles.itemSubDesc}>{apartmentAddress}</Text>
                  )}
                </View>
                <Text style={[styles.itemNumber, styles.itemQtyCol]}>
                  {Number(item.quantity).toFixed(2)}
                </Text>
                <Text style={[styles.itemNumber, styles.itemRateCol]}>
                  ${fmtMoney(item.unitPrice)}
                </Text>
                <Text style={[styles.itemAmount, styles.itemAmountCol]}>
                  ${fmtMoney(item.amount)}
                </Text>
              </View>
            ))}
          </View>

          {/* Totals */}
          <View style={styles.totalsWrap}>
            <View style={styles.totalsBox}>
              <View style={styles.totalsRow}>
                <Text style={styles.totalsLabel}>Subtotal</Text>
                <Text style={styles.totalsValue}>${fmtMoney(totalAmount)}</Text>
              </View>
              <View style={styles.totalsRow}>
                <Text style={styles.totalsLabel}>Tax</Text>
                <Text style={styles.totalsValue}>$0.00</Text>
              </View>
              <View style={styles.totalsDivider} />
              <View style={styles.totalDueRow}>
                <Text style={styles.totalDueLabel}>Total Due</Text>
                <Text style={styles.totalDueValue}>
                  <Text style={styles.totalDueCurrency}>USD </Text>${fmtMoney(totalAmount)}
                </Text>
              </View>
            </View>
          </View>
        </View>

        {/* Payment Methods */}
        {(hasCheck || hasACH || hasWire) && (
          <View style={styles.paymentBox}>
            <View style={styles.sectionLabel}>
              <Text style={styles.sectionLabelText}>Payment Methods</Text>
              <View style={[styles.sectionLine, { backgroundColor: COLORS.paperDeeper }]} />
            </View>
            <View style={styles.paymentGrid}>
              {hasCheck && (
                <View style={styles.paymentCol}>
                  <Text style={styles.paymentTitle}>By Check</Text>
                  <View style={styles.paymentBody}>
                    {payableTo && (
                      <View style={styles.paymentRow}>
                        <Text style={styles.paymentLabel}>Payable to</Text>
                        <Text style={styles.paymentValue}>{payableTo}</Text>
                      </View>
                    )}
                    {taxId && (
                      <View style={styles.paymentRow}>
                        <Text style={styles.paymentLabel}>Tax ID</Text>
                        <Text style={styles.paymentValue}>{taxId}</Text>
                      </View>
                    )}
                    {mailCheckAddress && (
                      <>
                        <Text style={[styles.paymentLabel, { marginTop: 8 }]}>Mail to</Text>
                        <Text style={styles.paymentValue}>{mailCheckAddress}</Text>
                      </>
                    )}
                  </View>
                </View>
              )}
              {hasACH && (
                <View style={styles.paymentCol}>
                  <Text style={styles.paymentTitle}>By ACH</Text>
                  <View style={styles.paymentBody}>
                    {achAccountName && (
                      <View style={styles.paymentRow}>
                        <Text style={styles.paymentLabel}>Account</Text>
                        <Text style={styles.paymentValue}>{achAccountName}</Text>
                      </View>
                    )}
                    {achBankName && (
                      <View style={styles.paymentRow}>
                        <Text style={styles.paymentLabel}>Bank</Text>
                        <Text style={styles.paymentValue}>{achBankName}</Text>
                      </View>
                    )}
                    {achRoutingNumber && (
                      <View style={styles.paymentRow}>
                        <Text style={styles.paymentLabel}>Routing</Text>
                        <Text style={styles.paymentValue}>{achRoutingNumber}</Text>
                      </View>
                    )}
                    {achAccountNumber && (
                      <View style={styles.paymentRow}>
                        <Text style={styles.paymentLabel}>Account №</Text>
                        <Text style={styles.paymentValue}>{achAccountNumber}</Text>
                      </View>
                    )}
                  </View>
                </View>
              )}
              {hasWire && (
                <View style={styles.paymentCol}>
                  <Text style={styles.paymentTitle}>By Wire</Text>
                  <View style={styles.paymentBody}>
                    {wireAccountName && (
                      <View style={styles.paymentRow}>
                        <Text style={styles.paymentLabel}>Account</Text>
                        <Text style={styles.paymentValue}>{wireAccountName}</Text>
                      </View>
                    )}
                    {wireBankName && (
                      <View style={styles.paymentRow}>
                        <Text style={styles.paymentLabel}>Bank</Text>
                        <Text style={styles.paymentValue}>{wireBankName}</Text>
                      </View>
                    )}
                    {wireRoutingNumber && (
                      <View style={styles.paymentRow}>
                        <Text style={styles.paymentLabel}>Routing</Text>
                        <Text style={styles.paymentValue}>{wireRoutingNumber}</Text>
                      </View>
                    )}
                    {wireAccountNumber && (
                      <View style={styles.paymentRow}>
                        <Text style={styles.paymentLabel}>Account №</Text>
                        <Text style={styles.paymentValue}>{wireAccountNumber}</Text>
                      </View>
                    )}
                    {wireSwiftCode && (
                      <View style={styles.paymentRow}>
                        <Text style={styles.paymentLabel}>SWIFT</Text>
                        <Text style={styles.paymentValue}>{wireSwiftCode}</Text>
                      </View>
                    )}
                    {wireBankAddress && (
                      <>
                        <Text style={[styles.paymentLabel, { marginTop: 8 }]}>Bank address</Text>
                        <Text style={styles.paymentValue}>{wireBankAddress}</Text>
                      </>
                    )}
                  </View>
                </View>
              )}
            </View>
          </View>
        )}

        {/* Footer */}
        <View style={styles.footer} fixed>
          <View style={styles.footerDivider} />
          <View style={styles.footerRow}>
            <Text style={styles.footerThanks}>Thank you for your business.</Text>
            <Text style={styles.footerPage}>{invoiceNumber} · Page 1 of 1</Text>
          </View>
        </View>
      </Page>
    </Document>
  );
}

export async function generateInvoicePDF(props: InvoicePDFProps): Promise<Buffer> {
  const buffer = await renderToBuffer(<InvoicePDF {...props} />);
  return Buffer.from(buffer);
}

export { InvoicePDF };
