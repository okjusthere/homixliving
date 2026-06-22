export type InvoicePaymentStatus = "none" | "draft" | "awaiting_payment" | "paid" | "failed";

export type InvoicePaymentSummary = {
  invoiceCount: number;
  status: InvoicePaymentStatus;
  label: string;
  latestInvoiceId: number | null;
  latestInvoiceNumber: string | null;
  totalOutstanding: number;
  totalPaid: number;
  paidAt: string | null;
  sentAt: string | null;
};

type InvoiceLike = {
  id: number;
  invoiceNumber: string;
  status: string;
  totalAmount: number;
  paidAmount: number | null;
  paidAt: string | null;
  sentAt: string | null;
  createdAt: string | null;
  updatedAt: string | null;
};

function timestamp(value?: string | null) {
  if (!value) return 0;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function newest<T extends InvoiceLike>(rows: T[]) {
  return [...rows].sort(
    (a, b) =>
      Math.max(timestamp(b.updatedAt), timestamp(b.sentAt), timestamp(b.paidAt), timestamp(b.createdAt)) -
      Math.max(timestamp(a.updatedAt), timestamp(a.sentAt), timestamp(a.paidAt), timestamp(a.createdAt))
  )[0];
}

function baseSummary(
  rows: InvoiceLike[],
  status: InvoicePaymentStatus,
  label: string,
  latest: InvoiceLike | undefined,
  totals: Pick<InvoicePaymentSummary, "totalOutstanding" | "totalPaid"> = {
    totalOutstanding: 0,
    totalPaid: 0,
  }
): InvoicePaymentSummary {
  return {
    invoiceCount: rows.length,
    status,
    label,
    latestInvoiceId: latest?.id || null,
    latestInvoiceNumber: latest?.invoiceNumber || null,
    totalOutstanding: totals.totalOutstanding,
    totalPaid: totals.totalPaid,
    paidAt: latest?.paidAt || null,
    sentAt: latest?.sentAt || null,
  };
}

export function summarizeInvoicePayment(rows: InvoiceLike[]): InvoicePaymentSummary {
  if (rows.length === 0) {
    return baseSummary(rows, "none", "No invoice", undefined);
  }

  const sentRows = rows.filter((invoice) => invoice.status === "sent");
  if (sentRows.length > 0) {
    return baseSummary(rows, "awaiting_payment", "Awaiting payment", newest(sentRows), {
      totalOutstanding: sentRows.reduce((sum, invoice) => sum + Number(invoice.totalAmount || 0), 0),
      totalPaid: rows
        .filter((invoice) => invoice.status === "paid")
        .reduce((sum, invoice) => sum + Number(invoice.paidAmount ?? invoice.totalAmount ?? 0), 0),
    });
  }

  const paidRows = rows.filter((invoice) => invoice.status === "paid");
  if (paidRows.length > 0) {
    return baseSummary(rows, "paid", "Paid", newest(paidRows), {
      totalOutstanding: 0,
      totalPaid: paidRows.reduce((sum, invoice) => sum + Number(invoice.paidAmount ?? invoice.totalAmount ?? 0), 0),
    });
  }

  const failedRows = rows.filter((invoice) => invoice.status === "failed");
  if (failedRows.length > 0) {
    return baseSummary(rows, "failed", "Send failed", newest(failedRows));
  }

  return baseSummary(rows, "draft", "Draft invoice", newest(rows));
}

export function invoicePaymentTone(status: InvoicePaymentStatus) {
  if (status === "paid") return "sent";
  if (status === "awaiting_payment") return "accent";
  if (status === "failed") return "failed";
  if (status === "draft") return "draft";
  return "neutral";
}
