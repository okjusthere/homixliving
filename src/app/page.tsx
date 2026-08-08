import type { ReactNode } from "react";
import Link from "next/link";
import {
  ArrowRight,
  BookOpenCheck,
  Building2,
  CalendarClock,
  ChartNoAxesCombined,
  CheckCircle2,
  CreditCard,
  FileText,
  Home,
  History,
  Mail,
  ReceiptText,
  Share2,
  TrendingUp,
} from "lucide-react";
import { and, desc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  agentPaymentProfiles,
  agents,
  buildings,
  commerceOrders,
  dealAgents,
  deals,
  saleDealAgents,
  saleDeals,
} from "@/db/schema";
import { tone, fmtMoney, fmtDate } from "@/components/homix/tokens";
import { Pill, Card } from "@/components/homix/server-primitives";
import { IconChev } from "@/components/homix/icons";
import { BillingPortalButton } from "@/components/homix/billing-portal-button";
import { requireActiveAgent } from "@/lib/auth-guards";
import { dealsVisibleToSql, saleDealsVisibleToSql } from "@/lib/visibility";
import { getLocale } from "@/lib/i18n";

export const dynamic = "force-dynamic";

const M = {
  en: {
    workbench: "Agent Workbench",
    newSales: "New sale",
    newRental: "New rental",
    share: "Share Center",
    rentalFile: "Rental file",
    rentalFileDetail: "Lease, agents, commission split",
    salesFile: "Sales file",
    salesFileDetail: "Contract, closing, referral",
    invoice: "Invoice",
    invoiceDetail: "Create and send billing",
    agentPayments: "Agent payments",
    agentPaymentsDetail: "Desk fees, email, services",
    nextSteps: "My next steps",
    nextStepsDetail: "Time-sensitive items across your files",
    closingSoon: "Closing soon",
    next60Days: "Next 60 days",
    leaseRenewals: "Lease renewals",
    next90Days: "Next 90 days",
    paymentProfile: "Payout profile",
    payoutReady: "ACH and W-9 ready",
    payoutMissing: "Complete ACH and W-9",
    ready: "Ready",
    toDo: "To do",
    activeSales: "Active sales",
    activeRentals: "Active rentals",
    completedMtd: "Completed this month",
    estimatedCommission: "Est. commission",
    estimatedCommissionDetail: "Your share across active files",
    recentFiles: "Recent files",
    recentFilesDetail: "Latest sales and rental activity",
    noFilesYet: "No sales or rental files yet.",
    noBuilding: "No building",
    unit: "Unit",
    sale: "Sale",
    rental: "Rental",
    active: "Active",
    completed: "Completed",
    cancelled: "Cancelled",
    preContract: "Pre-contract",
    underContract: "Under contract",
    postContract: "Post-contract",
    closed: "Closed",
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
    marketOverview: "Market overview",
    expiredListings: "Expired listings",
    monthlyReport: "Monthly report",
    goodMorning: "Good morning",
    goodAfternoon: "Good afternoon",
    goodEvening: "Good evening",
    agent: "Agent",
    workbenchLead: (sales: number, rentals: number, milestones: number) =>
      `${sales} active sale${sales === 1 ? "" : "s"}, ${rentals} active rental${
        rentals === 1 ? "" : "s"
      }, and ${milestones} upcoming milestone${milestones === 1 ? "" : "s"}.`,
    monthDetail: (month: string) => `${month} across both businesses`,
    activeSubscriptions: (count: number) =>
      `${count} active subscription${count === 1 ? "" : "s"}`,
  },
  zh: {
    workbench: "经纪人工作台",
    newSales: "新建买卖",
    newRental: "新建租约",
    share: "分享中心",
    rentalFile: "租赁档案",
    rentalFileDetail: "租约、经纪人、佣金分成",
    salesFile: "买卖档案",
    salesFileDetail: "合同、过户、推荐",
    invoice: "发票",
    invoiceDetail: "创建并发送账单",
    agentPayments: "经纪人付款",
    agentPaymentsDetail: "工位费、邮箱、服务",
    nextSteps: "我的下一步",
    nextStepsDetail: "买卖与租赁档案中的近期事项",
    closingSoon: "临近过户",
    next60Days: "未来 60 天",
    leaseRenewals: "租约续约",
    next90Days: "未来 90 天",
    paymentProfile: "收款资料",
    payoutReady: "ACH 与 W-9 已备齐",
    payoutMissing: "请补全 ACH 与 W-9",
    ready: "完成",
    toDo: "待办",
    activeSales: "进行中的买卖",
    activeRentals: "进行中的租赁",
    completedMtd: "本月已完成",
    estimatedCommission: "预计个人佣金",
    estimatedCommissionDetail: "当前进行中档案的个人分成",
    recentFiles: "最近档案",
    recentFilesDetail: "最新买卖与租赁动态",
    noFilesYet: "暂无买卖或租赁档案。",
    noBuilding: "无楼盘",
    unit: "单元",
    sale: "买卖",
    rental: "租赁",
    active: "进行中",
    completed: "已完成",
    cancelled: "已取消",
    preContract: "合同前",
    underContract: "已签合同",
    postContract: "过户准备",
    closed: "已过户",
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
    marketOverview: "市场概览",
    expiredListings: "已过期房源",
    monthlyReport: "月度报表",
    goodMorning: "早上好",
    goodAfternoon: "下午好",
    goodEvening: "晚上好",
    agent: "经纪人",
    workbenchLead: (sales: number, rentals: number, milestones: number) =>
      `有 ${sales} 笔买卖、${rentals} 笔租赁正在进行，${milestones} 个近期节点需要关注。`,
    monthDetail: (month: string) => `${month} 买卖与租赁合计`,
    activeSubscriptions: (count: number) => `${count} 个进行中的订阅`,
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

function dateKeyAfter(date: Date, days: number) {
  const result = new Date(date);
  result.setUTCDate(result.getUTCDate() + days);
  return result.toISOString().slice(0, 10);
}

export default async function Dashboard() {
  const session = await requireActiveAgent();
  const locale = await getLocale();
  const t = M[locale];
  const now = new Date();
  const currentMonth = now.toISOString().slice(0, 7);
  const monthStart = `${currentMonth}-01`;
  const nextMonthStart = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1)
  )
    .toISOString()
    .slice(0, 10);
  const today = now.toISOString().slice(0, 10);
  const sixtyDaysOut = dateKeyAfter(now, 60);
  const ninetyDaysOut = dateKeyAfter(now, 90);
  const rentalVisibility = dealsVisibleToSql(session);
  const salesVisibility = saleDealsVisibleToSql(session);
  const dashboardAgentId = session.user.agentId ?? -1;
  const userEmail = session.user.email?.trim().toLowerCase() || "";
  const rentalSummaryQuery = db
    .select({
      activeCount: sql<number>`count(*) filter (where ${deals.status} = 'active')`,
      completedMonth: sql<number>`count(*) filter (
        where ${deals.status} = 'completed'
          and coalesce(nullif(${deals.dealDate}::text, '')::date, nullif(${deals.updatedAt}::text, '')::date, nullif(${deals.createdAt}::text, '')::date) >= ${monthStart}::date
          and coalesce(nullif(${deals.dealDate}::text, '')::date, nullif(${deals.updatedAt}::text, '')::date, nullif(${deals.createdAt}::text, '')::date) < ${nextMonthStart}::date
      )`,
      upcomingRenewals: sql<number>`count(*) filter (
        where ${deals.status} = 'active'
          and ${deals.leaseEndDate} is not null
          and nullif(${deals.leaseEndDate}::text, '')::date <= ${ninetyDaysOut}::date
          and coalesce(${deals.renewalStatus}, 'pending') not in ('renewed', 'lost')
      )`,
      personalCommission: sql<number>`coalesce(sum(
        case
          when ${deals.status} = 'active' and ${dealAgents.agentId} is not null then
            greatest(
              0,
              ${deals.totalCommission} -
              case
                when ${deals.referrerType} = 'percent' then
                  ${deals.totalCommission} * least(100, greatest(0, coalesce(${deals.referrerAmount}, 0))) / 100.0
                when ${deals.referrerType} = 'flat' then
                  greatest(0, coalesce(${deals.referrerAmount}, 0))
                else 0
              end
            )
            * least(100, greatest(0, coalesce(${dealAgents.sharePct}, 0))) / 100.0
            * least(100, greatest(0, coalesce(${agents.splitPct}, 0))) / 100.0
          else 0
        end
      ), 0)::float8`,
    })
    .from(deals)
    .leftJoin(
      dealAgents,
      and(eq(dealAgents.dealId, deals.id), eq(dealAgents.agentId, dashboardAgentId))
    )
    .leftJoin(agents, eq(agents.id, dealAgents.agentId))
    .where(rentalVisibility);
  const salesSummaryQuery = db
    .select({
      activeCount: sql<number>`count(*) filter (where ${saleDeals.status} = 'active')`,
      completedMonth: sql<number>`count(*) filter (
        where ${saleDeals.status} = 'completed'
          and coalesce(nullif(${saleDeals.closingDate}::text, '')::date, nullif(${saleDeals.updatedAt}::text, '')::date, nullif(${saleDeals.createdAt}::text, '')::date) >= ${monthStart}::date
          and coalesce(nullif(${saleDeals.closingDate}::text, '')::date, nullif(${saleDeals.updatedAt}::text, '')::date, nullif(${saleDeals.createdAt}::text, '')::date) < ${nextMonthStart}::date
      )`,
      closingSoon: sql<number>`count(*) filter (
        where ${saleDeals.status} = 'active'
          and ${saleDeals.closingDate} is not null
          and nullif(${saleDeals.closingDate}::text, '')::date >= ${today}::date
          and nullif(${saleDeals.closingDate}::text, '')::date <= ${sixtyDaysOut}::date
      )`,
      personalCommission: sql<number>`coalesce(sum(
        case
          when ${saleDeals.status} = 'active' and ${saleDealAgents.agentId} is not null then
            greatest(
              0,
              ${saleDeals.grossCommission}
                - greatest(0, coalesce(${saleDeals.referralAmount}, 0))
                - greatest(0, coalesce(${saleDeals.brokerageFee}, 0))
            )
            * least(100, greatest(0, coalesce(${saleDealAgents.sharePct}, 0))) / 100.0
            * least(100, greatest(0, coalesce(${agents.splitPct}, 0))) / 100.0
          else 0
        end
      ), 0)::float8`,
    })
    .from(saleDeals)
    .leftJoin(
      saleDealAgents,
      and(
        eq(saleDealAgents.saleDealId, saleDeals.id),
        eq(saleDealAgents.agentId, dashboardAgentId)
      )
    )
    .leftJoin(agents, eq(agents.id, saleDealAgents.agentId))
    .where(salesVisibility);
  const recentRentalQuery = db
    .select({
      id: deals.id,
      unit: deals.unit,
      tenantName: deals.tenantName,
      totalCommission: deals.totalCommission,
      status: deals.status,
      sortAt: sql<string>`coalesce(${deals.updatedAt}::text, ${deals.createdAt}::text, '')`,
      buildingName: buildings.name,
    })
    .from(deals)
    .innerJoin(buildings, eq(buildings.id, deals.buildingId))
    .where(rentalVisibility)
    .orderBy(desc(deals.id))
    .limit(4);
  const recentSalesQuery = db
    .select({
      id: saleDeals.id,
      propertyAddress: saleDeals.propertyAddress,
      buyerNames: saleDeals.buyerNames,
      sellerNames: saleDeals.sellerNames,
      grossCommission: saleDeals.grossCommission,
      status: saleDeals.status,
      stage: saleDeals.stage,
      sortAt: sql<string>`coalesce(${saleDeals.updatedAt}::text, ${saleDeals.createdAt}::text, '')`,
    })
    .from(saleDeals)
    .where(salesVisibility)
    .orderBy(desc(saleDeals.id))
    .limit(4);

  const [
    rentalSummaryRows,
    salesSummaryRows,
    recentRentalRows,
    recentSalesRows,
    billingRows,
    paymentProfileRows,
  ] = await Promise.all([
    rentalSummaryQuery,
    salesSummaryQuery,
    recentRentalQuery,
    recentSalesQuery,
    db
      .select({
        productKey: commerceOrders.productKey,
        productName: commerceOrders.productName,
        billingMode: commerceOrders.billingMode,
        status: commerceOrders.status,
        stripeCustomerId: commerceOrders.stripeCustomerId,
        requestedWorkspaceEmail: commerceOrders.requestedWorkspaceEmail,
        workspaceStatus: commerceOrders.workspaceStatus,
        amountCents: commerceOrders.amountCents,
        createdAt: commerceOrders.createdAt,
        updatedAt: commerceOrders.updatedAt,
      })
      .from(commerceOrders)
      .where(eq(commerceOrders.customerEmail, userEmail))
      .orderBy(desc(commerceOrders.id))
      .limit(20),
    db
      .select({
        payeeName: agentPaymentProfiles.payeeName,
        routingNumber: agentPaymentProfiles.routingNumber,
        accountNumber: agentPaymentProfiles.accountNumber,
        w9ObjectKey: agentPaymentProfiles.w9ObjectKey,
      })
      .from(agentPaymentProfiles)
      .where(eq(agentPaymentProfiles.agentId, dashboardAgentId))
      .limit(1),
  ]);

  const rentalSummary = rentalSummaryRows[0];
  const salesSummary = salesSummaryRows[0];
  const activeRentalCount = Number(rentalSummary?.activeCount || 0);
  const activeSalesCount = Number(salesSummary?.activeCount || 0);
  const upcomingRenewalCount = Number(rentalSummary?.upcomingRenewals || 0);
  const closingSoonCount = Number(salesSummary?.closingSoon || 0);
  const completedMonthCount =
    Number(rentalSummary?.completedMonth || 0) + Number(salesSummary?.completedMonth || 0);
  const estimatedCommission =
    Number(rentalSummary?.personalCommission || 0) + Number(salesSummary?.personalCommission || 0);
  const paymentProfile = paymentProfileRows[0];
  const payoutReady = Boolean(
    paymentProfile?.payeeName &&
      paymentProfile.routingNumber &&
      paymentProfile.accountNumber &&
      paymentProfile.w9ObjectKey
  );
  const recentFiles = [
    ...recentRentalRows.map((deal) => ({
      type: "rental" as const,
      id: deal.id,
      href: `/rental/${deal.id}`,
      title: `${deal.buildingName || t.noBuilding} · ${t.unit} ${deal.unit}`,
      detail: `${t.rental} · ${deal.tenantName}`,
      amount: Number(deal.totalCommission || 0),
      status: deal.status,
      stage: null,
      sortAt: deal.sortAt,
    })),
    ...recentSalesRows.map((deal) => ({
      type: "sale" as const,
      id: deal.id,
      href: `/sales/${deal.id}`,
      title: deal.propertyAddress,
      detail: `${t.sale} · ${deal.buyerNames || deal.sellerNames || "—"}`,
      amount: Number(deal.grossCommission || 0),
      status: deal.status,
      stage: deal.stage,
      sortAt: deal.sortAt,
    })),
  ]
    .sort((a, b) => String(b.sortAt || "").localeCompare(String(a.sortAt || "")))
    .slice(0, 6);

  const sortedBillingRows = billingRows;
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
                {t.workbenchLead(
                  activeSalesCount,
                  activeRentalCount,
                  closingSoonCount + upcomingRenewalCount
                )}
              </p>
            </div>
            <div className="grid w-full shrink-0 grid-cols-2 gap-2 md:flex md:w-auto md:flex-wrap">
              <Link
                href="/share"
                className="col-span-2 inline-flex h-10 items-center justify-center gap-2 rounded-md px-4 text-[13px] font-medium transition hover:opacity-90 md:col-span-1"
                style={{ background: tone.ink, color: tone.card }}
              >
                <Share2 className="size-4" />
                {t.share}
              </Link>
              <Link
                href="/sales/new"
                className="inline-flex h-10 items-center justify-center gap-2 rounded-md border px-4 text-[13px] font-medium transition hover:bg-[#FAF7F0]"
                style={{ borderColor: tone.line, color: tone.ink }}
              >
                <Building2 className="size-4" />
                {t.newSales}
              </Link>
              <Link
                href="/rental/new"
                className="inline-flex h-10 items-center justify-center gap-2 rounded-md border px-4 text-[13px] font-medium transition hover:bg-[#FAF7F0]"
                style={{ borderColor: tone.line, color: tone.ink }}
              >
                <Home className="size-4" />
                {t.newRental}
              </Link>
            </div>
          </div>

          <div className="mt-6 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <ActionLink
              href="/sales"
              icon={<Building2 className="size-4" />}
              label={t.salesFile}
              detail={t.salesFileDetail}
            />
            <ActionLink
              href="/rental"
              icon={<Home className="size-4" />}
              label={t.rentalFile}
              detail={t.rentalFileDetail}
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
          <SectionTitle title={t.nextSteps} detail={t.nextStepsDetail} />
          <QueueRow
            href="/sales"
            label={t.closingSoon}
            value={closingSoonCount}
            detail={t.next60Days}
            toneKey="amber"
          />
          <QueueRow
            href="/rental/renewals"
            label={t.leaseRenewals}
            value={upcomingRenewalCount}
            detail={t.next90Days}
            toneKey="accent"
          />
          <QueueRow
            href="/profile"
            label={t.paymentProfile}
            value={payoutReady ? t.ready : t.toDo}
            detail={payoutReady ? t.payoutReady : t.payoutMissing}
            toneKey={payoutReady ? "green" : "amber"}
          />
        </Card>
      </section>

      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <StatusMetric
          label={t.activeSales}
          value={activeSalesCount}
          detail={t.salesFileDetail}
          toneKey="brand"
        />
        <StatusMetric
          label={t.activeRentals}
          value={activeRentalCount}
          detail={t.rentalFileDetail}
          toneKey="accent"
        />
        <StatusMetric
          label={t.completedMtd}
          value={completedMonthCount}
          detail={t.monthDetail(currentMonth)}
          toneKey="green"
        />
        <StatusMetric
          label={t.estimatedCommission}
          value={`$${fmtMoney(estimatedCommission)}`}
          detail={t.estimatedCommissionDetail}
          toneKey="ink"
        />
      </section>

      <section className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
        <Card className="overflow-hidden">
          <SectionTitle title={t.recentFiles} detail={t.recentFilesDetail} />
          <div>
            {recentFiles.length === 0 ? (
              <div className="px-5 py-10 text-center text-[13px]" style={{ color: tone.ink50 }}>
                {t.noFilesYet}{" "}
                <Link href="/sales/new" className="underline">
                  {t.newSales}
                </Link>
                {" · "}
                <Link href="/rental/new" className="underline">
                  {t.newRental}
                </Link>
              </div>
            ) : (
              recentFiles.map((file) => {
                const stageLabel =
                  file.stage === "under_contract"
                    ? t.underContract
                    : file.stage === "post_contract"
                    ? t.postContract
                    : file.stage === "closed"
                    ? t.closed
                    : t.preContract;
                const statusLabel =
                  file.status === "cancelled"
                    ? t.cancelled
                    : file.status === "completed"
                    ? t.completed
                    : file.type === "sale"
                    ? stageLabel
                    : t.active;
                return (
                  <ActivityRow
                    key={`${file.type}-${file.id}`}
                    href={file.href}
                    icon={
                      file.type === "sale" ? (
                        <Building2 className="size-4" />
                      ) : (
                        <Home className="size-4" />
                      )
                    }
                    title={file.title}
                    detail={`${file.detail} · ${fmtDate(file.sortAt)}`}
                    amount={`$${fmtMoney(file.amount)}`}
                    status={statusLabel}
                    statusTone={
                      file.status === "cancelled"
                        ? "failed"
                        : file.status === "completed" || file.stage === "closed"
                        ? "sent"
                        : "accent"
                    }
                  />
                );
              })
            )}
          </div>
        </Card>

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
                href="/market"
                className="flex items-center justify-between px-5 py-4 transition hover:bg-[#FAF7F0]"
                style={{ borderBottom: `1px solid ${tone.lineSoft}` }}
              >
                <span className="flex items-center gap-3 text-[13px]" style={{ color: tone.ink }}>
                  <ChartNoAxesCombined className="size-4 text-homix-green" />
                  {t.marketOverview}
                </span>
                <IconChev />
              </Link>
              <Link
                href="/expired-listings"
                className="flex items-center justify-between px-5 py-4 transition hover:bg-[#FAF7F0]"
                style={{ borderBottom: `1px solid ${tone.lineSoft}` }}
              >
                <span className="flex items-center gap-3 text-[13px]" style={{ color: tone.ink }}>
                  <History className="size-4 text-homix-amber" />
                  {t.expiredListings}
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
