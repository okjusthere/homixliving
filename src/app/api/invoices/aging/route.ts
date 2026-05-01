import { NextResponse } from "next/server";
import { db } from "@/db";
import { invoices, buildings } from "@/db/schema";
import { eq } from "drizzle-orm";
import {
  bucketFor,
  daysSince,
  emptyAgingSummary,
  isOutstanding,
  AGING_BUCKETS,
} from "@/lib/aging";

export async function GET() {
  const rows = await db
    .select({
      invoice: invoices,
      buildingName: buildings.name,
      buildingRegion: buildings.region,
    })
    .from(invoices)
    .leftJoin(buildings, eq(invoices.buildingId, buildings.id));

  const summary = emptyAgingSummary();
  // Per-building breakdown: { buildingId: { name, total, byBucket } }
  const perBuilding = new Map<
    number,
    {
      buildingId: number;
      buildingName: string;
      buildingRegion: string;
      total: number;
      count: number;
      oldestDays: number;
    }
  >();
  const items: Array<{
    invoiceId: number;
    invoiceNumber: string;
    buildingName: string | null;
    tenantName: string;
    unit: string;
    amount: number;
    sentAt: string | null;
    daysOutstanding: number | null;
    bucket: string | null;
  }> = [];

  for (const row of rows) {
    const inv = row.invoice;
    if (!isOutstanding(inv)) continue;
    const days = daysSince(inv.sentAt);
    const bucket = bucketFor(days);
    if (!bucket) continue;

    summary[bucket].count += 1;
    summary[bucket].total += Number(inv.totalAmount || 0);

    if (inv.buildingId) {
      const existing = perBuilding.get(inv.buildingId);
      const amount = Number(inv.totalAmount || 0);
      if (existing) {
        existing.total += amount;
        existing.count += 1;
        existing.oldestDays = Math.max(existing.oldestDays, days ?? 0);
      } else {
        perBuilding.set(inv.buildingId, {
          buildingId: inv.buildingId,
          buildingName: row.buildingName || "—",
          buildingRegion: row.buildingRegion || "—",
          total: amount,
          count: 1,
          oldestDays: days ?? 0,
        });
      }
    }

    items.push({
      invoiceId: inv.id,
      invoiceNumber: inv.invoiceNumber,
      buildingName: row.buildingName,
      tenantName: inv.tenantName,
      unit: inv.unit,
      amount: Number(inv.totalAmount || 0),
      sentAt: inv.sentAt,
      daysOutstanding: days,
      bucket,
    });
  }

  const totalCount = AGING_BUCKETS.reduce((n, b) => n + summary[b].count, 0);
  const totalAmount = AGING_BUCKETS.reduce((n, b) => n + summary[b].total, 0);

  return NextResponse.json({
    summary,
    totalCount,
    totalAmount,
    perBuilding: Array.from(perBuilding.values()).sort(
      (a, b) => b.total - a.total
    ),
    items: items.sort(
      (a, b) => (b.daysOutstanding || 0) - (a.daysOutstanding || 0)
    ),
  });
}
