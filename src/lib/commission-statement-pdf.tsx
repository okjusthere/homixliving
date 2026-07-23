// Commission settlement statement (Commission Report) for closed sale deals.
// Generated from the recorded deal when the numbers are on file; when they
// aren't, agents upload the office template from /resources instead.
import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
  renderToBuffer,
  Font,
} from "@react-pdf/renderer";

const COLORS = {
  paper: "#FBF9F4",
  ink: "#1A1814",
  ink70: "#4A4640",
  ink50: "#7A756C",
  line: "#E4DED2",
  lineSoft: "#EDE8DD",
  accent: "#5C6B3A",
  paperDeep: "#EFEAE1",
};

// Agent/party names are frequently Chinese; @react-pdf's built-in fonts have
// no CJK glyphs, so we embed the same OFL Noto Sans SC subset the marketing
// site uses for share cards (as base64 — bundlers always carry it, unlike
// loose file assets). Registered lazily once per process.
import { NOTO_SANS_SC_WOFF_BASE64 } from "@/assets/fonts/noto-sans-sc-base64";

let cjkRegistered = false;
async function ensureCjkFont() {
  if (cjkRegistered) return;
  Font.register({
    family: "NotoSansSC",
    src: `data:font/woff;base64,${NOTO_SANS_SC_WOFF_BASE64}`,
  });
  cjkRegistered = true;
}

Font.registerHyphenationCallback((word) => [word]);

const styles = StyleSheet.create({
  page: {
    padding: "42px 54px 64px",
    backgroundColor: COLORS.paper,
    color: COLORS.ink,
    fontFamily: "NotoSansSC",
    fontSize: 10,
  },
  topStripe: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: 6,
    backgroundColor: COLORS.accent,
  },
  brand: { fontSize: 18, fontFamily: "Times-Roman" },
  docTitle: { fontSize: 26, fontFamily: "Times-Roman", marginTop: 2 },
  metaLabel: {
    fontSize: 7.5,
    color: COLORS.ink50,
    textTransform: "uppercase",
    letterSpacing: 1.2,
    marginBottom: 3,
  },
  value: { fontSize: 10, color: COLORS.ink },
  section: {
    marginTop: 18,
    paddingTop: 10,
    borderTop: `1px solid ${COLORS.line}`,
  },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 4,
  },
  rowLine: { borderBottom: `1px solid ${COLORS.lineSoft}` },
  cellLabel: { color: COLORS.ink70, fontSize: 9.5 },
  cellValue: { fontSize: 9.5 },
  totalBox: {
    marginTop: 10,
    padding: 12,
    backgroundColor: COLORS.paperDeep,
    borderRadius: 4,
  },
  footer: {
    position: "absolute",
    bottom: 28,
    left: 54,
    right: 54,
    borderTop: `1px solid ${COLORS.line}`,
    paddingTop: 8,
    flexDirection: "row",
    justifyContent: "space-between",
    fontSize: 7.5,
    color: COLORS.ink50,
  },
});

