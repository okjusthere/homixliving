import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { RefreshCw } from "lucide-react";
import { db } from "@/db";
import { commerceOrders } from "@/db/schema";
import { requireActiveAgent } from "@/lib/auth-guards";
import { formatProductAmount } from "@/lib/commerce/catalog";

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
              Workspace order
            </p>
            <h1 className="mt-2 font-serif text-[42px] leading-[1.05]">Order #{order.id}</h1>
          </div>
          <Link
            href="/pay"
            className="inline-flex h-10 items-center justify-center rounded-md border border-line bg-white px-4 text-[14px] text-ink transition hover:bg-paper-deep"
          >
            Payments
          </Link>
        </div>

        <section className="mt-6 rounded-lg border border-line bg-white">
          <div className="grid gap-0 divide-y divide-line-soft">
            {[
              ["Product", order.productName],
              ["Amount", formatProductAmount(order.amountCents)],
              ["Payment status", order.status.replaceAll("_", " ")],
              ["Company email", order.requestedWorkspaceEmail || "—"],
              ["Workspace user ID", order.workspaceUserId || "—"],
              ["Updated", order.updatedAt || "—"],
            ].map(([label, value]) => (
              <div key={label} className="grid grid-cols-[170px_1fr] gap-4 px-4 py-3 text-[14px]">
                <span className="text-ink-50">{label}</span>
                <span>{value}</span>
              </div>
            ))}
            <div className="grid grid-cols-[170px_1fr] gap-4 px-4 py-3 text-[14px]">
              <span className="text-ink-50">Workspace status</span>
              <span
                className={`inline-flex w-fit items-center rounded-md border px-2 py-1 capitalize ${statusClass(
                  order.workspaceStatus
                )}`}
              >
                {order.workspaceStatus.replaceAll("_", " ")}
              </span>
            </div>
          </div>
        </section>

        {order.workspaceError && (
          <section className="mt-5 rounded-lg border border-homix-rose-soft bg-white p-4">
            <p className="text-[12px] uppercase tracking-[0.14em] text-homix-rose">
              Workspace error
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
            Retry Workspace provisioning
          </button>
        </form>
      </div>
    </main>
  );
}
