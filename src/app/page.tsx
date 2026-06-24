import type { ReactNode } from "react";
import Link from "next/link";
import {
  ArrowRight,
  BadgeDollarSign,
  BookOpenCheck,
  Building2,
  CalendarClock,
  CheckCircle2,
  CreditCard,
  FileText,
  Home,
  Mail,
  ReceiptText,
  TrendingUp,
} from "lucide-react";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { agents, buildings, commerceOrders, dealAgents, deals, invoices } from "@/db/schema";
import { tone, fmtMoney, fmtDate } from "@/components/homix/tokens";
import { Pill, Card } from "@/components/homix/server-primitives";
import { IconChev } from "@/components/homix/icons";
import { BillingPortalButton } from "@/components/homix/billing-portal-button";
import { computeCommission } from "@/lib/commission";
import { activeDeal, commissionAgentsForDeal, dealInMonth, getMonthKey } from "@/lib/reporting";
import { isUpcoming } from "@/lib/renewals";
import { summarize, totalOutstanding } from "@/lib/aging";
import { requireActiveAgent } from "@/lib/auth-guards";
import { dealsVisibleToSql } from "@/lib/visibility";

export const dynamic = "force-dynamic";

type ToneKey = "ink" | "accent" | "green" | "amber" | "rose" | "brand";

function toneValue(key: ToneKey) {
  return key === "accent"
    ? tone.accent
    : key === "green"
    ? tone.green
    : key === "amber"
    ? tone.amber
    : key === "rose"
    ? tone.rose
    : key === "brand"
    ? tone.brand
    : tone.ink;
}

function StatusMetric({
  label,
  value,
  detail,
  toneKey = "ink",
}: {
  label: string;
  value: ReactNode;
  detail: string;
  toneKey?: ToneKey;
}) {
  return (
    <div className="min-h-[118px] rounded-xl border bg-white p-5" style={{ borderColor: tone.line }}>
      <div className="text-[11px] font-medium uppercase tracking-[0.14em]" style={{ color: tone.ink50 }}>
        {label}
      </div>
      <div className="mt-3 font-serif text-[34px] leading-none" style={{ color: toneValue(toneKey) }}>
        {value}
      </div>
      <div className="mt-2 text-[12px] leading-5" style={{ color: tone.ink50 }}>
        {detail}
      </div>
    </div>
  );
}

function ActionLink({
  href,
  icon,
  label,
  detail,
  primary,
}: {
  href: string;
  icon: ReactNode;
  label: string;
  detail: string;
  primary?: boolean;
}) {
  return (
    <Link
      href={href}
      className="group flex min-h-[92px] items-start justify-between rounded-xl border p-4 transition hover:-translate-y-0.5 hover:shadow-sm"
      style={{
        background: primary ? tone.ink : tone.card,
        borderColor: primary ? tone.ink : tone.line,
        color: primary ? "#fff" : tone.ink,
      }}
    >
      <div className="flex items-start gap-3">
        <span
          className="flex size-9 shrink-0 items-center justify-center rounded-md"
          style={{
            background: primary ? "rgba(255,255,255,0.12)" : tone.paperDeep,
            color: primary ? "#fff" : tone.accent,
          }}
        >
          {icon}
        </span>
        <span>
          <span className="block text-[14px] font-medium">{label}</span>
          <span
            className="mt-1 block text-[12px] leading-5"
            style={{ color: primary ? "rgba(255,255,255,0.72)" : tone.ink50 }}
          >
            {detail}
          </span>
        </span>
      </div>
      <ArrowRight className="mt-1 size-4 shrink-0 opacity-50 transition group-hover:translate-x-0.5" />
    </Link>
  );
}

function QueueRow({
  href,
  label,
  value,
  detail,
  toneKey = "ink",
}: {
  href: string;
  label: string;
  value: ReactNode;
  detail: string;
  toneKey?: ToneKey;
}) {
  return (
    <Link
      href={href}
      className="flex items-center justify-between gap-4 px-5 py-4 transition hover:bg-[#FAF7F0]"
      style={{ borderBottom: `1px solid ${tone.lineSoft}` }}
    >
      <span>
        <span className="block text-[13px] font-medium" style={{ color: tone.ink }}>
          {label}
        </span>
        <span className="mt-0.5 block text-[12px]" style={{ color: tone.ink50 }}>
          {detail}
        </span>
      </span>
      <span className="font-serif text-[28px] leading-none" style={{ color: toneValue(toneKey) }}>
        {value}
      </span>
    </Link>
  );
}

