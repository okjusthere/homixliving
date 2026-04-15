import React from "react";
import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
  renderToBuffer,
  Font,
} from "@react-pdf/renderer";
import type { LineItem, Building } from "@/db/schema";

const styles = StyleSheet.create({
  page: {
    padding: 40,
    fontSize: 10,
    fontFamily: "Helvetica",
  },
  header: {
    marginBottom: 30,
    borderBottom: "2px solid #1a1a2e",
    paddingBottom: 15,
  },
  companyName: {
    fontSize: 22,
    fontWeight: "bold",
    color: "#1a1a2e",
    fontFamily: "Helvetica-Bold",
  },
  companyInfo: {
    fontSize: 9,
    color: "#666",
    marginTop: 4,
  },
  invoiceTitle: {
    fontSize: 18,
    fontWeight: "bold",
    color: "#1a1a2e",
    textAlign: "right",
    fontFamily: "Helvetica-Bold",
  },
  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
  },
  infoSection: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 25,
  },
  infoBlock: {
    width: "48%",
  },
  infoLabel: {
    fontSize: 8,
    color: "#888",
    textTransform: "uppercase",
    marginBottom: 3,
    fontFamily: "Helvetica-Bold",
  },
  infoValue: {
    fontSize: 10,
    marginBottom: 2,
  },
  table: {
    marginTop: 10,
    marginBottom: 20,
  },
  tableHeader: {
    flexDirection: "row",
    backgroundColor: "#1a1a2e",
    padding: 8,
    color: "white",
    fontSize: 9,
    fontFamily: "Helvetica-Bold",
  },
  tableRow: {
    flexDirection: "row",
    padding: 8,
    borderBottom: "1px solid #eee",
    fontSize: 10,
  },
  tableRowAlt: {
    backgroundColor: "#f8f9fa",
  },
  colDescription: { width: "50%" },
  colQty: { width: "15%", textAlign: "center" },
  colPrice: { width: "15%", textAlign: "right" },
  colAmount: { width: "20%", textAlign: "right" },
  totalSection: {
    flexDirection: "row",
    justifyContent: "flex-end",
    marginTop: 10,
  },
  totalBox: {
    width: "35%",
    backgroundColor: "#1a1a2e",
    padding: 12,
    color: "white",
    flexDirection: "row",
    justifyContent: "space-between",
  },
  totalLabel: {
    fontSize: 12,
    fontFamily: "Helvetica-Bold",
  },
  totalAmount: {
    fontSize: 14,
    fontFamily: "Helvetica-Bold",
  },
  notes: {
    marginTop: 30,
    padding: 12,
    backgroundColor: "#f8f9fa",
    borderRadius: 4,
  },
  notesLabel: {
    fontSize: 9,
    fontFamily: "Helvetica-Bold",
    color: "#888",
    marginBottom: 4,
  },
  footer: {
    position: "absolute",
    bottom: 30,
    left: 40,
    right: 40,
    textAlign: "center",
    fontSize: 8,
    color: "#888",
    borderTop: "1px solid #eee",
    paddingTop: 10,
  },
});

type InvoicePDFProps = {
  invoiceNumber: string;
  date: string;
  building: Building;
  unit: string;
  tenantName: string;
  licensedCompany: string;
  lineItems: LineItem[];
  totalAmount: number;
  notes?: string;
  companyName?: string;
  companyAddress?: string;
};

function InvoicePDF({
  invoiceNumber,
  date,
  building,
  unit,
  tenantName,
  licensedCompany,
  lineItems,
  totalAmount,
  notes,
  companyName = "Homix Living",
  companyAddress = "",
}: InvoicePDFProps) {
  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <View style={styles.header}>
          <View style={styles.headerRow}>
            <View>
              <Text style={styles.companyName}>{companyName}</Text>
              {companyAddress && (
                <Text style={styles.companyInfo}>{companyAddress}</Text>
              )}
            </View>
            <Text style={styles.invoiceTitle}>INVOICE</Text>
          </View>
        </View>

        <View style={styles.infoSection}>
          <View style={styles.infoBlock}>
            <Text style={styles.infoLabel}>Bill To</Text>
            <Text style={styles.infoValue}>
              {building.billToCompany || building.name}
            </Text>
            {building.billToAddress && (
              <Text style={styles.infoValue}>{building.billToAddress}</Text>
            )}
          </View>
          <View style={styles.infoBlock}>
            <Text style={styles.infoLabel}>Invoice Number</Text>
            <Text style={styles.infoValue}>{invoiceNumber}</Text>
            <Text style={[styles.infoLabel, { marginTop: 8 }]}>Date</Text>
            <Text style={styles.infoValue}>{date}</Text>
            <Text style={[styles.infoLabel, { marginTop: 8 }]}>
              Licensed Company
            </Text>
            <Text style={styles.infoValue}>{licensedCompany}</Text>
          </View>
        </View>

        <View style={styles.infoSection}>
          <View style={styles.infoBlock}>
            <Text style={styles.infoLabel}>Tenant</Text>
            <Text style={styles.infoValue}>{tenantName}</Text>
            <Text style={[styles.infoLabel, { marginTop: 8 }]}>Unit</Text>
            <Text style={styles.infoValue}>{unit}</Text>
          </View>
          <View style={styles.infoBlock}>
            <Text style={styles.infoLabel}>Building</Text>
            <Text style={styles.infoValue}>{building.name}</Text>
            <Text style={[styles.infoLabel, { marginTop: 8 }]}>Region</Text>
            <Text style={styles.infoValue}>{building.region}</Text>
          </View>
        </View>

        <View style={styles.table}>
          <View style={styles.tableHeader}>
            <Text style={styles.colDescription}>Description</Text>
            <Text style={styles.colQty}>Qty</Text>
            <Text style={styles.colPrice}>Unit Price</Text>
            <Text style={styles.colAmount}>Amount</Text>
          </View>
          {lineItems.map((item, index) => (
            <View
              key={index}
              style={[
                styles.tableRow,
                index % 2 === 1 ? styles.tableRowAlt : {},
              ]}
            >
              <Text style={styles.colDescription}>{item.description}</Text>
              <Text style={styles.colQty}>{item.quantity}</Text>
              <Text style={styles.colPrice}>
                ${item.unitPrice.toFixed(2)}
              </Text>
              <Text style={styles.colAmount}>${item.amount.toFixed(2)}</Text>
            </View>
          ))}
        </View>

        <View style={styles.totalSection}>
          <View style={styles.totalBox}>
            <Text style={styles.totalLabel}>Total</Text>
            <Text style={styles.totalAmount}>
              ${totalAmount.toFixed(2)}
            </Text>
          </View>
        </View>

        {notes && (
          <View style={styles.notes}>
            <Text style={styles.notesLabel}>Notes</Text>
            <Text>{notes}</Text>
          </View>
        )}

        <Text style={styles.footer}>
          {companyName} • {invoiceNumber}
        </Text>
      </Page>
    </Document>
  );
}

export async function generateInvoicePDF(
  props: InvoicePDFProps
): Promise<Buffer> {
  const buffer = await renderToBuffer(<InvoicePDF {...props} />);
  return Buffer.from(buffer);
}

export { InvoicePDF };
