import { NextRequest, NextResponse } from "next/server";
import { asc } from "drizzle-orm";
import { db } from "@/db";
import { resources } from "@/db/schema";
import { requireActiveAgentApi, requireAdminApi } from "@/lib/auth-guards";
import { logAudit } from "@/lib/audit";

export async function GET() {
  const auth = await requireActiveAgentApi();
  if ("error" in auth) return auth.error;
  const rows = await db
    .select()
    .from(resources)
    .orderBy(asc(resources.sortOrder), asc(resources.id));
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

  const title = String(body.title || "").trim();
  const url = String(body.url || "").trim();
  if (!title) return NextResponse.json({ error: "Title is required" }, { status: 400 });
  if (!url) return NextResponse.json({ error: "Link (URL) is required" }, { status: 400 });

  const [row] = await db
    .insert(resources)
    .values({
      title,
      url,
      category: String(body.category || "").trim() || "General",
      description: String(body.description || "").trim() || null,
    })
    .returning();

  await logAudit(auth.session, "create", "resource", row.id, `新建资源 ${row.title}`);

  return NextResponse.json(row);
}