function SectionTitle({
  title,
  detail,
  href,
  action,
}: {
  title: string;
  detail: string;
  href?: string;
  action?: string;
}) {
  return (
    <div className="flex items-center justify-between gap-4 px-5 py-4" style={{ borderBottom: `1px solid ${tone.lineSoft}` }}>
      <div>
        <h2 className="font-serif text-[23px] leading-none" style={{ color: tone.ink }}>
          {title}
        </h2>
        <div className="mt-1 text-[12px]" style={{ color: tone.ink50 }}>
          {detail}
        </div>
      </div>
      {href && action && (
        <Link href={href} className="flex items-center gap-1 text-[13px]" style={{ color: tone.ink70 }}>
          {action} <IconChev />
        </Link>
      )}
    </div>
  );
}

function ActivityRow({
  href,
  icon,
  title,
  detail,
  amount,
  status,
  statusTone = "neutral",
}: {
  href: string;
  icon: ReactNode;
  title: string;
  detail: string;
  amount: string;
  status: string;
  statusTone?: "neutral" | "sent" | "draft" | "failed" | "accent";
}) {
  return (
    <Link
      href={href}
      className="flex items-center gap-4 px-5 py-4 transition hover:bg-[#FAF7F0]"
      style={{ borderBottom: `1px solid ${tone.lineSoft}` }}
    >
      <span
        className="flex size-10 shrink-0 items-center justify-center rounded-md"
        style={{ background: tone.paperDeep, color: tone.ink70 }}
      >
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[13px] font-medium" style={{ color: tone.ink }}>
          {title}
        </span>
        <span className="mt-0.5 block truncate text-[12px]" style={{ color: tone.ink50 }}>
          {detail}
        </span>
      </span>
      <span className="shrink-0 text-right">
        <span className="block font-serif text-[18px] leading-none" style={{ color: tone.ink }}>
          {amount}
        </span>
        <span className="mt-2 block">
          <Pill tone={statusTone}>{status}</Pill>
        </span>
      </span>
    </Link>
  );
}

function cleanStatus(status?: string | null) {
  if (!status) return "Not started";
  return status.replaceAll("_", " ");
}

function billingStatusTone(status?: string | null): "neutral" | "sent" | "draft" | "failed" | "accent" {
  if (status === "active" || status === "paid" || status === "provisioned") return "sent";
  if (status === "past_due" || status === "failed") return "failed";
  if (status === "pending" || status === "open") return "draft";
  if (status === "canceled" || status === "expired" || status === "suspended") return "neutral";
  return "accent";
}

