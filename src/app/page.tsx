import Link from "next/link";
import { db } from "@/db";
import { agents, buildings, dealAgents, deals, invoices } from "@/db/schema";
import { tone, fmtMoney, fmtDate } from "@/components/homix/tokens";
import { Pill, Card } from "@/components/homix/server-primitives";
import { IconChev } from "@/components/homix/icons";
import { DashboardCTA } from "@/components/homix/dashboard-cta";
import { computeCommission } from "@/lib/commission";
import { activeDeal, commissionAgentsForDeal, dealInMonth, getMonthKey } from "@/lib/reporting";
import { isUpcoming } from "@/lib/renewals";
import { summarize, totalOutstanding } from "@/lib/aging";
import { requireActiveAgent } from "@/lib/auth-guards";
import { dealsVisibleToSql } from "@/lib/visibility";

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
  const session = await requireActiveAgent();
  const now = new Date();
  const currentMonth = getMonthKey(now);
  const visibilityFilter = dealsVisibleToSql(session);
  const [buildingRows, invoiceRows, allAgentRows, allDealAgentRows, allDealRows] = await Promise.all([
    db.select().from(buildings),
    db.select().from(invoices),
    db.select().from(agents),
    db.select().from(dealAgents),
    visibilityFilter
      ? db.select().from(deals).where(visibilityFilter)
      : db.select().from(deals),
  ]);

  const visibleDealIds = new Set(allDealRows.map((deal) => deal.id));
  const visibleInvoiceRows = session.user.isAdmin
    ? invoiceRows
    : invoiceRows.filter((invoice) => {
        if (invoice.dealId) return visibleDealIds.has(invoice.dealId);
        return invoice.agentEmail?.toLowerCase() === session.user.email?.toLowerCase();
      });

  const totalBuildingsCount = buildingRows.length;
  const totalInvoicesCount = visibleInvoiceRows.length;
  const draftInvoicesCount = visibleInvoiceRows.filter((invoice) => invoice.status === "draft").length;
  const failedInvoicesCount = visibleInvoiceRows.filter((invoice) => invoice.status === "failed").length;
  const totalAmount = visibleInvoiceRows.reduce((sum, invoice) => sum + Number(invoice.totalAmount || 0), 0);
  const draftAmount = visibleInvoiceRows
    .filter((invoice) => invoice.status === "draft")
    .reduce((sum, invoice) => sum + Number(invoice.totalAmount || 0), 0);
  const outOfStateCount = buildingRows.filter((building) => building.isOutOfState).length;

  const sentInvoiceRows = visibleInvoiceRows
    .filter((invoice) => invoice.status === "sent")
    .map((invoice) => ({
      status: invoice.status,
      sentAt: invoice.sentAt,
      totalAmount: invoice.totalAmount,
    }));
  const agingSummary = summarize(sentInvoiceRows);
  const outstanding = totalOutstanding(agingSummary);
  const overdueAmount =
    agingSummary["30-60"].total +
    agingSummary["60-90"].total +
    agingSummary["90+"].total;
  const overdueCount =
    agingSummary["30-60"].count +
    agingSummary["60-90"].count +
    agingSummary["90+"].count;

  const upcomingRenewals = allDealRows.filter(isUpcoming);
  const agentById = new Map(allAgentRows.map((agent) => [agent.id, agent]));
  const mtdDeals = allDealRows.filter((deal) => activeDeal(deal) && dealInMonth(deal, currentMonth));
  const commissionMtd = mtdDeals.reduce((sum, deal) => sum + Number(deal.totalCommission || 0), 0);
  const agentTakeById = new Map<number, number>();
  for (const deal of mtdDeals) {
    const participants = commissionAgentsForDeal({
      dealId: deal.id,
      dealAgents: allDealAgentRows,
      agents: allAgentRows,
    });
    const breakdown = computeCommission({
      totalCommission: Number(deal.totalCommission || 0),
      referrer:
        deal.referrerType === "percent" || deal.referrerType === "flat"
          ? { type: deal.referrerType, amount: Number(deal.referrerAmount || 0) }
          : null,
      agents: participants,
    });
    for (const participant of breakdown.agents) {
      agentTakeById.set(
        participant.agentId,
        (agentTakeById.get(participant.agentId) || 0) + participant.agentTake
      );
    }
  }
  const topAgentEntry = Array.from(agentTakeById.entries()).sort((a, b) => b[1] - a[1])[0];
  const topAgent = topAgentEntry ? agentById.get(topAgentEntry[0]) : null;

  const buildingById = new Map(buildingRows.map((building) => [building.id, building]));
  const recentInvoices = [...visibleInvoiceRows]
    .sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")))
    .slice(0, 5)
    .map((invoice) => ({
      invoice,
      buildingName: invoice.buildingId ? buildingById.get(invoice.buildingId)?.name || null : null,
    }));

  const recentDeals = [...allDealRows]
    .sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")))
    .slice(0, 5)
    .map((deal) => ({
      deal,
      buildingName: buildingById.get(deal.buildingId)?.name || null,
    }));

  const longDate = now.toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
  const hour = now.getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";

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
            {draftInvoicesCount} invoice{draftInvoicesCount === 1 ? "" : "s"} waiting to send
            {failedInvoicesCount > 0 && `, ${failedInvoicesCount} need attention`}.
            {" "}
            <span style={{ color: tone.ink }}>
              ${fmtMoney(draftAmount)}
            </span>{" "}
            in draft.
          </p>
        </div>
        <DashboardCTA />
      </div>

      {/* Rental KPI ribbon */}
      <Card style={{ overflow: "hidden" }}>
        <div className="grid grid-cols-4">
          <div style={{ borderRight: `1px solid ${tone.line}` }}>
            <Stat
              label="Rental MTD"
              value={mtdDeals.length}
              sub={currentMonth}
              toneKey="accent"
            />
          </div>
          <div style={{ borderRight: `1px solid ${tone.line}` }}>
            <Stat
              label="Commission MTD"
              value={`$${fmtMoney(commissionMtd)}`}
              sub="Signed rental value"
              big
            />
          </div>
          <div style={{ borderRight: `1px solid ${tone.line}` }}>
            <Stat
              label="Top Agent MTD"
              value={topAgent ? topAgent.name.split(" ")[0] : "—"}
              sub={topAgentEntry ? `$${fmtMoney(topAgentEntry[1])} take` : "No rentals yet"}
              toneKey="green"
            />
          </div>
          <div>
            <Stat
              label="Pending Invoices"
              value={draftInvoicesCount}
              sub={`$${fmtMoney(draftAmount)} in draft`}
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
              value={`$${fmtMoney(totalAmount)}`}
              sub={`Across ${totalInvoicesCount} invoice${totalInvoicesCount === 1 ? "" : "s"}`}
              big
            />
          </div>
          <div style={{ borderRight: `1px solid ${tone.line}` }}>
            <Stat
              label="Outstanding"
              value={`$${fmtMoney(outstanding.total)}`}
              sub={
                overdueCount > 0
                  ? `$${fmtMoney(overdueAmount)} overdue · ${overdueCount} late`
                  : `${outstanding.count} sent · all current`
              }
              toneKey={overdueAmount > 0 ? "amber" : "green"}
            />
          </div>
          <Link href="/rental/renewals" style={{ borderRight: `1px solid ${tone.line}` }}>
            <Stat
              label="Renewals 90d"
              value={upcomingRenewals.length}
              sub={
                upcomingRenewals.length > 0
                  ? "Open rental follow-ups"
                  : "No upcoming leases"
              }
              toneKey="accent"
            />
          </Link>
          <div>
            <Stat
              label="Buildings"
              value={totalBuildingsCount}
              sub={`${outOfStateCount} out of state`}
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
                          invoice.status === "paid"
                            ? "sent"
                            : invoice.status === "sent"
                            ? "accent"
                            : invoice.status === "failed"
                            ? "failed"
                            : "draft"
                        }
                      >
                        {invoice.status === "paid"
                          ? "Paid"
                          : invoice.status === "sent"
                          ? "Awaiting"
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
              Recent rental
            </div>
            <div className="text-[12px] mt-0.5" style={{ color: tone.ink50 }}>
              Last 5 signed leases
            </div>
          </div>
          <div>
            {recentDeals.length === 0 ? (
              <div className="px-6 py-12 text-center text-[13px]" style={{ color: tone.ink50 }}>
                No rental deals yet.{" "}
                <Link href="/rental/new" className="underline">
                  Create your first rental
                </Link>
              </div>
            ) : (
              recentDeals.map(({ deal, buildingName }, i) => {
                const primaryDealAgent = allDealAgentRows.find(
                  (row) => row.dealId === deal.id && row.isPrimary
                );
                const primaryAgent = primaryDealAgent
                  ? agentById.get(primaryDealAgent.agentId)
                  : null;
                return (
                  <Link
                    key={deal.id}
                    href={`/rental/${deal.id}`}
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
