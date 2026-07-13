import { NextRequest, NextResponse } from "next/server";
import { asc } from "drizzle-orm";
import { db } from "@/db";
import { checklistItems } from "@/db/schema";
import { requireActiveAgentApi, requireAdminApi } from "@/lib/auth-guards";
import { isChecklistGroupKey } from "@/lib/checklist-groups";
import { logAudit } from "@/lib/audit";

export async function GET() {
  const auth = await requireActiveAgentApi();
  if ("error" in auth) return auth.error;
  const rows = await db
    .select()
    .from(checklistItems)
    .orderBy(asc(checklistItems.sortOrder), asc(checklistItems.id));
  return NextResponse.json(rows);
}

export async function POST(req: NextRequest) {
  const auth = await requireAdminApi();
  if ("error" in auth) return auth.error;

  let body: Record<string, unknown> = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const groupKey = String(body.groupKey || "").trim();
  const label = String(body.label || "").trim();
  if (!isChecklistGroupKey(groupKey)) {
    return NextResponse.json({ error: "Unknown checklist group" }, { status: 400 });
  }
  if (!label) return NextResponse.json({ error: "Label is required" }, { status: 400 });

  const [row] = await db
    .insert(checklistItems)
    .values({
      groupKey,
      label,
      ...(typeof body.sortOrder === "number" ? { sortOrder: body.sortOrder } : {}),
    })
    .returning();

  await logAudit(auth.session, "create", "checklist_item", row.id, `新建清单项 ${row.label}`);
  return NextResponse.json(row);
}
