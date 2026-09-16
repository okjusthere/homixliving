import { NextResponse } from "next/server";
import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { db } from "@/db";
import { notifications } from "@/db/schema";
import { requireActiveAgentApi } from "@/lib/auth-guards";

export async function GET(request: Request) {
  const authResult = await requireActiveAgentApi();
  if ("error" in authResult) return authResult.error;

  const agentId = authResult.session.user.agentId;
  const countOnly = new URL(request.url).searchParams.get("countOnly") === "1";
  const headers = { "Cache-Control": "private, no-store" };
  if (!agentId) {
    return NextResponse.json(
      { agentId: null, unread: 0, ...(!countOnly && { items: [] }) },
      { headers },
    );
  }

  const [items, unreadRow] = await Promise.all([
    countOnly
      ? Promise.resolve(undefined)
      : db
          .select()
          .from(notifications)
          .where(eq(notifications.recipientAgentId, agentId))
          .orderBy(desc(notifications.id))
          .limit(30),
    db
      .select({ count: sql<number>`count(*)` })
      .from(notifications)
      .where(
        and(
          eq(notifications.recipientAgentId, agentId),
          isNull(notifications.readAt)
        )
      ),
  ]);

  return NextResponse.json(
    { agentId, ...(!countOnly && { items }), unread: Number(unreadRow[0]?.count || 0) },
    { headers },
  );
}
