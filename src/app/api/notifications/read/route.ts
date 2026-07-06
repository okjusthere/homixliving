import { NextRequest, NextResponse } from "next/server";
import { and, eq, inArray, isNull } from "drizzle-orm";
import { db } from "@/db";
import { notifications } from "@/db/schema";
import { requireActiveAgentApi } from "@/lib/auth-guards";

// Mark notifications read. Body: { ids: number[] } or { all: true }.
// Scoped to the caller's own notifications — you can't mark someone else's.
export async function POST(req: NextRequest) {
  const authResult = await requireActiveAgentApi();
  if ("error" in authResult) return authResult.error;

  const agentId = authResult.session.user.agentId;
  if (!agentId) return NextResponse.json({ success: true });

  const body = await req.json().catch(() => ({}));
  const now = new Date().toISOString();

  if (body.all === true) {
    await db
      .update(notifications)
      .set({ readAt: now })
      .where(
        and(
          eq(notifications.recipientAgentId, agentId),
          isNull(notifications.readAt)
        )
      );
    return NextResponse.json({ success: true });
  }

  const ids = Array.isArray(body.ids)
    ? body.ids.map(Number).filter((n: number) => Number.isInteger(n) && n > 0)
    : [];
  if (ids.length === 0) {
    return NextResponse.json({ error: "ids or all required" }, { status: 400 });
  }

  await db
    .update(notifications)
    .set({ readAt: now })
    .where(
      and(
        eq(notifications.recipientAgentId, agentId),
        inArray(notifications.id, ids)
      )
    );
  return NextResponse.json({ success: true });
}
