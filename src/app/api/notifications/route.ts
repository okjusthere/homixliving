import { NextResponse } from "next/server";
import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { db } from "@/db";
import { notifications } from "@/db/schema";
import { requireActiveAgentApi } from "@/lib/auth-guards";

export async function GET() {
  const authResult = await requireActiveAgentApi();
  if ("error" in authResult) return authResult.error;

  const agentId = authResult.session.user.agentId;
  if (!agentId) return NextResponse.json({ items: [], unread: 0 });

  const [items, unreadRow] = await Promise.all([
    db
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

  return NextResponse.json({ items, unread: Number(unreadRow[0]?.count || 0) });
}
