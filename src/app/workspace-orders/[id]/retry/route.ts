import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { requireAdminApi } from "@/lib/auth-guards";
import { db } from "@/db";
import { commerceOrders } from "@/db/schema";
import { provisionWorkspaceForOrder } from "@/lib/google-workspace";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function parseOrderId(raw: string): number | null {
  const parsed = Number(raw);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function redirectToOrder(request: Request, orderId: number) {
  return NextResponse.redirect(
    new URL(`/admin/orders/${orderId}`, request.url),
    303,
  );
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const access = await requireAdminApi();
  if ("error" in access) return access.error;
  const { id } = await params;
  const orderId = parseOrderId(id);
  if (!orderId)
    return NextResponse.redirect(new URL("/admin/finance", request.url), 303);

  const [order] = await db
    .select()
    .from(commerceOrders)
    .where(eq(commerceOrders.id, orderId))
    .limit(1);

  if (!order || order.productKey !== "company_domain_email") {
    return redirectToOrder(request, orderId);
  }

  await provisionWorkspaceForOrder(order);
  return redirectToOrder(request, orderId);
}
