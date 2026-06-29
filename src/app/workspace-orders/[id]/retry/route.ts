import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { auth } from "@/auth";
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
  return NextResponse.redirect(new URL(`/workspace-orders/${orderId}`, request.url));
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  const { id } = await params;
  const orderId = parseOrderId(id);
  if (!orderId) return NextResponse.redirect(new URL("/", request.url));

  if (!session?.user?.email) {
    const callbackUrl = new URL(`/workspace-orders/${orderId}`, request.url).toString();
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("callbackUrl", callbackUrl);
    return NextResponse.redirect(loginUrl);
  }

  if (!session.user.isAdmin) {
    return NextResponse.redirect(new URL("/", request.url));
  }

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
