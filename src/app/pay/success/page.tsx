import Link from "next/link";
import { and, eq } from "drizzle-orm";
import { CheckCircle2, Clock, Mail } from "lucide-react";
import { auth } from "@/auth";
import { db } from "@/db";
import { commerceOrders } from "@/db/schema";
import { commerceProductName, formatProductAmount } from "@/lib/commerce/catalog";
import { getLocale } from "@/lib/i18n";
import { commerceStatusLabel } from "@/lib/domain-labels";

const M = {
  en: {
    title: "Payment received",
    lead: "Stripe accepted the payment. Homix will finish internal processing from the payment confirmation.",
    order: "Order",
    product: "Product",
    amount: "Amount",
    status: "Status",
    companyEmail: "Company email",
    workspace: "Workspace",
    unavailable: "Order details are not available yet.",
    back: "Back to payments",
  },
  zh: {
    title: "付款已收到",
    lead: "Stripe 已接受付款，Homix 将根据付款确认完成后续内部处理。",
    order: "订单",
    product: "项目",
    amount: "金额",
    status: "状态",
    companyEmail: "公司邮箱",
    workspace: "Workspace 账号",
    unavailable: "订单详情暂时还不可用。",
    back: "返回缴费页面",
  },
} as const;

export const dynamic = "force-dynamic";

export default async function PaySuccessPage({
  searchParams,
}: {
  searchParams: Promise<{ session_id?: string | string[] }>;
}) {
  const locale = await getLocale();
  const t = M[locale];
  const params = await searchParams;
  const sessionId = typeof params.session_id === "string" ? params.session_id : "";
  const session = await auth();
  const [order] = sessionId
    ? await db
        .select()
        .from(commerceOrders)
        .where(and(
          eq(commerceOrders.stripeCheckoutSessionId, sessionId),
          eq(commerceOrders.agentId, session?.user?.agentId ?? -1),
        ))
        .limit(1)
    : [];

  return (
    <main className="min-h-screen bg-paper px-5 py-10 text-ink">
      <div className="mx-auto max-w-[720px] rounded-lg border border-line bg-white p-6 md:p-8">
        <div className="flex size-12 items-center justify-center rounded-md bg-homix-green-soft text-homix-green">
          <CheckCircle2 className="size-6" />
        </div>
        <h1 className="mt-6 font-serif text-[34px] leading-[1.05] sm:text-[42px]">{t.title}</h1>
        <p className="mt-3 text-[15px] leading-6 text-ink-70">
          {t.lead}
        </p>

        {order ? (
          <div className="mt-7 divide-y divide-line-soft rounded-lg border border-line">
            <div className="grid gap-1 px-4 py-3 text-[14px] sm:grid-cols-[140px_1fr] sm:gap-3">
              <span className="text-ink-50">{t.order}</span>
              <span className="font-mono">#{order.id}</span>
            </div>
            <div className="grid gap-1 px-4 py-3 text-[14px] sm:grid-cols-[140px_1fr] sm:gap-3">
              <span className="text-ink-50">{t.product}</span>
              <span>{commerceProductName(order.productKey, order.productName, locale)}</span>
            </div>
            <div className="grid gap-1 px-4 py-3 text-[14px] sm:grid-cols-[140px_1fr] sm:gap-3">
              <span className="text-ink-50">{t.amount}</span>
              <span className="font-mono">{formatProductAmount(order.amountCents)}</span>
            </div>
            <div className="grid gap-1 px-4 py-3 text-[14px] sm:grid-cols-[140px_1fr] sm:gap-3">
              <span className="text-ink-50">{t.status}</span>
              <span>{commerceStatusLabel(order.status, locale)}</span>
            </div>
            {order.requestedWorkspaceEmail && (
              <div className="grid gap-1 px-4 py-3 text-[14px] sm:grid-cols-[140px_1fr] sm:gap-3">
                <span className="text-ink-50">{t.companyEmail}</span>
                <span className="flex items-center gap-2">
                  <Mail className="size-4 text-homix-accent" />
                  {order.requestedWorkspaceEmail}
                </span>
              </div>
            )}
            {order.requestedWorkspaceEmail && (
              <div className="grid gap-1 px-4 py-3 text-[14px] sm:grid-cols-[140px_1fr] sm:gap-3">
                <span className="text-ink-50">{t.workspace}</span>
                <span className="flex items-center gap-2">
                  <Clock className="size-4 text-homix-amber" />
                  {commerceStatusLabel(order.workspaceStatus, locale)}
                </span>
              </div>
            )}
          </div>
        ) : (
          <div className="mt-7 rounded-md border border-line bg-paper-deep px-4 py-3 text-[14px] text-ink-70">
            {t.unavailable}
          </div>
        )}

        <div className="mt-8 flex flex-wrap gap-3">
          <Link
            href="/pay"
            className="inline-flex h-10 items-center justify-center rounded-md border border-line bg-white px-4 text-[14px] text-ink transition hover:bg-paper-deep"
          >
            {t.back}
          </Link>
        </div>
      </div>
    </main>
  );
}
