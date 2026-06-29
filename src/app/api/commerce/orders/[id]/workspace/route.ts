import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { commerceOrders, type CommerceOrder } from "@/db/schema";
import { requireAdminApi } from "@/lib/auth-guards";
import { provisionWorkspaceForOrder } from "@/lib/google-workspace";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function parseOrderId(raw: string): number | null {
  const parsed = Number(raw);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

async function findOrder(orderId: number): Promise<CommerceOrder | null> {
  const [order] = await db
    .select()
    .from(commerceOrders)
    .where(eq(commerceOrders.id, orderId))
    .limit(1);
  return order ?? null;
}

function orderPayload(order: CommerceOrder) {
  return {
    id: order.id,
    productKey: order.productKey,
    productName: order.productName,
    status: order.status,
    requestedWorkspaceEmail: order.requestedWorkspaceEmail,
    workspaceStatus: order.workspaceStatus,
    workspaceUserId: order.workspaceUserId,
    workspaceError: order.workspaceError,
    updatedAt: order.updatedAt,
  };
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const authResult = await requireAdminApi();
  if ("error" in authResult) return authResult.error;

  const { id } = await params;
  const orderId = parseOrderId(id);
  if (!orderId) {
    return NextResponse.json({ error: "Invalid order id." }, { status: 400 });
  }

  const order = await findOrder(orderId);
  if (!order) {
    return NextResponse.json({ error: "Order not found." }, { status: 404 });
  }

  return NextResponse.json({ order: orderPayload(order) });
}

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const authResult = await requireAdminApi();
  if ("error" in authResult) return authResult.error;

  const { id } = await params;
  const orderId = parseOrderId(id);
  if (!orderId) {
    return NextResponse.json({ error: "Invalid order id." }, { status: 400 });
  }

  const order = await findOrder(orderId);
  if (!order) {
    return NextResponse.json({ error: "Order not found." }, { status: 404 });
  }

  if (order.productKey !== "company_domain_email") {
    return NextResponse.json(
      { error: "Order does not require Workspace provisioning." },
      { status: 400 }
    );
  }

  await provisionWorkspaceForOrder(order);
  const updatedOrder = await findOrder(orderId);

  return NextResponse.json({
    order: updatedOrder ? orderPayload(updatedOrder) : orderPayload(order),
  });
}