export default async function Dashboard() {
  const session = await requireActiveAgent();
  const now = new Date();
  const currentMonth = getMonthKey(now);
  const visibilityFilter = dealsVisibleToSql(session);
  const userEmail = session.user.email?.trim().toLowerCase() || "";
  const [
    buildingRows,
    invoiceRows,
    allAgentRows,
    allDealAgentRows,
    allDealRows,
    billingRows,
  ] = await Promise.all([
    db.select().from(buildings),
    db.select().from(invoices),
    db.select().from(agents),
    db.select().from(dealAgents),
    visibilityFilter
      ? db.select().from(deals).where(visibilityFilter)
      : db.select().from(deals),
    db.select().from(commerceOrders).where(eq(commerceOrders.customerEmail, userEmail)),
  ]);

  const visibleDealIds = new Set(allDealRows.map((deal) => deal.id));
  const visibleInvoiceRows = session.user.isAdmin
    ? invoiceRows
    : invoiceRows.filter((invoice) => {
        if (invoice.dealId) return visibleDealIds.has(invoice.dealId);
        return invoice.agentEmail?.toLowerCase() === userEmail;
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
    .slice(0, 4)
    .map((invoice) => ({
      invoice,
      buildingName: invoice.buildingId ? buildingById.get(invoice.buildingId)?.name || null : null,
    }));

  const recentDeals = [...allDealRows]
    .sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")))
    .slice(0, 4)
    .map((deal) => ({
      deal,
      buildingName: buildingById.get(deal.buildingId)?.name || null,
    }));

  const sortedBillingRows = [...billingRows].sort((a, b) =>
    String(b.updatedAt || b.createdAt || "").localeCompare(String(a.updatedAt || a.createdAt || ""))
  );
  const latestBillingOrder = sortedBillingRows[0] || null;
  const workspaceOrder = sortedBillingRows.find((order) => order.productKey === "company_domain_email") || null;
  const deskFeeOrder =
    sortedBillingRows.find(
      (order) => order.productKey === "elite_desk_fee" || order.productKey === "growth_desk_fee"
    ) || null;
  const hasStripeCustomer = sortedBillingRows.some((order) => Boolean(order.stripeCustomerId));
  const activeSubscriptionCount = sortedBillingRows.filter(
    (order) => order.billingMode === "subscription" && order.status === "active"
  ).length;

  const longDate = now.toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
  const hour = now.getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
  const firstName =
    session.user.name?.trim().split(/\s+/)[0] ||
    session.user.email?.split("@")[0] ||
    "Agent";

  return (
    <div className="space-y-6">
      <section className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">
        <div className="rounded-xl border bg-white p-6 md:p-7" style={{ borderColor: tone.line }}>
          <div className="flex flex-col gap-5 md:flex-row md:items-start md:justify-between">
            <div>
              <div className="text-[11px] font-medium uppercase tracking-[0.16em]" style={{ color: tone.ink50 }}>
                {longDate}
              </div>
              <h1 className="mt-3 font-serif text-[44px] leading-[1.02] md:text-[54px]" style={{ color: tone.ink }}>
                Agent Workbench
              </h1>
              <p className="mt-4 max-w-2xl text-[15px] leading-6" style={{ color: tone.ink70 }}>
                {greeting}, {firstName}. The queue has {draftInvoicesCount} draft invoice
                {draftInvoicesCount === 1 ? "" : "s"}, {upcomingRenewals.length} renewal
                {upcomingRenewals.length === 1 ? "" : "s"}, and ${fmtMoney(outstanding.total)} waiting.
              </p>
            </div>
            <Link
              href="/rental/new"
              className="inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-md bg-ink px-4 text-[13px] font-medium text-white transition hover:bg-ink-70"
            >
              <Home className="size-4" />
              New rental
            </Link>
          </div>

          <div className="mt-6 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <ActionLink
              href="/rental/new"
              icon={<Home className="size-4" />}
              label="Rental file"
              detail="Lease, agents, commission split"
              primary
            />
            <ActionLink
              href="/sales/new"
              icon={<Building2 className="size-4" />}
              label="Sales file"
              detail="Contract, closing, referral"
            />
            <ActionLink
              href="/invoices/new"
              icon={<ReceiptText className="size-4" />}
              label="Invoice"
              detail="Create and send billing"
            />
            <ActionLink
              href="/pay"
              icon={<CreditCard className="size-4" />}
              label="Agent payments"
              detail="Desk fees, email, services"
            />
          </div>
        </div>

        <Card className="overflow-hidden">
          <SectionTitle title="Priority queue" detail="Open items for this account" />
          <QueueRow
            href="/invoices"
            label="Draft invoices"
            value={draftInvoicesCount}
            detail={`$${fmtMoney(draftAmount)} ready to review`}
            toneKey="amber"
          />
          <QueueRow
            href="/invoices"
            label="Overdue receivables"
            value={overdueCount}
            detail={`$${fmtMoney(overdueAmount)} past the first cycle`}
            toneKey={overdueCount > 0 ? "rose" : "green"}
          />
          <QueueRow
            href="/rental/renewals"
            label="Lease renewals"
            value={upcomingRenewals.length}
            detail="Next 90 days"
            toneKey="accent"
          />
          <QueueRow
            href="/invoices"
            label="Send failures"
            value={failedInvoicesCount}
            detail="Email or payment delivery"
            toneKey={failedInvoicesCount > 0 ? "rose" : "green"}
          />
        </Card>
      </section>

      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <StatusMetric
          label="Rental MTD"
          value={mtdDeals.length}
          detail={currentMonth}
          toneKey="accent"
        />
        <StatusMetric
          label="Commission MTD"
          value={`$${fmtMoney(commissionMtd)}`}
          detail="Signed rental value"
          toneKey="ink"
        />
        <StatusMetric
          label="Top agent"
          value={topAgent ? topAgent.name.split(" ")[0] : "—"}
          detail={topAgentEntry ? `$${fmtMoney(topAgentEntry[1])} take` : "No rentals yet"}
          toneKey="green"
        />
        <StatusMetric
          label="Buildings"
          value={totalBuildingsCount}
          detail={`${outOfStateCount} out of state`}
          toneKey="brand"
        />
      </section>

      <section className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
        <div className="grid gap-6 lg:grid-cols-2">
          <Card className="overflow-hidden">
            <SectionTitle
              title="Recent invoices"
              detail={`${totalInvoicesCount} visible invoices · $${fmtMoney(totalAmount)} YTD`}
              href="/invoices"
              action="View all"
            />
            <div>
              {recentInvoices.length === 0 ? (
                <div className="px-5 py-10 text-center text-[13px]" style={{ color: tone.ink50 }}>
                  No invoices yet.{" "}
                  <Link href="/invoices/new" className="underline">
                    Create invoice
                  </Link>
                </div>
              ) : (
                recentInvoices.map(({ invoice, buildingName }) => (
                  <ActivityRow
                    key={invoice.id}
                    href={`/invoices/${invoice.id}`}
                    icon={<FileText className="size-4" />}
                    title={invoice.invoiceNumber}
                    detail={`${buildingName || "No building"} · Unit ${invoice.unit} · ${invoice.tenantName}`}
                    amount={`$${fmtMoney(invoice.totalAmount)}`}
                    status={
                      invoice.status === "paid"
                        ? "Paid"
                        : invoice.status === "sent"
                        ? "Awaiting"
                        : invoice.status === "failed"
                        ? "Failed"
                        : "Draft"
                    }
                    statusTone={
                      invoice.status === "paid"
                        ? "sent"
                        : invoice.status === "sent"
                        ? "accent"
                        : invoice.status === "failed"
                        ? "failed"
                        : "draft"
                    }
                  />
                ))
              )}
            </div>
          </Card>

          <Card className="overflow-hidden">
            <SectionTitle
              title="Recent deals"
              detail={`${mtdDeals.length} active this month`}
              href="/rental"
              action="Open rental"
            />
            <div>
              {recentDeals.length === 0 ? (
                <div className="px-5 py-10 text-center text-[13px]" style={{ color: tone.ink50 }}>
                  No rental deals yet.{" "}
                  <Link href="/rental/new" className="underline">
                    Create rental
                  </Link>
                </div>
              ) : (
                recentDeals.map(({ deal, buildingName }) => {
                  const primaryDealAgent = allDealAgentRows.find(
                    (row) => row.dealId === deal.id && row.isPrimary
                  );
                  const primaryAgent = primaryDealAgent
                    ? agentById.get(primaryDealAgent.agentId)
                    : null;
                  return (
                    <ActivityRow
                      key={deal.id}
                      href={`/rental/${deal.id}`}
                      icon={<BadgeDollarSign className="size-4" />}
                      title={`${buildingName || "No building"} · Unit ${deal.unit}`}
                      detail={`${deal.tenantName} · ${primaryAgent?.name || "No agent"}`}
                      amount={`$${fmtMoney(Number(deal.totalCommission || 0))}`}
                      status={deal.status}
                      statusTone={
                        deal.status === "cancelled"
                          ? "failed"
                          : deal.status === "completed"
                          ? "sent"
                          : "accent"
                      }
                    />
                  );
                })
              )}
            </div>
          </Card>
        </div>

        <div className="space-y-6">
          <Card className="overflow-hidden">
            <SectionTitle title="Billing & workspace" detail="Stripe, subscriptions, company email" href="/pay" action="Payments" />
            <div className="p-5">
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-start gap-3">
                  <span
                    className="flex size-10 items-center justify-center rounded-md"
                    style={{ background: tone.accentSoft, color: tone.accent }}
                  >
                    <CreditCard className="size-5" />
                  </span>
                  <div>
                    <div className="text-[13px] font-medium" style={{ color: tone.ink }}>
                      Stripe customer portal
                    </div>
                    <div className="mt-1 text-[12px] leading-5" style={{ color: tone.ink50 }}>
                      {hasStripeCustomer
                        ? `${activeSubscriptionCount} active subscription${activeSubscriptionCount === 1 ? "" : "s"}`
                        : "No billing profile connected"}
                    </div>
                  </div>
                </div>
                <Pill tone={hasStripeCustomer ? "sent" : "draft"}>
                  {hasStripeCustomer ? "Connected" : "Open"}
                </Pill>
              </div>

              <div className="mt-5 grid gap-3">
                <div className="rounded-lg border p-3" style={{ borderColor: tone.lineSoft, background: tone.paper }}>
                  <div className="flex items-center justify-between gap-3">
                    <span className="flex items-center gap-2 text-[12px]" style={{ color: tone.ink50 }}>
                      <Mail className="size-4" />
                      Company email
                    </span>
                    <Pill tone={billingStatusTone(workspaceOrder?.workspaceStatus)}>
                      {cleanStatus(workspaceOrder?.workspaceStatus)}
                    </Pill>
                  </div>
                  <div className="mt-2 truncate text-[13px]" style={{ color: tone.ink }}>
                    {workspaceOrder?.requestedWorkspaceEmail || "name@homixny.com"}
                  </div>
                </div>

                <div className="rounded-lg border p-3" style={{ borderColor: tone.lineSoft, background: tone.paper }}>
                  <div className="flex items-center justify-between gap-3">
                    <span className="flex items-center gap-2 text-[12px]" style={{ color: tone.ink50 }}>
                      <CalendarClock className="size-4" />
                      Desk fee
                    </span>
                    <Pill tone={billingStatusTone(deskFeeOrder?.status)}>
                      {cleanStatus(deskFeeOrder?.status)}
                    </Pill>
                  </div>
                  <div className="mt-2 truncate text-[13px]" style={{ color: tone.ink }}>
                    {deskFeeOrder?.productName || "No annual plan yet"}
                  </div>
                </div>

                <div className="rounded-lg border p-3" style={{ borderColor: tone.lineSoft, background: tone.paper }}>
                  <div className="flex items-center justify-between gap-3">
                    <span className="flex items-center gap-2 text-[12px]" style={{ color: tone.ink50 }}>
                      <CheckCircle2 className="size-4" />
                      Latest payment
                    </span>
                    <span className="text-[12px]" style={{ color: tone.ink50 }}>
                      {latestBillingOrder ? fmtDate(latestBillingOrder.updatedAt || latestBillingOrder.createdAt) : "—"}
                    </span>
                  </div>
                  <div className="mt-2 truncate text-[13px]" style={{ color: tone.ink }}>
                    {latestBillingOrder
                      ? `${latestBillingOrder.productName} · $${fmtMoney(latestBillingOrder.amountCents / 100)}`
                      : "Start from the agent payments page"}
                  </div>
                </div>
              </div>

              {hasStripeCustomer ? (
                <BillingPortalButton className="mt-5" />
              ) : (
                <Link
                  href="/pay"
                  className="mt-5 inline-flex h-10 w-full items-center justify-center gap-2 rounded-md bg-ink px-4 text-[13px] font-medium text-white transition hover:bg-ink-70"
                >
                  <CreditCard className="size-4" />
                  Open payments
                </Link>
              )}
            </div>
          </Card>

          <Card className="overflow-hidden">
            <SectionTitle title="Agent tools" detail="Learning and operating references" />
            <div className="grid gap-0">
              <Link
                href="/training"
                className="flex items-center justify-between px-5 py-4 transition hover:bg-[#FAF7F0]"
                style={{ borderBottom: `1px solid ${tone.lineSoft}` }}
              >
                <span className="flex items-center gap-3 text-[13px]" style={{ color: tone.ink }}>
                  <BookOpenCheck className="size-4 text-homix-green" />
                  Training library
                </span>
                <IconChev />
              </Link>
              <Link
                href="/resources"
                className="flex items-center justify-between px-5 py-4 transition hover:bg-[#FAF7F0]"
                style={{ borderBottom: `1px solid ${tone.lineSoft}` }}
              >
                <span className="flex items-center gap-3 text-[13px]" style={{ color: tone.ink }}>
                  <FileText className="size-4 text-homix-accent" />
                  Resources
                </span>
                <IconChev />
              </Link>
              <Link
                href="/reports"
                className="flex items-center justify-between px-5 py-4 transition hover:bg-[#FAF7F0]"
              >
                <span className="flex items-center gap-3 text-[13px]" style={{ color: tone.ink }}>
                  <TrendingUp className="size-4 text-homix-amber" />
                  Monthly report
                </span>
                <IconChev />
              </Link>
            </div>
          </Card>
        </div>
      </section>
    </div>
  );
}