function money(n: number): string {
  return `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

const REP_LABEL: Record<string, string> = {
  buyer_rep: "Buyer Representation",
  seller_rep: "Seller Representation",
  dual_agency: "Dual Agency",
  referral: "Referral",
};

export type CommissionStatementProps = {
  companyName: string;
  companyAddress?: string | null;
  generatedAt: string; // YYYY-MM-DD
  deal: {
    id: number;
    propertyAddress: string;
    city?: string | null;
    state?: string | null;
    zip?: string | null;
    mlsNumber?: string | null;
    fileId?: string | null;
    representationType: string;
    buyerNames?: string | null;
    sellerNames?: string | null;
    contractDate?: string | null;
    closingDate?: string | null;
    purchasePrice?: number | null;
    listingBrokerage?: string | null;
    cooperatingBrokerage?: string | null;
    grossCommission: number;
    referralAmount?: number | null;
    brokerageFee?: number | null;
  };
  agents: {
    name: string;
    licenseNumber?: string | null;
    sharePct: number;
    splitPct: number;
    agentTake: number;
    companyPool: number;
  }[];
  commissionBase: number;
};

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ marginBottom: 8, marginRight: 18 }}>
      <Text style={styles.metaLabel}>{label}</Text>
      <Text style={styles.value}>{value || "—"}</Text>
    </View>
  );
}

function CommissionStatement(props: CommissionStatementProps) {
  const { deal, agents, commissionBase } = props;
  const address = [
    deal.propertyAddress,
    [deal.city, deal.state, deal.zip].filter(Boolean).join(", "),
  ]
    .filter(Boolean)
    .join(" · ");
  const agentTakeTotal = agents.reduce((s, a) => s + a.agentTake, 0);
  const companyTotal = agents.reduce((s, a) => s + a.companyPool, 0);

  return (
    <Document>
      <Page size="LETTER" style={styles.page}>
        <View style={styles.topStripe} fixed />

        <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
          <View>
            <Text style={styles.brand}>{props.companyName}</Text>
            {props.companyAddress ? (
              <Text style={{ fontSize: 8.5, color: COLORS.ink50, marginTop: 3 }}>
                {props.companyAddress}
              </Text>
            ) : null}
          </View>
          <View style={{ alignItems: "flex-end" }}>
            <Text style={styles.docTitle}>Commission Report</Text>
            <Text style={{ fontSize: 8.5, color: COLORS.ink50, marginTop: 2 }}>
              Sale #{deal.id} · Generated {props.generatedAt}
            </Text>
          </View>
        </View>

        <View style={[styles.section, { flexDirection: "row", flexWrap: "wrap" }]}>
          <Meta label="Property" value={address} />
          <Meta label="MLS #" value={deal.mlsNumber || ""} />
          <Meta label="File ID" value={deal.fileId || ""} />
          <Meta
            label="Representation"
            value={REP_LABEL[deal.representationType] || deal.representationType}
          />
        </View>

        <View style={{ flexDirection: "row", flexWrap: "wrap" }}>
          <Meta label="Buyer(s)" value={deal.buyerNames || ""} />
          <Meta label="Seller(s)" value={deal.sellerNames || ""} />
          <Meta label="Contract Date" value={deal.contractDate || ""} />
          <Meta label="Closing Date" value={deal.closingDate || ""} />
          <Meta
            label="Purchase Price"
            value={deal.purchasePrice ? money(deal.purchasePrice) : ""}
          />
        </View>

        <View style={{ flexDirection: "row", flexWrap: "wrap" }}>
          <Meta label="Listing Brokerage" value={deal.listingBrokerage || ""} />
          <Meta label="Cooperating Brokerage" value={deal.cooperatingBrokerage || ""} />
        </View>

        <View style={styles.section}>
          <Text style={styles.metaLabel}>Commission Summary</Text>
          <View style={[styles.row, styles.rowLine]}>
            <Text style={styles.cellLabel}>Gross Commission</Text>
            <Text style={styles.cellValue}>{money(deal.grossCommission)}</Text>
          </View>
          <View style={[styles.row, styles.rowLine]}>
            <Text style={styles.cellLabel}>Less: Referral Fee</Text>
            <Text style={styles.cellValue}>−{money(deal.referralAmount || 0)}</Text>
          </View>
          <View style={[styles.row, styles.rowLine]}>
            <Text style={styles.cellLabel}>Less: Brokerage Fee</Text>
            <Text style={styles.cellValue}>−{money(deal.brokerageFee || 0)}</Text>
          </View>
          <View style={styles.row}>
            <Text style={[styles.cellLabel, { fontSize: 10.5 }]}>Net Commission (Split Base)</Text>
            <Text style={[styles.cellValue, { fontSize: 10.5 }]}>{money(commissionBase)}</Text>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.metaLabel}>Agent Distribution</Text>
          <View style={[styles.row, styles.rowLine]}>
            <Text style={[styles.cellLabel, { flex: 2.2 }]}>Agent</Text>
            <Text style={[styles.cellLabel, { flex: 1, textAlign: "right" }]}>Share</Text>
            <Text style={[styles.cellLabel, { flex: 1, textAlign: "right" }]}>Split</Text>
            <Text style={[styles.cellLabel, { flex: 1.4, textAlign: "right" }]}>Agent Take</Text>
            <Text style={[styles.cellLabel, { flex: 1.4, textAlign: "right" }]}>Company</Text>
          </View>
          {agents.map((agent, index) => (
            <View key={index} style={[styles.row, styles.rowLine]}>
              <View style={{ flex: 2.2 }}>
                <Text style={styles.cellValue}>{agent.name}</Text>
                {agent.licenseNumber ? (
                  <Text style={{ fontSize: 7.5, color: COLORS.ink50 }}>
                    Lic. {agent.licenseNumber}
                  </Text>
                ) : null}
              </View>
              <Text style={[styles.cellValue, { flex: 1, textAlign: "right" }]}>
                {agent.sharePct}%
              </Text>
              <Text style={[styles.cellValue, { flex: 1, textAlign: "right" }]}>
                {agent.splitPct}%
              </Text>
              <Text style={[styles.cellValue, { flex: 1.4, textAlign: "right" }]}>
                {money(agent.agentTake)}
              </Text>
              <Text style={[styles.cellValue, { flex: 1.4, textAlign: "right" }]}>
                {money(agent.companyPool)}
              </Text>
            </View>
          ))}
          <View style={styles.totalBox}>
            <View style={styles.row}>
              <Text style={[styles.cellLabel, { fontSize: 10.5 }]}>Total Agent Take</Text>
              <Text style={[styles.cellValue, { fontSize: 11 }]}>{money(agentTakeTotal)}</Text>
            </View>
            <View style={[styles.row, { paddingBottom: 0 }]}>
              <Text style={[styles.cellLabel, { fontSize: 10.5 }]}>Total Company Pool</Text>
              <Text style={[styles.cellValue, { fontSize: 11 }]}>{money(companyTotal)}</Text>
            </View>
          </View>
        </View>

        <View style={styles.footer} fixed>
          <Text>{props.companyName} · Commission Report</Text>
          <Text>Generated from recorded deal data · {props.generatedAt}</Text>
        </View>
      </Page>
    </Document>
  );
}

export async function generateCommissionStatementPDF(
  props: CommissionStatementProps,
): Promise<Buffer> {
  await ensureCjkFont();
  const buffer = await renderToBuffer(<CommissionStatement {...props} />);
  return Buffer.from(buffer);
}
