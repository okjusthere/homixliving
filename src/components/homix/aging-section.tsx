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
import { useLocale } from "@/lib/i18n-client";

const M = {
  en: {
    loading: "Loading aging…",
    eyebrow: "Outstanding",
    title: "Aging report",
    across: (amount: string, count: number) => `${amount} across ${count} invoice${count === 1 ? "" : "s"}`,
    overdue: "overdue",
    invoiceCount: (count: number) => `${count} invoice${count === 1 ? "" : "s"}`,
    allClear: "All clear",
    allClearBody: "Every sent invoice has been marked paid.",
    byBuilding: "By building",
    building: "Building",
    invoiceAbbr: "Inv",
    total: "Total",
    oldest: "Oldest",
    needsAttention: "Needs attention",
    invoice: "Invoice",
    days: "Days",
    amount: "Amount",
    sent: "sent",
    dayAbbr: "d",
  },
  zh: {
    loading: "正在加载账龄…",
    eyebrow: "待收款",
    title: "账龄报告",
    across: (amount: string, count: number) => `${amount}，共 ${count} 张发票`,
    overdue: "已逾期",
    invoiceCount: (count: number) => `${count} 张发票`,
    allClear: "全部结清",
    allClearBody: "所有已发送发票均已标记为已付款。",
    byBuilding: "按楼盘汇总",
    building: "楼盘",
    invoiceAbbr: "发票",
    total: "总额",
    oldest: "最久",
    needsAttention: "需要关注",
    invoice: "发票",
    days: "天数",
    amount: "金额",
    sent: "发送于",
    dayAbbr: "天",
  },
} as const;

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
  const locale = useLocale();
  const t = M[locale];
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
        {t.loading}
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
            {t.eyebrow}
          </div>
          <h2
            className="font-serif"
            style={{ fontSize: 34, lineHeight: 1, color: tone.ink, letterSpacing: "-0.02em" }}
          >
            {t.title}
          </h2>
          <p className="mt-2 text-[13.5px]" style={{ color: tone.ink70 }}>
            {t.across(`$${fmtMoney(data.totalAmount)}`, data.totalCount)}
            {overdueAmount > 0 && (
              <>
                {" · "}
                <span style={{ color: tone.rose }}>
                  ${fmtMoney(overdueAmount)} {t.overdue}
                </span>
              </>
            )}
          </p>
        </div>
      </div>

      {/* Bucket summary */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {AGING_BUCKETS.map((bucket) => {
          const cell = data.summary[bucket];
          const bucketToneValue = bucketTone(bucket);
          const color =
            bucketToneValue === "failed"
              ? tone.rose
              : bucketToneValue === "draft"
                ? tone.amber
                : tone.ink;
          return (
            <Card key={bucket}>
              <div className="p-5">
                <div
                  className="text-[11px] uppercase tracking-[0.12em]"
                  style={{ color: tone.ink50 }}
                >
                  {bucketLabel(bucket, locale)}
                </div>
                <div
                  className="mt-2 font-serif"
                  style={{ fontSize: 30, lineHeight: 1, color }}
                >
                  ${fmtMoney(cell.total)}
                </div>
                <div className="mt-1.5 text-[11.5px]" style={{ color: tone.ink50 }}>
                  {t.invoiceCount(cell.count)}
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
              {t.allClear}
            </div>
            <p className="text-[13px]" style={{ color: tone.ink50 }}>
              {t.allClearBody}
            </p>
          </div>
        </Card>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* By building */}
          <Card className="overflow-hidden">
            <div
              className="px-6 py-5"
              style={{ borderBottom: `1px solid ${tone.lineSoft}` }}
            >
              <div className="font-serif" style={{ fontSize: 18, color: tone.ink }}>
                {t.byBuilding}
              </div>
            </div>
            <div className="overflow-x-auto">
              <div
                className="grid min-w-[460px] text-[11px] uppercase tracking-[0.1em] px-6 py-3"
                style={{
                  gridTemplateColumns: "2fr 0.6fr 1fr 0.7fr",
                  color: tone.ink50,
                  borderBottom: `1px solid ${tone.lineSoft}`,
                }}
              >
                <div>{t.building}</div>
                <div className="text-right">{t.invoiceAbbr}</div>
                <div className="text-right">{t.total}</div>
                <div className="text-right">{t.oldest}</div>
              </div>
              {data.perBuilding.slice(0, 8).map((row, i) => (
                <div
                  key={row.buildingId}
                  className="grid min-w-[460px] items-center px-6 py-3"
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
                    {row.oldestDays} {t.dayAbbr}
                  </div>
                </div>
              ))}
            </div>
          </Card>

          {/* Oldest invoices */}
          <Card className="overflow-hidden">
            <div
              className="px-6 py-5"
              style={{ borderBottom: `1px solid ${tone.lineSoft}` }}
            >
              <div className="font-serif" style={{ fontSize: 18, color: tone.ink }}>
                {t.needsAttention}
              </div>
            </div>
            <div className="overflow-x-auto">
              <div
                className="grid min-w-[520px] text-[11px] uppercase tracking-[0.1em] px-6 py-3"
                style={{
                  gridTemplateColumns: "1.4fr 1.5fr 0.7fr 0.9fr",
                  color: tone.ink50,
                  borderBottom: `1px solid ${tone.lineSoft}`,
                }}
              >
                <div>{t.invoice}</div>
                <div>{t.building}</div>
                <div>{t.days}</div>
                <div className="text-right">{t.amount}</div>
              </div>
              {data.items.slice(0, 8).map((it, i) => (
                <Link
                  key={it.invoiceId}
                  href={`/invoices/${it.invoiceId}`}
                  className="grid min-w-[520px] items-center px-6 py-3 hover:bg-[#FAF7F0]"
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
                        {t.sent} {fmtDate(it.sentAt)}
                      </div>
                    )}
                  </div>
                  <div>
                    {it.bucket && (
                      <Pill tone={bucketTone(it.bucket)}>{it.daysOutstanding} {t.dayAbbr}</Pill>
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
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
