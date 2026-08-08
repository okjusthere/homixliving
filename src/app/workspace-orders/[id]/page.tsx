import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { RefreshCw } from "lucide-react";
import { db } from "@/db";
import { commerceOrders } from "@/db/schema";
import { requireActiveAgent } from "@/lib/auth-guards";
import { commerceProductName, formatProductAmount } from "@/lib/commerce/catalog";
import { fmtTimestamp } from "@/lib/db-time";
import { getLocale } from "@/lib/i18n";
import { commerceStatusLabel } from "@/lib/domain-labels";

const M = {
  en: {
    eyebrow: "Workspace order",
    order: (id: number) => `Order #${id}`,
    payments: "Payments",
    product: "Product",
    amount: "Amount",
    paymentStatus: "Payment status",
    companyEmail: "Company email",
    workspaceUserId: "Workspace user ID",
    updated: "Updated",
    workspaceStatus: "Workspace status",
    workspaceError: "Workspace error",
    retry: "Retry Workspace provisioning",
  },
  zh: {
    eyebrow: "Workspace 订单",
    order: (id: number) => `订单 #${id}`,
    payments: "缴费页面",
    product: "项目",
    amount: "金额",
    paymentStatus: "付款状态",
    companyEmail: "公司邮箱",
    workspaceUserId: "Workspace 用户编号",
    updated: "更新时间",
    workspaceStatus: "Workspace 状态",
    workspaceError: "Workspace 错误",
    retry: "重新尝试开通 Workspace",
  },
} as const;

export const dynamic = "force-dynamic";

function parseOrderId(raw: string): number | null {
  const parsed = Number(raw);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function statusClass(status: string) {
  if (status === "provisioned") return "border-homix-green-soft bg-homix-green-soft text-homix-green";
  if (status === "failed") return "border-homix-rose-soft bg-homix-rose-soft text-homix-rose";
  if (status === "pending_config") return "border-homix-amber-soft bg-homix-amber-soft text-homix-amber";
  return "border-line bg-paper-deep text-ink-70";
}

export default async function WorkspaceOrderPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await requireActiveAgent();
  if (!session.user.isAdmin) redirect("/");
  const locale = await getLocale();
  const t = M[locale];

  const { id } = await params;
  const orderId = parseOrderId(id);
  if (!orderId) notFound();

  const [order] = await db
    .select()
    .from(commerceOrders)
    .where(eq(commerceOrders.id, orderId))
    .limit(1);

  if (!order) notFound();

  return (
    <main className="min-h-screen bg-paper px-5 py-8 text-ink">
      <div className="mx-auto max-w-[860px]">
        <div className="flex flex-col gap-4 border-b border-line pb-6 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-[12px] uppercase tracking-[0.14em] text-ink-50">
              {t.eyebrow}
            </p>
            <h1 className="mt-2 break-words font-serif text-[34px] leading-[1.05] sm:text-[42px]">
              {t.order(order.id)}
            </h1>
          </div>
          <Link
            href="/pay"
            className="inline-flex h-10 items-center justify-center rounded-md border border-line bg-white px-4 text-[14px] text-ink transition hover:bg-paper-deep"
          >
            {t.payments}
          </Link>
        </div>

        <section className="mt-6 rounded-lg border border-line bg-white">
          <div className="grid gap-0 divide-y divide-line-soft">
            {[
              [t.product, commerceProductName(order.productKey, order.productName, locale)],
              [t.amount, formatProductAmount(order.amountCents)],
              [t.paymentStatus, commerceStatusLabel(order.status, locale)],
              [t.companyEmail, order.requestedWorkspaceEmail || "—"],
              [t.workspaceUserId, order.workspaceUserId || "—"],
              [t.updated, fmtTimestamp(order.updatedAt) || "—"],
            ].map(([label, value]) => (
              <div key={label} className="grid gap-1 px-4 py-3 text-[14px] sm:grid-cols-[170px_1fr] sm:gap-4">
                <span className="text-ink-50">{label}</span>
                <span className="min-w-0 break-words">{value}</span>
              </div>
            ))}
            <div className="grid gap-1 px-4 py-3 text-[14px] sm:grid-cols-[170px_1fr] sm:gap-4">
              <span className="text-ink-50">{t.workspaceStatus}</span>
              <span
                className={`inline-flex w-fit items-center rounded-md border px-2 py-1 capitalize ${statusClass(
                  order.workspaceStatus
                )}`}
              >
                {commerceStatusLabel(order.workspaceStatus, locale)}
              </span>
            </div>
          </div>
        </section>

        {order.workspaceError && (
          <section className="mt-5 rounded-lg border border-homix-rose-soft bg-white p-4">
            <p className="text-[12px] uppercase tracking-[0.14em] text-homix-rose">
              {t.workspaceError}
            </p>
            <pre className="mt-3 whitespace-pre-wrap break-words rounded-md bg-paper-deep p-3 text-[13px] leading-6 text-ink">
              {order.workspaceError}
            </pre>
          </section>
        )}

        <form action={`/workspace-orders/${order.id}/retry`} method="post" className="mt-6">
          <button
            type="submit"
            className="inline-flex h-11 items-center justify-center gap-2 rounded-md bg-ink px-4 text-[14px] font-medium text-white transition hover:bg-ink-70"
          >
            <RefreshCw className="size-4" />
            {t.retry}
          </button>
        </form>
      </div>
    </main>
  );
}
