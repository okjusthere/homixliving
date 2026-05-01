// Aging report helpers — bucket invoices by how long they've been outstanding.
import type { Invoice } from "@/db/schema";

export type AgingBucket = "0-30" | "30-60" | "60-90" | "90+";

export const AGING_BUCKETS: AgingBucket[] = ["0-30", "30-60", "60-90", "90+"];

export function daysSince(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  if (isNaN(t)) return null;
  return Math.floor((Date.now() - t) / 86400000);
}

export function bucketFor(days: number | null): AgingBucket | null {
  if (days === null) return null;
  if (days < 30) return "0-30";
  if (days < 60) return "30-60";
  if (days < 90) return "60-90";
  return "90+";
}

export function isOutstanding(invoice: Pick<Invoice, "status">): boolean {
  return invoice.status === "sent";
}

export type AgingSummary = Record<AgingBucket, { count: number; total: number }>;

export function emptyAgingSummary(): AgingSummary {
  return {
    "0-30": { count: 0, total: 0 },
    "30-60": { count: 0, total: 0 },
    "60-90": { count: 0, total: 0 },
    "90+": { count: 0, total: 0 },
  };
}

export function summarize(
  invoices: Pick<Invoice, "status" | "sentAt" | "totalAmount">[]
): AgingSummary {
  const summary = emptyAgingSummary();
  for (const inv of invoices) {
    if (!isOutstanding(inv)) continue;
    const bucket = bucketFor(daysSince(inv.sentAt));
    if (!bucket) continue;
    summary[bucket].count += 1;
    summary[bucket].total += Number(inv.totalAmount || 0);
  }
  return summary;
}

export function totalOutstanding(summary: AgingSummary) {
  return AGING_BUCKETS.reduce(
    (acc, b) => ({
      count: acc.count + summary[b].count,
      total: acc.total + summary[b].total,
    }),
    { count: 0, total: 0 }
  );
}

export function bucketLabel(b: AgingBucket): string {
  switch (b) {
    case "0-30":
      return "Current (0–30 days)";
    case "30-60":
      return "30–60 days";
    case "60-90":
      return "60–90 days";
    case "90+":
      return "Over 90 days";
  }
}

export function bucketTone(
  b: AgingBucket
): "neutral" | "draft" | "failed" {
  switch (b) {
    case "0-30":
      return "neutral";
    case "30-60":
      return "draft";
    default:
      return "failed";
  }
}
