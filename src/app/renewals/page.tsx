"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Btn, Card, Pill } from "@/components/homix/primitives";
import { fmtDate, fmtMoney, tone } from "@/components/homix/tokens";
import {
  RENEWAL_WINDOWS,
  renewalStatusLabel,
  renewalStatusTone,
  windowLabel,
  windowTone,
  type RenewalWindow,
} from "@/lib/renewals";

type RenewalRow = {
  deal: {
    id: number;
    unit: string;
    tenantName: string;
    tenantEmail: string | null;
    tenantPhone: string | null;
    rentAmount: number | null;
    leaseEndDate: string;
    totalCommission: number;
    renewalStatus: string | null;
    renewalNotedAt: string | null;
  };
  buildingName: string | null;
  buildingRegion: string | null;
  agentName: string | null;
  agentEmail: string | null;
  agentPhone: string | null;
  daysUntil: number | null;
  window: RenewalWindow | null;
};

const STATUS_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "pending", label: "Pending" },
  { value: "renewing", label: "Renewing" },
  { value: "moving_out", label: "Moving out" },
  { value: "renewed", label: "Renewed" },
  { value: "lost", label: "Lost" },
];

export default function RenewalsPage() {
  const [items, setItems] = useState<RenewalRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeWindow, setActiveWindow] = useState<RenewalWindow | "all">("all");
  const [savingDeal, setSavingDeal] = useState<number | null>(null);

  const fetchItems = async () => {
    const res = await fetch("/api/deals/upcoming-renewals");
    const data = await res.json();
    setItems(data.items);
    setLoading(false);
  };

  useEffect(() => {
    fetchItems();
  }, []);

  const counts = useMemo(() => {
    const c: Record<RenewalWindow | "all", number> = {
      all: items.length,
      overdue: 0,
      "30": 0,
      "60": 0,
      "90": 0,
    };
    for (const row of items) {
      if (row.window && row.window in c) {
        c[row.window]++;
      }
    }
    return c;
  }, [items]);

  const totalRent = useMemo(
    () => items.reduce((sum, r) => sum + Number(r.deal.rentAmount || 0), 0),
    [items]
  );

  const filtered = useMemo(() => {
    if (activeWindow === "all") return items;
    return items.filter((r) => r.window === activeWindow);
  }, [items, activeWindow]);

  const handleSetStatus = async (dealId: number, renewalStatus: string) => {
    setSavingDeal(dealId);
    try {
      const res = await fetch(`/api/deals/${dealId}/renewal`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ renewalStatus }),
      });
      if (!res.ok) throw new Error();
      toast.success("Status updated");
      await fetchItems();
    } catch {
      toast.error("Update failed");
    } finally {
      setSavingDeal(null);
    }
  };

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-end justify-between">
        <div>
          <div
            className="text-[11px] uppercase tracking-[0.16em] mb-2"
            style={{ color: tone.ink50 }}
          >
            Pipeline
          </div>
          <h1
            className="font-serif"
            style={{
              fontSize: 52,
              lineHeight: 0.95,
              letterSpacing: "-0.02em",
              color: tone.ink,
            }}
          >
            Renewals
          </h1>
          <p className="mt-3 text-[14px]" style={{ color: tone.ink70 }}>
            {items.length} lease{items.length === 1 ? "" : "s"} ending in the next
            90 days · ${fmtMoney(totalRent)} monthly rent in play
          </p>
        </div>
      </div>

      {/* Window chips */}
      <div className="flex items-center gap-1 p-1 rounded-lg w-fit"
        style={{ background: tone.paperDeep }}
      >
        {(["all", ...RENEWAL_WINDOWS] as const).map((w) => {
          const active = activeWindow === w;
          const label = w === "all" ? "All" : windowLabel(w);
          return (
            <button
              key={w}
              onClick={() => setActiveWindow(w)}
              className="px-3 h-8 rounded-md text-[12.5px] font-medium transition-colors flex items-center gap-2"
              style={{
                background: active ? tone.card : "transparent",
                color: active ? tone.ink : tone.ink50,
                boxShadow: active ? "0 1px 2px rgba(0,0,0,0.04)" : "none",
              }}
            >
              {label}
              <span
                className="text-[11px] font-mono"
                style={{ color: active ? tone.ink50 : tone.ink30 }}
              >
                {counts[w]}
              </span>
            </button>
          );
        })}
      </div>

      {loading ? (
        <p className="text-[13px]" style={{ color: tone.ink50 }}>
          Loading…
        </p>
      ) : filtered.length === 0 ? (
        <Card>
          <div className="px-6 py-16 text-center">
            <div
              className="font-serif mb-2"
              style={{ fontSize: 22, color: tone.ink, letterSpacing: "-0.01em" }}
            >
              {items.length === 0
                ? "Nothing coming up"
                : "No leases in this window"}
            </div>
            <p className="text-[13px]" style={{ color: tone.ink50 }}>
              {items.length === 0
                ? "Renewals show up here when a lease is within 90 days of ending."
                : "Try a different filter."}
            </p>
          </div>
        </Card>
      ) : (
        <Card>
          <div
            className="grid text-[11px] uppercase tracking-[0.1em] px-6 py-3"
            style={{
              gridTemplateColumns: "1.4fr 1.6fr 1fr 0.9fr 1fr 1.2fr",
              color: tone.ink50,
              borderBottom: `1px solid ${tone.lineSoft}`,
            }}
          >
            <div>Deal</div>
            <div>Building / Tenant</div>
            <div>Agent</div>
            <div>Lease ends</div>
            <div>When</div>
            <div className="text-right">Action</div>
          </div>

          {filtered.map((row, i) => {
            const days = row.daysUntil;
            const win = row.window;
            return (
              <div
                key={row.deal.id}
                className="grid items-center px-6 py-4"
                style={{
                  gridTemplateColumns: "1.4fr 1.6fr 1fr 0.9fr 1fr 1.2fr",
                  borderBottom:
                    i < filtered.length - 1 ? `1px solid ${tone.lineSoft}` : "none",
                }}
              >
                <div>
                  <Link
                    href={`/deals/${row.deal.id}`}
                    className="font-mono text-[12.5px] hover:underline"
                    style={{ color: tone.ink }}
                  >
                    #{row.deal.id}
                  </Link>
                  <div className="text-[11.5px] mt-0.5" style={{ color: tone.ink50 }}>
                    Unit {row.deal.unit}
                  </div>
                </div>

                <div>
                  <div className="text-[13px]" style={{ color: tone.ink }}>
                    {row.buildingName || "—"}
                  </div>
                  <div className="text-[11.5px] mt-0.5" style={{ color: tone.ink50 }}>
                    {row.deal.tenantName}
                    {row.deal.rentAmount
                      ? ` · $${fmtMoney(Number(row.deal.rentAmount))} / mo`
                      : ""}
                  </div>
                </div>

                <div className="text-[12.5px]" style={{ color: tone.ink70 }}>
                  {row.agentName || "—"}
                </div>

                <div className="text-[12.5px] font-mono" style={{ color: tone.ink70 }}>
                  {fmtDate(row.deal.leaseEndDate)}
                </div>

                <div>
                  {win && (
                    <Pill tone={windowTone(win)}>
                      {days !== null && days < 0
                        ? `${Math.abs(days)} d ago`
                        : `${days} d`}
                    </Pill>
                  )}
                </div>

                <div className="flex items-center justify-end gap-2">
                  {row.deal.renewalStatus && row.deal.renewalStatus !== "pending" ? (
                    <Pill tone={renewalStatusTone(row.deal.renewalStatus)}>
                      {renewalStatusLabel(row.deal.renewalStatus)}
                    </Pill>
                  ) : (
                    <select
                      value={row.deal.renewalStatus || "pending"}
                      onChange={(e) => handleSetStatus(row.deal.id, e.target.value)}
                      disabled={savingDeal === row.deal.id}
                      className="text-[12px] rounded-md px-2 h-8 font-medium"
                      style={{
                        background: tone.paperDeep,
                        color: tone.ink,
                        border: `1px solid ${tone.line}`,
                      }}
                    >
                      {STATUS_OPTIONS.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                  )}
                  {row.deal.renewalStatus &&
                    row.deal.renewalStatus !== "pending" && (
                      <button
                        type="button"
                        onClick={() => handleSetStatus(row.deal.id, "pending")}
                        disabled={savingDeal === row.deal.id}
                        className="text-[11px] underline"
                        style={{ color: tone.ink50 }}
                      >
                        reset
                      </button>
                    )}
                </div>
              </div>
            );
          })}
        </Card>
      )}
    </div>
  );
}
