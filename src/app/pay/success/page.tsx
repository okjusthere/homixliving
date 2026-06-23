import Link from "next/link";
import { eq } from "drizzle-orm";
import { CheckCircle2, Clock, Mail } from "lucide-react";
import { db } from "@/db";
import { commerceOrders } from "@/db/schema";
import { formatProductAmount } from "@/lib/commerce/catalog";

export const dynamic = "force-dynamic";

export default async function PaySuccessPage({
  searchParams,
}: {
  searchParams: Promise<{ session_id?: string | string[] }>;
}) {
  const params = await searchParams;
  const sessionId = typeof params.session_id === "string" ? params.session_id : "";
  const [order] = sessionId
    ? await db
        .select()
        .from(commerceOrders)
        .where(eq(commerceOrders.stripeCheckoutSessionId, sessionId))
        .limit(1)
    : [];

  return (
    <main className="min-h-screen bg-paper px-5 py-10 text-ink">
      <div className="mx-auto max-w-[720px] rounded-lg border border-line bg-white p-6 md:p-8">
        <div className="flex size-12 items-center justify-center rounded-md bg-homix-green-soft text-homix-green">
          <CheckCircle2 className="size-6" />
        </div>
        <h1 className="mt-6 font-serif text-[42px] leading-[1.05]">Payment received</h1>
        <p className="mt-3 text-[15px] leading-6 text-ink-70">
          Stripe has accepted the checkout. Homix will use the payment confirmation
          webhook to finish internal processing.
        </p>

        {order ? (
          <div className="mt-7 divide-y divide-line-soft rounded-lg border border-line">
            <div className="grid grid-cols-[140px_1fr] gap-3 px-4 py-3 text-[14px]">
              <span className="text-ink-50">Order</span>
              <span className="font-mono">#{order.id}</span>
            </div>
            <div className="grid grid-cols-[140px_1fr] gap-3 px-4 py-3 text-[14px]">
              <span className="text-ink-50">Product</span>
              <span>{order.productName}</span>
            </div>
            <div className="grid grid-cols-[140px_1fr] gap-3 px-4 py-3 text-[14px]">
              <span className="text-ink-50">Amount</span>
              <span className="font-mono">{formatProductAmount(order.amountCents)}</span>
            </div>
            <div className="grid grid-cols-[140px_1fr] gap-3 px-4 py-3 text-[14px]">
              <span className="text-ink-50">Status</span>
              <span className="capitalize">{order.status.replaceAll("_", " ")}</span>
            </div>
            {order.requestedWorkspaceEmail && (
              <div className="grid grid-cols-[140px_1fr] gap-3 px-4 py-3 text-[14px]">
                <span className="text-ink-50">Company email</span>
                <span className="flex items-center gap-2">
                  <Mail className="size-4 text-homix-accent" />
                  {order.requestedWorkspaceEmail}
                </span>
              </div>
            )}
            {order.requestedWorkspaceEmail && (
              <div className="grid grid-cols-[140px_1fr] gap-3 px-4 py-3 text-[14px]">
                <span className="text-ink-50">Workspace</span>
                <span className="flex items-center gap-2 capitalize">
                  <Clock className="size-4 text-homix-amber" />
                  {order.workspaceStatus.replaceAll("_", " ")}
                </span>
              </div>
            )}
          </div>
        ) : (
          <div className="mt-7 rounded-md border border-line bg-paper-deep px-4 py-3 text-[14px] text-ink-70">
            Order details are not available yet.
          </div>
        )}

        <div className="mt-8 flex flex-wrap gap-3">
          <Link
            href="/pay"
            className="inline-flex h-10 items-center justify-center rounded-md border border-line bg-white px-4 text-[14px] text-ink transition hover:bg-paper-deep"
          >
            Back to payments
          </Link>
        </div>
      </div>
    </main>
  );
}
