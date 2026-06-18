"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Btn, Card, Icons, Pill } from "@/components/homix/primitives";
import { fmtDate, fmtMoney, tone } from "@/components/homix/tokens";
import { saleRepresentationLabel, saleStageLabel } from "@/lib/sales";
import type { Agent, SaleDeal } from "@/db/schema";

type SaleRow = {
  saleDeal: SaleDeal;
  agents: Array<{
    agent: Agent | null;
    sharePct: number;
    isPrimary: boolean;
  }>;
  primaryAgent: Agent | null;
};

function statusTone(status: string) {
  if (status === "completed") return "sent";
  if (status === "cancelled") return "failed";
  return "accent";
}

export default function SalesPage() {
  const [sales, setSales] = useState<SaleRow[]>([]);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<"all" | "active" | "cancelled" | "completed">("all");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/sales")
      .then((r) => r.json())
      .then((data) => {
        setSales(data);
        setLoading(false);
      });
  }, []);

  const counts = useMemo(() => {
    const c = { all: sales.length, active: 0, cancelled: 0, completed: 0 };
    for (const row of sales) {
      const s = row.saleDeal.status as keyof typeof c;
      if (s in c) c[s]++;
    }
    return c;
  }, [sales]);

  const filtered = useMemo(() => {
    return sales.filter((row) => {
      const saleDeal = row.saleDeal;
      if (status !== "all" && saleDeal.status !== status) return false;
      if (!search) return true;
      const q = search.toLowerCase();
      return (
        saleDeal.propertyAddress.toLowerCase().includes(q) ||
        (saleDeal.buyerNames || "").toLowerCase().includes(q) ||
        (saleDeal.sellerNames || "").toLowerCase().includes(q) ||
        (saleDeal.mlsNumber || "").toLowerCase().includes(q) ||
        row.agents.some((participant) =>
          (participant.agent?.name || "").toLowerCase().includes(q)
        )
      );
    });
  }, [sales, search, status]);

  const statuses: { id: typeof status; label: string; count: number }[] = [
    { id: "all", label: "All", count: counts.all },
    { id: "active", label: "Active", count: counts.active },
    { id: "cancelled", label: "Cancelled", count: counts.cancelled },
    { id: "completed", label: "Completed", count: counts.completed },
  ];

  return (
    <div className="space-y-8">
      <div className="flex items-end justify-between">
        <div>
          <div className="text-[11px] uppercase tracking-[0.16em] mb-2" style={{ color: tone.ink50 }}>
            Buy / Sell
          </div>
          <h1 className="font-serif" style={{ fontSize: 52, lineHeight: 0.95, color: tone.ink }}>
            Sales
          </h1>
        </div>
        <Link href="/sales/new">
          <Btn variant="primary" icon={<Icons.Plus />}>
            New Sale
          </Btn>
        </Link>
      </div>

      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-1 p-1 rounded-lg" style={{ background: tone.paperDeep }}>
          {statuses.map((item) => (
            <button
              key={item.id}
              onClick={() => setStatus(item.id)}
              className="px-3 h-8 rounded-md text-[12.5px] font-medium transition-colors flex items-center gap-2"
              style={{
                background: status === item.id ? tone.card : "transparent",
                color: status === item.id ? tone.ink : tone.ink50,
                boxShadow: status === item.id ? "0 1px 2px rgba(0,0,0,0.04)" : "none",
              }}
            >
              {item.label}
              <span className="text-[11px] font-mono" style={{ color: status === item.id ? tone.ink50 : tone.ink30 }}>
                {item.count}
              </span>
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2 h-9 px-3 rounded-md min-w-[340px]" style={{ background: tone.card, border: `1px solid ${tone.line}` }}>
          <span style={{ color: tone.ink30 }}>
            <Icons.Search />
          </span>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search address, parties, MLS, agent..."
            className="flex-1 bg-transparent outline-none text-[13px]"
            style={{ color: tone.ink }}
          />
        </div>
      </div>

      <Card>
        <div className="grid text-[11px] uppercase tracking-[0.1em] px-6 py-3" style={{ gridTemplateColumns: "0.7fr 2.2fr 1.2fr 1.2fr 1fr 1.1fr 0.8fr", color: tone.ink50, borderBottom: `1px solid ${tone.lineSoft}` }}>
          <div>Sale #</div>
          <div>Property / Parties</div>
          <div>Type</div>
          <div>Agent</div>
          <div>Closing</div>
          <div className="text-right">Commission</div>
          <div className="text-right">Status</div>
        </div>
        {loading ? (
          <div className="px-6 py-12 text-center text-[13px]" style={{ color: tone.ink50 }}>
            Loading…
          </div>
        ) : filtered.length === 0 ? (
          <div className="px-6 py-16 text-center">
            {sales.length === 0 ? (
              <>
                <div className="font-serif mb-2" style={{ fontSize: 24, color: tone.ink }}>
                  No sales yet
                </div>
                <Link href="/sales/new" className="text-[13px] underline" style={{ color: tone.accent }}>
                  Create your first sale
                </Link>
              </>
            ) : (
              <p className="text-[13px]" style={{ color: tone.ink50 }}>
                No results match your filters.
              </p>
            )}
          </div>
        ) : (
          filtered.map(({ saleDeal, agents, primaryAgent }, index) => {
            const others = agents.filter((participant) => !participant.isPrimary);
            const location = [saleDeal.city, saleDeal.state, saleDeal.zip].filter(Boolean).join(", ");
            return (
              <Link
                key={saleDeal.id}
                href={`/sales/${saleDeal.id}`}
                className="grid w-full text-left px-6 py-4 transition-colors items-center hover:bg-[#FAF7F0]"
                style={{
                  gridTemplateColumns: "0.7fr 2.2fr 1.2fr 1.2fr 1fr 1.1fr 0.8fr",
                  borderBottom: index < filtered.length - 1 ? `1px solid ${tone.lineSoft}` : "none",
                }}
              >
                <div className="font-mono text-[12.5px]" style={{ color: tone.ink }}>
                  #{saleDeal.id}
                </div>
                <div>
                  <div className="text-[13px]" style={{ color: tone.ink }}>
                    {saleDeal.propertyAddress}
                  </div>
                  <div className="text-[11.5px] mt-0.5" style={{ color: tone.ink50 }}>
                    {[saleDeal.buyerNames && `Buyer: ${saleDeal.buyerNames}`, saleDeal.sellerNames && `Seller: ${saleDeal.sellerNames}`, location].filter(Boolean).join(" · ") || "Parties pending"}
                  </div>
                </div>
                <div>
                  <div className="text-[12.5px]" style={{ color: tone.ink70 }}>
                    {saleRepresentationLabel(saleDeal.representationType)}
                  </div>
                  <div className="mt-1">
                    <Pill tone="neutral">{saleStageLabel(saleDeal.stage)}</Pill>
                  </div>
                </div>
                <div>
                  <div className="text-[12.5px]" style={{ color: tone.ink70 }}>
                    {primaryAgent?.name || "—"}
                  </div>
                  {others.length > 0 && (
                    <div className="mt-1">
                      <Pill tone="neutral">
                        +{others.length} agent{others.length === 1 ? "" : "s"}
                      </Pill>
                    </div>
                  )}
                </div>
                <div className="text-[12.5px] font-mono" style={{ color: tone.ink70 }}>
                  {saleDeal.closingDate ? fmtDate(saleDeal.closingDate) : "—"}
                </div>
                <div className="text-right">
                  <div className="font-serif" style={{ fontSize: 18, color: tone.ink }}>
                    ${fmtMoney(Number(saleDeal.grossCommission || 0))}
                  </div>
                  {saleDeal.purchasePrice ? (
                    <div className="text-[11px] font-mono" style={{ color: tone.ink50 }}>
                      ${fmtMoney(Number(saleDeal.purchasePrice))}
                    </div>
                  ) : null}
                </div>
                <div className="text-right">
                  <Pill tone={statusTone(saleDeal.status)}>{saleDeal.status}</Pill>
                </div>
              </Link>
            );
          })
        )}
      </Card>
    </div>
  );
}
