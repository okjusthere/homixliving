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
import { getLocale } from "@/lib/i18n";

export const dynamic = "force-dynamic";

const M = {
  en: {
    workbench: "Agent Workbench",
    newRental: "New rental",
    rentalFile: "Rental file",
    rentalFileDetail: "Lease, agents, commission split",
    salesFile: "Sales file",
    salesFileDetail: "Contract, closing, referral",
    invoice: "Invoice",
    invoiceDetail: "Create and send billing",
    agentPayments: "Agent payments",
    agentPaymentsDetail: "Desk fees, email, services",
    priorityQueue: "Priority queue",
    priorityQueueDetail: "Open items for this account",
    draftInvoices: "Draft invoices",
    overdueReceivables: "Overdue receivables",
    leaseRenewals: "Lease renewals",
    next90Days: "Next 90 days",
    sendFailures: "Send failures",
    sendFailuresDetail: "Email or payment delivery",
    rentalMtd: "Rental MTD",
    commissionMtd: "Commission MTD",
    signedRentalValue: "Signed rental value",
    topAgent: "Top agent",
    noRentalsYet: "No rentals yet",
    buildings: "Buildings",
    recentInvoices: "Recent invoices",
    viewAll: "View all",
    noInvoicesYet: "No invoices yet.",
    createInvoice: "Create invoice",
    noBuilding: "No building",
    unit: "Unit",
    statusPaid: "Paid",
    statusAwaiting: "Awaiting",
    statusFailed: "Failed",
    statusDraft: "Draft",
    recentDeals: "Recent deals",
    activeThisMonth: "active this month",
    openRental: "Open rental",
    noRentalDealsYet: "No rental deals yet.",
    createRental: "Create rental",
    noAgent: "No agent",
    billingWorkspace: "Billing & workspace",
    billingWorkspaceDetail: "Stripe, subscriptions, company email",
    payments: "Payments",
    stripeCustomerPortal: "Stripe customer portal",
    noBillingProfile: "No billing profile connected",
    connected: "Connected",
    open: "Open",
    companyEmail: "Company email",
    deskFee: "Desk fee",
    noAnnualPlanYet: "No annual plan yet",
    latestPayment: "Latest payment",
    startFromPayments: "Start from the agent payments page",
    openPayments: "Open payments",
    notStarted: "Not started",
    agentTools: "Agent tools",
    agentToolsDetail: "Learning and operating references",
    trainingLibrary: "Training library",
    resources: "Resources",
    monthlyReport: "Monthly report",
    goodMorning: "Good morning",
    goodAfternoon: "Good afternoon",
    goodEvening: "Good evening",
    agent: "Agent",
    queueLead: (draft: number, renewals: number, waiting: string) =>
      `The queue has ${draft} draft invoice${draft === 1 ? "" : "s"}, ${renewals} renewal${
        renewals === 1 ? "" : "s"
      }, and $${waiting} waiting.`,
    visibleInvoices: (count: number, ytd: string) =>
      `${count} visible invoices · $${ytd} YTD`,
    activeCount: (count: number) => `${count} ${count === 1 ? "active" : "active"} this month`,
    activeSubscriptions: (count: number) =>
      `${count} active subscription${count === 1 ? "" : "s"}`,
    draftReady: (amount: string) => `$${amount} ready to review`,
    pastFirstCycle: (amount: string) => `$${amount} past the first cycle`,
    outOfState: (count: number) => `${count} out of state`,
    take: (amount: string) => `$${amount} take`,
  },
  zh: {
    workbench: "经纪人工作台",
    newRental: "新建租约",
    rentalFile: "租赁档案",
    rentalFileDetail: "租约、经纪人、佣金分成",
    salesFile: "买卖档案",
    salesFileDetail: "合同、过户、推荐",
    invoice: "发票",
    invoiceDetail: "创建并发送账单",
    agentPayments: "经纪人付款",
    agentPaymentsDetail: "工位费、邮箱、服务",
    priorityQueue: "优先事项",
    priorityQueueDetail: "本账户的待办事项",
    draftInvoices: "草稿发票",
    overdueReceivables: "逾期应收款",
    leaseRenewals: "租约续约",
    next90Days: "未来 90 天",
    sendFailures: "发送失败",
    sendFailuresDetail: "邮件或付款投递",
    rentalMtd: "本月租赁",
    commissionMtd: "本月佣金",
    signedRentalValue: "已签租赁金额",
    topAgent: "业绩第一",
    noRentalsYet: "暂无租赁",
    buildings: "楼盘",
    recentInvoices: "最近发票",
    viewAll: "查看全部",
    noInvoicesYet: "暂无发票。",
    createInvoice: "创建发票",
    noBuilding: "无楼盘",
    unit: "单元",
    statusPaid: "已付款",
    statusAwaiting: "待付款",
    statusFailed: "失败",
    statusDraft: "草稿",
    recentDeals: "最近交易",
    activeThisMonth: "本月进行中",
    openRental: "查看租赁",
    noRentalDealsYet: "暂无租赁交易。",
    createRental: "创建租赁",
    noAgent: "无经纪人",
    billingWorkspace: "账单与工作区",
    billingWorkspaceDetail: "Stripe、订阅、企业邮箱",
    payments: "付款",
    stripeCustomerPortal: "Stripe 客户门户",
    noBillingProfile: "未连接账单资料",
    connected: "已连接",
    open: "待开通",
    companyEmail: "企业邮箱",
    deskFee: "工位费",
    noAnnualPlanYet: "暂无年度方案",
    latestPayment: "最近付款",
    startFromPayments: "从经纪人付款页面开始",
    openPayments: "打开付款",
    notStarted: "未开始",
    agentTools: "经纪人工具",
    agentToolsDetail: "学习与操作参考",
    trainingLibrary: "培训资料库",
    resources: "资料",
    monthlyReport: "月度报表",
    goodMorning: "早上好",
    goodAfternoon: "下午好",
    goodEvening: "晚上好",
    agent: "经纪人",
    queueLead: (draft: number, renewals: number, waiting: string) =>
      `待处理 ${draft} 张草稿发票、${renewals} 笔续约，另有 $${waiting} 待收。`,
    visibleInvoices: (count: number, ytd: string) =>
      `${count} 张可见发票 · 年初至今 $${ytd}`,
    activeCount: (count: number) => `本月 ${count} 个进行中`,
    activeSubscriptions: (count: number) => `${count} 个进行中的订阅`,
    draftReady: (amount: string) => `$${amount} 待审核`,
    pastFirstCycle: (amount: string) => `$${amount} 已超首个账期`,
    outOfState: (count: number) => `${count} 个州外`,
    take: (amount: string) => `分得 $${amount}`,
  },
} as const;

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
}: {
  href: string;
  icon: ReactNode;
  label: string;
  detail: string;
}) {
  return (
    <Link
      href={href}
      className="group flex min-h-[92px] items-start justify-between rounded-xl border p-4 transition hover:-translate-y-0.5 hover:shadow-sm"
      style={{
        background: tone.card,
        borderColor: tone.line,
        color: tone.ink,
      }}
    >
      <div className="flex items-start gap-3">
        <span
          className="flex size-9 shrink-0 items-center justify-center rounded-md"
          style={{
            background: tone.paperDeep,
            color: tone.accent,
          }}
        >
          {icon}
        </span>
        <span>
          <span className="block text-[14px] font-medium">{label}</span>
          <span
            className="mt-1 block text-[12px] leading-5"
            style={{ color: tone.ink50 }}
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

function cleanStatus(status: string | null | undefined, notStarted: string) {
  if (!status) return notStarted;
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
  const locale = await getLocale();
  const t = M[locale];
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
  const greeting = hour < 12 ? t.goodMorning : hour < 18 ? t.goodAfternoon : t.goodEvening;
  const firstName =
    session.user.name?.trim().split(/\s+/)[0] ||
    session.user.email?.split("@")[0] ||
    t.agent;

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
                {t.workbench}
              </h1>
              <p className="mt-4 max-w-2xl text-[15px] leading-6" style={{ color: tone.ink70 }}>
                {greeting}, {firstName}.{" "}
                {t.queueLead(draftInvoicesCount, upcomingRenewals.length, fmtMoney(outstanding.total))}
              </p>
            </div>
            <Link
              href="/rental/new"
              className="inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-md border px-4 text-[13px] font-medium transition hover:bg-[#FAF7F0]"
              style={{ borderColor: tone.line, color: tone.ink }}
            >
              <Home className="size-4" />
              {t.newRental}
            </Link>
          </div>

          <div className="mt-6 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <ActionLink
              href="/rental/new"
              icon={<Home className="size-4" />}
              label={t.rentalFile}
              detail={t.rentalFileDetail}
            />
            <ActionLink
              href="/sales/new"
              icon={<Building2 className="size-4" />}
              label={t.salesFile}
              detail={t.salesFileDetail}
            />
            <ActionLink
              href="/invoices/new"
              icon={<ReceiptText className="size-4" />}
              label={t.invoice}
              detail={t.invoiceDetail}
            />
            <ActionLink
              href="/pay"
              icon={<CreditCard className="size-4" />}
              label={t.agentPayments}
              detail={t.agentPaymentsDetail}
            />
          </div>
        </div>

        <Card className="overflow-hidden">
          <SectionTitle title={t.priorityQueue} detail={t.priorityQueueDetail} />
          <QueueRow
            href="/invoices"
            label={t.draftInvoices}
            value={draftInvoicesCount}
            detail={t.draftReady(fmtMoney(draftAmount))}
            toneKey="amber"
          />
          <QueueRow
            href="/invoices"
            label={t.overdueReceivables}
            value={overdueCount}
            detail={t.pastFirstCycle(fmtMoney(overdueAmount))}
            toneKey={overdueCount > 0 ? "rose" : "green"}
          />
          <QueueRow
            href="/rental/renewals"
            label={t.leaseRenewals}
            value={upcomingRenewals.length}
            detail={t.next90Days}
            toneKey="accent"
          />
          <QueueRow
            href="/invoices"
            label={t.sendFailures}
            value={failedInvoicesCount}
            detail={t.sendFailuresDetail}
            toneKey={failedInvoicesCount > 0 ? "rose" : "green"}
          />
        </Card>
      </section>

      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <StatusMetric
          label={t.rentalMtd}
          value={mtdDeals.length}
          detail={currentMonth}
          toneKey="accent"
        />
        <StatusMetric
          label={t.commissionMtd}
          value={`$${fmtMoney(commissionMtd)}`}
          detail={t.signedRentalValue}
          toneKey="ink"
        />
        <StatusMetric
          label={t.topAgent}
          value={topAgent ? topAgent.name.split(" ")[0] : "—"}
          detail={topAgentEntry ? t.take(fmtMoney(topAgentEntry[1])) : t.noRentalsYet}
          toneKey="green"
        />
        <StatusMetric
          label={t.buildings}
          value={totalBuildingsCount}
          detail={t.outOfState(outOfStateCount)}
          toneKey="brand"
        />
      </section>

      <section className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
        <div className="grid gap-6 lg:grid-cols-2">
          <Card className="overflow-hidden">
            <SectionTitle
              title={t.recentInvoices}
              detail={t.visibleInvoices(totalInvoicesCount, fmtMoney(totalAmount))}
              href="/invoices"
              action={t.viewAll}
            />
            <div>
              {recentInvoices.length === 0 ? (
                <div className="px-5 py-10 text-center text-[13px]" style={{ color: tone.ink50 }}>
                  {t.noInvoicesYet}{" "}
                  <Link href="/invoices/new" className="underline">
                    {t.createInvoice}
                  </Link>
                </div>
              ) : (
                recentInvoices.map(({ invoice, buildingName }) => (
                  <ActivityRow
                    key={invoice.id}
                    href={`/invoices/${invoice.id}`}
                    icon={<FileText className="size-4" />}
                    title={invoice.invoiceNumber}
                    detail={`${buildingName || t.noBuilding} · ${t.unit} ${invoice.unit} · ${invoice.tenantName}`}
                    amount={`$${fmtMoney(invoice.totalAmount)}`}
                    status={
                      invoice.status === "paid"
                        ? t.statusPaid
                        : invoice.status === "sent"
                        ? t.statusAwaiting
                        : invoice.status === "failed"
                        ? t.statusFailed
                        : t.statusDraft
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
              title={t.recentDeals}
              detail={t.activeCount(mtdDeals.length)}
              href="/rental"
              action={t.openRental}
            />
            <div>
              {recentDeals.length === 0 ? (
                <div className="px-5 py-10 text-center text-[13px]" style={{ color: tone.ink50 }}>
                  {t.noRentalDealsYet}{" "}
                  <Link href="/rental/new" className="underline">
                    {t.createRental}
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
                      title={`${buildingName || t.noBuilding} · ${t.unit} ${deal.unit}`}
                      detail={`${deal.tenantName} · ${primaryAgent?.name || t.noAgent}`}
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
            <SectionTitle title={t.billingWorkspace} detail={t.billingWorkspaceDetail} href="/pay" action={t.payments} />
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
                      {t.stripeCustomerPortal}
                    </div>
                    <div className="mt-1 text-[12px] leading-5" style={{ color: tone.ink50 }}>
                      {hasStripeCustomer
                        ? t.activeSubscriptions(activeSubscriptionCount)
                        : t.noBillingProfile}
                    </div>
                  </div>
                </div>
                <Pill tone={hasStripeCustomer ? "sent" : "draft"}>
                  {hasStripeCustomer ? t.connected : t.open}
                </Pill>
              </div>

              <div className="mt-5 grid gap-3">
                <div className="rounded-lg border p-3" style={{ borderColor: tone.lineSoft, background: tone.paper }}>
                  <div className="flex items-center justify-between gap-3">
                    <span className="flex items-center gap-2 text-[12px]" style={{ color: tone.ink50 }}>
                      <Mail className="size-4" />
                      {t.companyEmail}
                    </span>
                    <Pill tone={billingStatusTone(workspaceOrder?.workspaceStatus)}>
                      {cleanStatus(workspaceOrder?.workspaceStatus, t.notStarted)}
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
                      {t.deskFee}
                    </span>
                    <Pill tone={billingStatusTone(deskFeeOrder?.status)}>
                      {cleanStatus(deskFeeOrder?.status, t.notStarted)}
                    </Pill>
                  </div>
                  <div className="mt-2 truncate text-[13px]" style={{ color: tone.ink }}>
                    {deskFeeOrder?.productName || t.noAnnualPlanYet}
                  </div>
                </div>

                <div className="rounded-lg border p-3" style={{ borderColor: tone.lineSoft, background: tone.paper }}>
                  <div className="flex items-center justify-between gap-3">
                    <span className="flex items-center gap-2 text-[12px]" style={{ color: tone.ink50 }}>
                      <CheckCircle2 className="size-4" />
                      {t.latestPayment}
                    </span>
                    <span className="text-[12px]" style={{ color: tone.ink50 }}>
                      {latestBillingOrder ? fmtDate(latestBillingOrder.updatedAt || latestBillingOrder.createdAt) : "—"}
                    </span>
                  </div>
                  <div className="mt-2 truncate text-[13px]" style={{ color: tone.ink }}>
                    {latestBillingOrder
                      ? `${latestBillingOrder.productName} · $${fmtMoney(latestBillingOrder.amountCents / 100)}`
                      : t.startFromPayments}
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
                  {t.openPayments}
                </Link>
              )}
            </div>
          </Card>

          <Card className="overflow-hidden">
            <SectionTitle title={t.agentTools} detail={t.agentToolsDetail} />
            <div className="grid gap-0">
              <Link
                href="/training"
                className="flex items-center justify-between px-5 py-4 transition hover:bg-[#FAF7F0]"
                style={{ borderBottom: `1px solid ${tone.lineSoft}` }}
              >
                <span className="flex items-center gap-3 text-[13px]" style={{ color: tone.ink }}>
                  <BookOpenCheck className="size-4 text-homix-green" />
                  {t.trainingLibrary}
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
                  {t.resources}
                </span>
                <IconChev />
              </Link>
              <Link
                href="/reports"
                className="flex items-center justify-between px-5 py-4 transition hover:bg-[#FAF7F0]"
              >
                <span className="flex items-center gap-3 text-[13px]" style={{ color: tone.ink }}>
                  <TrendingUp className="size-4 text-homix-amber" />
                  {t.monthlyReport}
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
