import Link from "next/link";
import { db } from "@/db";
import { agents, buildings, deals, invoices } from "@/db/schema";
import { eq, count, sql } from "drizzle-orm";
import { tone, fmtMoney, fmtDate } from "@/components/homix/tokens";
import { Pill, Card } from "@/components/homix/server-primitives";
import { IconChev } from "@/components/homix/icons";
import { DashboardCTA } from "@/components/homix/dashboard-cta";
import { computeCommission } from "@/lib/commission";
import { activeDeal, dealInMonth, getMonthKey } from "@/lib/reporting";

export const dynamic = "force-dynamic";

function Stat({
  label,
  value,
  sub,
  toneKey = "ink",
  big,
}: {
  label: string;
  value: React.ReactNode;
  sub?: string;
  toneKey?: "ink" | "accent" | "green" | "amber";
  big?: boolean;
}) {
  const color =
    toneKey === "accent"
      ? tone.accent
      : toneKey === "green"
      ? tone.green
      : toneKey === "amber"
      ? tone.amber
      : tone.ink;
  return (
    <div style={{ padding: "22px 24px" }}>
      <div className="text-[11px] uppercase tracking-[0.12em]" style={{ color: tone.ink50 }}>
        {label}
      </div>
      <div
        className="font-serif"
        style={{
          fontSize: big ? 56 : 42,
          lineHeight: 1,
          marginTop: 10,
          letterSpacing: "-0.02em",
          color,
        }}
      >
        {value}
      </div>
      {sub && (
        <div className="text-[12px] mt-2" style={{ color: tone.ink50 }}>
          {sub}
        </div>
      )}
    </div>
  );
}

