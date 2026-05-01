"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Card, Pill } from "./primitives";
import { fmtDate, fmtMoney, tone } from "./tokens";
import {
  AGING_BUCKETS,
  bucketLabel,
  bucketTone,
  type AgingBucket,
  type AgingSummary,
} from "@/lib/aging";

type AgingPayload = {
  summary: AgingSummary;
  totalCount: number;
  totalAmount: number;
  perBuilding: Array<{
    buildingId: number;
    buildingName: string;
    buildingRegion: string;
    total: number;
    count: number;
    oldestDays: number;
  }>;
  items: Array<{
    invoiceId: number;
    invoiceNumber: string;
    buildingName: string | null;
    tenantName: string;
    unit: string;
    amount: number;
    sentAt: string | null;
    daysOutstanding: number | null;
    bucket: AgingBucket | null;
  }>;
};

export function AgingSection() {
  const [data, setData] = useState<AgingPayload | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/invoices/aging")
      .then((r) => r.json())
      .then((d) => {
        setData(d);
        setLoading(false);
      });
  }, []);

  if (loading || !data) {
    return (
      <p className="text-[13px]" style={{ color: tone.ink50 }}>
        Loading aging…
      </p>
    );
  }

  const overdueAmount =
    data.summary["30-60"].total +
    data.summary["60-90"].total +
    data.summary["90+"].total;

  return (
    <div className="space-y-5">
      <div className="flex items-end justify-between">
        <div>
          <div
            className="text-[11px] uppercase tracking-[0.16em] mb-2"
            style={{ color: tone.ink50 }}
          >
            Outstanding
          </div>
          <h2
            className="font-serif"
            style={{ fontSize: 34, lineHeight: 1, color: tone.ink, letterSpacing: "-0.02em" }}
          >
            Aging report
          </h2>
          <p className="mt-2 text-[13.5px]" style={{ color: tone.ink70 }}>
            ${fmtMoney(data.totalAmount)} across {data.totalCount} invoice
            {data.totalCount === 1 ? "" : "s"}
            {overdueAmount > 0 && (
              <>
                {" · "}
                <span style={{ color: tone.rose }}>
                  ${fmtMoney(overdueAmount)} overdue
                </span>
              </>
            )}
          </p>
        </div>
      </div>

      {/* Bucket summary */}
      <div className="grid grid-cols-4 gap-3">
        {AGING_BUCKETS.map((bucket) => {
          const cell = data.summary[bucket];
          const t = bucketTone(bucket);
          const color =
            t === "failed" ? tone.rose : t === "draft" ? tone.amber : tone.ink;
          return (
            <Card key={bucket}>
              <div className="p-5">
                <div
                  className="text-[11px] uppercase tracking-[0.12em]"
                  style={{ color: tone.ink50 }}
                >
                  {bucketLabel(bucket)}
                </div>
                <div
                  className="mt-2 font-serif"
                  style={{ fontSize: 30, lineHeight: 1, color }}
                >
                  ${fmtMoney(cell.total)}
                </div>
                <div className="mt-1.5 text-[11.5px]" style={{ color: tone.ink50 }}>
                  {cell.count} invoice{cell.count === 1 ? "" : "s"}
                </div>
              </div>
            </Card>
          );
        })}
      </div>

      {data.totalCount === 0 ? (
        <Card>
          <div className="px-6 py-12 text-center">
            <div
              className="font-serif mb-1.5"
              style={{ fontSize: 20, color: tone.ink, letterSpacing: "-0.01em" }}
            >
              All clear
            </div>
            <p className="text-[13px]" style={{ color: tone.ink50 }}>
              Every sent invoice has been marked paid.
            </p>
          </div>
        </Card>
      ) : (
        <div className="grid grid-cols-2 gap-6">
          {/* By building */}
          <Card>
            <div
              className="px-6 py-5"
              style={{ borderBottom: `1px solid ${tone.lineSoft}` }}
            >
              <div className="font-serif" style={{ fontSize: 18, color: tone.ink }}>
                By building
              </div>
            </div>
            <div
              className="grid text-[11px] uppercase tracking-[0.1em] px-6 py-3"
              style={{
                gridTemplateColumns: "2fr 0.6fr 1fr 0.7fr",
                color: tone.ink50,
                borderBottom: `1px solid ${tone.lineSoft}`,
              }}
            >
              <div>Building</div>
              <div className="text-right">Inv</div>
              <div className="text-right">Total</div>
              <div className="text-right">Oldest</div>
            </div>
            {data.perBuilding.slice(0, 8).map((row, i) => (
              <div
                key={row.buildingId}
                className="grid items-center px-6 py-3"
                style={{
                  gridTemplateColumns: "2fr 0.6fr 1fr 0.7fr",
                  borderBottom:
                    i < Math.min(data.perBuilding.length, 8) - 1
                      ? `1px solid ${tone.lineSoft}`
                      : "none",
                }}
              >
                <div>
                  <div className="text-[13px]" style={{ color: tone.ink }}>
                    {row.buildingName}
                  </div>
                  <div className="text-[11px] mt-0.5" style={{ color: tone.ink50 }}>
                    {row.buildingRegion}
                  </div>
                </div>
                <div
                  className="text-right text-[13px] font-mono"
                  style={{ color: tone.ink70 }}
                >
                  {row.count}
                </div>
                <div
                  className="text-right font-serif"
                  style={{ fontSize: 17, color: tone.ink }}
                >
                  ${fmtMoney(row.total)}
                </div>
                <div className="text-right text-[12px]" style={{ color: tone.ink50 }}>
                  {row.oldestDays} d
                </div>
              </div>
            ))}
          </Card>

          {/* Oldest invoices */}
          <Card>
            <div
              className="px-6 py-5"
              style={{ borderBottom: `1px solid ${tone.lineSoft}` }}
            >
              <div className="font-serif" style={{ fontSize: 18, color: tone.ink }}>
                Needs attention
              </div>
            </div>
            <div
              className="grid text-[11px] uppercase tracking-[0.1em] px-6 py-3"
              style={{
                gridTemplateColumns: "1.4fr 1.5fr 0.7fr 0.9fr",
                color: tone.ink50,
                borderBottom: `1px solid ${tone.lineSoft}`,
              }}
            >
              <div>Invoice</div>
              <div>Building</div>
              <div>Days</div>
              <div className="text-right">Amount</div>
            </div>
            {data.items.slice(0, 8).map((it, i) => (
              <Link
                key={it.invoiceId}
                href={`/invoices/${it.invoiceId}`}
                className="grid items-center px-6 py-3 hover:bg-[#FAF7F0]"
                style={{
                  gridTemplateColumns: "1.4fr 1.5fr 0.7fr 0.9fr",
                  borderBottom:
                    i < Math.min(data.items.length, 8) - 1
                      ? `1px solid ${tone.lineSoft}`
                      : "none",
                }}
              >
                <div>
                  <div
                    className="font-mono text-[12px]"
                    style={{ color: tone.ink }}
                  >
                    {it.invoiceNumber}
                  </div>
                  <div
                    className="text-[11px] mt-0.5"
                    style={{ color: tone.ink50 }}
                  >
                    {it.tenantName} · {it.unit}
                  </div>
                </div>
                <div className="text-[12.5px]" style={{ color: tone.ink70 }}>
                  {it.buildingName || "—"}
                  {it.sentAt && (
                    <div
                      className="text-[10.5px] mt-0.5 font-mono"
                      style={{ color: tone.ink50 }}
                    >
                      sent {fmtDate(it.sentAt)}
                    </div>
                  )}
                </div>
                <div>
                  {it.bucket && (
                    <Pill tone={bucketTone(it.bucket)}>{it.daysOutstanding} d</Pill>
                  )}
                </div>
                <div
                  className="text-right font-serif"
                  style={{ fontSize: 17, color: tone.ink }}
                >
                  ${fmtMoney(it.amount)}
                </div>
              </Link>
            ))}
          </Card>
        </div>
      )}
    </div>
  );
}