export default async function Dashboard() {
  const now = new Date();
  const currentMonth = getMonthKey(now);
  const [totalBuildingsRow] = await db.select({ count: count() }).from(buildings);
  const [totalInvoicesRow] = await db.select({ count: count() }).from(invoices);
  const [sentInvoicesRow] = await db
    .select({ count: count() })
    .from(invoices)
    .where(eq(invoices.status, "sent"));
  const [draftInvoicesRow] = await db
    .select({ count: count() })
    .from(invoices)
    .where(eq(invoices.status, "draft"));
  const [failedInvoicesRow] = await db
    .select({ count: count() })
    .from(invoices)
    .where(eq(invoices.status, "failed"));
  const [totalAmountRow] = await db
    .select({ total: sql<number>`COALESCE(SUM(${invoices.totalAmount}), 0)` })
    .from(invoices);
  const [sentAmountRow] = await db
    .select({ total: sql<number>`COALESCE(SUM(${invoices.totalAmount}), 0)` })
    .from(invoices)
    .where(eq(invoices.status, "sent"));
  const [draftAmountRow] = await db
    .select({ total: sql<number>`COALESCE(SUM(${invoices.totalAmount}), 0)` })
    .from(invoices)
    .where(eq(invoices.status, "draft"));
  const [outOfStateRow] = await db
    .select({ count: count() })
    .from(buildings)
    .where(eq(buildings.isOutOfState, true));

  const allDealRows = await db.select().from(deals);
  const allAgentRows = await db.select().from(agents);
  const agentById = new Map(allAgentRows.map((agent) => [agent.id, agent]));
  const mtdDeals = allDealRows.filter((deal) => activeDeal(deal) && dealInMonth(deal, currentMonth));
  const commissionMtd = mtdDeals.reduce((sum, deal) => sum + Number(deal.totalCommission || 0), 0);
  const agentTakeById = new Map<number, number>();
  for (const deal of mtdDeals) {
    const primaryAgent = agentById.get(deal.primaryAgentId);
    const coAgent = deal.coAgentId ? agentById.get(deal.coAgentId) : null;
    const breakdown = computeCommission({
      totalCommission: Number(deal.totalCommission || 0),
      referrer:
        deal.referrerType === "percent" || deal.referrerType === "flat"
          ? { type: deal.referrerType, amount: Number(deal.referrerAmount || 0) }
          : null,
      primaryAgentSharePct: Number(deal.primaryAgentSharePct || 100),
      primaryAgentSplitPct: Number(primaryAgent?.splitPct || 0),
      coAgent: deal.coAgentId
        ? { sharePct: Number(deal.coAgentSharePct || 0), splitPct: Number(coAgent?.splitPct || 0) }
        : null,
    });
    if (primaryAgent) {
      agentTakeById.set(primaryAgent.id, (agentTakeById.get(primaryAgent.id) || 0) + breakdown.primaryAgentTake);
    }
    if (coAgent) {
      agentTakeById.set(coAgent.id, (agentTakeById.get(coAgent.id) || 0) + breakdown.coAgentTake);
    }
  }
  const topAgentEntry = Array.from(agentTakeById.entries()).sort((a, b) => b[1] - a[1])[0];
  const topAgent = topAgentEntry ? agentById.get(topAgentEntry[0]) : null;

  const recentInvoices = await db
    .select({
      invoice: invoices,
      buildingName: buildings.name,
      buildingRegion: buildings.region,
      buildingManagement: buildings.managementCompany,
    })
    .from(invoices)
    .leftJoin(buildings, eq(invoices.buildingId, buildings.id))
    .orderBy(sql`${invoices.createdAt} DESC`)
    .limit(5);

  const recentDeals = await db
    .select({
      deal: deals,
      buildingName: buildings.name,
    })
    .from(deals)
    .leftJoin(buildings, eq(deals.buildingId, buildings.id))
    .orderBy(sql`${deals.createdAt} DESC`)
    .limit(5);

  // Top buildings by invoice volume
  const topBuildings = await db
    .select({
      id: buildings.id,
      name: buildings.name,
      region: buildings.region,
      managementCompany: buildings.managementCompany,
      count: sql<number>`COUNT(${invoices.id})`,
    })
    .from(buildings)
    .leftJoin(invoices, eq(invoices.buildingId, buildings.id))
    .groupBy(buildings.id)
    .orderBy(sql`COUNT(${invoices.id}) DESC`, buildings.name)
    .limit(5);

  const longDate = now.toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
  const hour = now.getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";

  const maxCount = Math.max(1, ...topBuildings.map((b) => Number(b.count || 0)));

  return (
    <div className="space-y-10">
      {/* Editorial Hero */}
      <div className="flex items-end justify-between pt-4">
        <div>
          <div className="text-[11px] uppercase tracking-[0.16em] mb-3" style={{ color: tone.ink50 }}>
            {longDate}
          </div>
          <h1
            className="font-serif"
            style={{
              fontSize: 68,
              lineHeight: 0.95,
              letterSpacing: "-0.02em",
              color: tone.ink,
            }}
          >
            {greeting}.
          </h1>
          <p className="mt-4 text-[15px] max-w-xl" style={{ color: tone.ink70 }}>
            {draftInvoicesRow.count} invoice{draftInvoicesRow.count === 1 ? "" : "s"} waiting to send
            {failedInvoicesRow.count > 0 && `, ${failedInvoicesRow.count} need attention`}.
            {" "}
            <span style={{ color: tone.ink }}>
              ${fmtMoney(Number(draftAmountRow.total || 0))}
            </span>{" "}
            in draft.
          </p>
        </div>
        <DashboardCTA />
      </div>

      {/* Deal KPI ribbon */}
      <Card style={{ overflow: "hidden" }}>
        <div className="grid grid-cols-4">
          <div style={{ borderRight: `1px solid ${tone.line}` }}>
            <Stat
              label="Deals MTD"
              value={mtdDeals.length}
              sub={currentMonth}
              toneKey="accent"
            />
          </div>
          <div style={{ borderRight: `1px solid ${tone.line}` }}>
            <Stat
              label="Commission MTD"
              value={`$${fmtMoney(commissionMtd)}`}
              sub="Signed deal value"
              big
            />
          </div>
          <div style={{ borderRight: `1px solid ${tone.line}` }}>
            <Stat
              label="Top Agent MTD"
              value={topAgent ? topAgent.name.split(" ")[0] : "—"}
              sub={topAgentEntry ? `$${fmtMoney(topAgentEntry[1])} take` : "No deals yet"}
              toneKey="green"
            />
          </div>
          <div>
            <Stat
              label="Pending Invoices"
              value={draftInvoicesRow.count}
              sub={`$${fmtMoney(Number(draftAmountRow.total || 0))} in draft`}
              toneKey="amber"
            />
          </div>
        </div>
      </Card>

      {/* KPI ribbon */}
      <Card style={{ overflow: "hidden" }}>
        <div className="grid grid-cols-4">
          <div style={{ borderRight: `1px solid ${tone.line}` }}>
            <Stat
              label="Invoiced YTD"
              value={`$${fmtMoney(Number(totalAmountRow.total || 0))}`}
              sub={`Across ${totalInvoicesRow.count} invoice${totalInvoicesRow.count === 1 ? "" : "s"}`}
              big
            />
          </div>
          <div style={{ borderRight: `1px solid ${tone.line}` }}>
            <Stat
              label="Sent"
              value={sentInvoicesRow.count}
              sub={`$${fmtMoney(Number(sentAmountRow.total || 0))} collected`}
              toneKey="green"
            />
          </div>
          <div style={{ borderRight: `1px solid ${tone.line}` }}>
            <Stat
              label="Draft"
              value={draftInvoicesRow.count}
              sub={`$${fmtMoney(Number(draftAmountRow.total || 0))} pending`}
              toneKey="amber"
            />
          </div>
          <div>
            <Stat
              label="Buildings"
              value={totalBuildingsRow.count}
              sub={`${outOfStateRow.count} out of state`}
            />
          </div>
        </div>
      </Card>

      {/* Recent activity */}
      <div className="grid grid-cols-2 gap-6">
        <Card>
          <div
            className="flex items-center justify-between px-6 py-5"
            style={{ borderBottom: `1px solid ${tone.lineSoft}` }}
          >
            <div>
              <div
                className="font-serif"
                style={{ fontSize: 22, color: tone.ink, letterSpacing: "-0.01em" }}
              >
                Recent invoices
              </div>
              <div className="text-[12px] mt-0.5" style={{ color: tone.ink50 }}>
                Last 5 invoices
              </div>
            </div>
            <Link
              href="/invoices"
              className="text-[13px] flex items-center gap-1"
              style={{ color: tone.ink70 }}
            >
              View all <IconChev />
            </Link>
          </div>
          <div>
            {recentInvoices.length === 0 ? (
              <div className="px-6 py-12 text-center text-[13px]" style={{ color: tone.ink50 }}>
                No invoices yet.{" "}
                <Link href="/invoices/new" className="underline">
                  Create your first
                </Link>
              </div>
            ) : (
              recentInvoices.map(({ invoice, buildingName }, i) => (
                <Link
                  key={invoice.id}
                  href={`/invoices/${invoice.id}`}
                  className="w-full flex items-center gap-4 px-6 py-4 text-left transition-colors hover:bg-[#FAF7F0]"
                  style={{
                    borderBottom: i < recentInvoices.length - 1 ? `1px solid ${tone.lineSoft}` : "none",
                  }}
                >
                  <div
                    className="w-10 h-10 rounded-md flex items-center justify-center font-serif"
                    style={{ background: tone.paperDeep, color: tone.ink70, fontSize: 17 }}
                  >
                    {(buildingName || "?").charAt(0)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-mono text-[13px]" style={{ color: tone.ink }}>
                      {invoice.invoiceNumber}
                    </div>
                    <div className="text-[12.5px] mt-0.5 truncate" style={{ color: tone.ink50 }}>
                      {buildingName || "—"} · Unit {invoice.unit} · {invoice.tenantName}
                    </div>
                  </div>
                  <div className="text-right">
                    <div
                      className="font-serif"
                      style={{ fontSize: 19, color: tone.ink, lineHeight: 1, letterSpacing: "-0.01em" }}
                    >
                      ${fmtMoney(invoice.totalAmount)}
                    </div>
                    <div className="mt-1.5">
                      <Pill
                        tone={
                          invoice.status === "sent"
                            ? "sent"
                            : invoice.status === "failed"
                            ? "failed"
                            : "draft"
                        }
                      >
                        {invoice.status === "sent"
                          ? "Sent"
                          : invoice.status === "failed"
                          ? "Failed"
                          : "Draft"}
                      </Pill>
                    </div>
                  </div>
                </Link>
              ))
            )}
          </div>
        </Card>

        <Card>
          <div className="px-6 py-5" style={{ borderBottom: `1px solid ${tone.lineSoft}` }}>
            <div
              className="font-serif"
              style={{ fontSize: 22, color: tone.ink, letterSpacing: "-0.01em" }}
            >
              Recent deals
            </div>
            <div className="text-[12px] mt-0.5" style={{ color: tone.ink50 }}>
              Last 5 signed leases
            </div>
          </div>
          <div>
            {recentDeals.length === 0 ? (
              <div className="px-6 py-12 text-center text-[13px]" style={{ color: tone.ink50 }}>
                No deals yet.{" "}
                <Link href="/deals/new" className="underline">
                  Create your first
                </Link>
              </div>
            ) : (
              recentDeals.map(({ deal, buildingName }, i) => {
                const primaryAgent = agentById.get(deal.primaryAgentId);
                return (
                  <Link
                    key={deal.id}
                    href={`/deals/${deal.id}`}
                    className="w-full flex items-center gap-4 px-6 py-4 text-left transition-colors hover:bg-[#FAF7F0]"
                    style={{
                      borderBottom: i < recentDeals.length - 1 ? `1px solid ${tone.lineSoft}` : "none",
                    }}
                  >
                    <div
                      className="w-10 h-10 rounded-md flex items-center justify-center font-serif"
                      style={{ background: tone.paperDeep, color: tone.ink70, fontSize: 17 }}
                    >
                      #{deal.id}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-[13px] truncate" style={{ color: tone.ink }}>
                        {buildingName || "—"} · Unit {deal.unit}
                      </div>
                      <div className="text-[12px] mt-0.5 truncate" style={{ color: tone.ink50 }}>
                        {deal.tenantName} · {primaryAgent?.name || "No agent"}
                      </div>
                    </div>
                    <div className="text-right">
                      <div
                        className="font-serif"
                        style={{ fontSize: 19, color: tone.ink, lineHeight: 1, letterSpacing: "-0.01em" }}
                      >
                        ${fmtMoney(Number(deal.totalCommission || 0))}
                      </div>
                      <div className="mt-1.5">
                        <Pill tone={deal.status === "cancelled" ? "failed" : deal.status === "completed" ? "sent" : "accent"}>
                          {deal.status}
                        </Pill>
                      </div>
                    </div>
                  </Link>
                );
              })
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}

// Suppress unused import lint
void fmtDate;
