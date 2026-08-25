import { NextRequest, NextResponse } from "next/server";
import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { anonymousSuggestions } from "@/db/schema";
import { requireActiveAgentApi, requireAdminApi } from "@/lib/auth-guards";
import { logAudit } from "@/lib/audit";

const CATEGORIES = new Set(["product", "commission", "training", "operations", "culture", "other"]);
const STATUSES = new Set(["new", "reviewing", "planned", "closed"]);

export async function POST(req: NextRequest) {
  // Authentication is an eligibility gate only. Do not carry session identity
  // into the inserted row, audit log, response, or error messages.
  const auth = await requireActiveAgentApi();
  if ("error" in auth) return auth.error;
  const body = await req.json().catch(() => ({}));
  const category = CATEGORIES.has(String(body.category)) ? String(body.category) : "other";
  const message = String(body.message || "").trim();
  if (message.length < 10 || message.length > 4_000) {
    return NextResponse.json({ error: "Suggestion must be between 10 and 4,000 characters." }, { status: 400 });
  }
  const [created] = await db
    .insert(anonymousSuggestions)
    .values({
      category,
      message,
      locale: body.locale === "en" ? "en" : "zh",
    })
    .returning({ id: anonymousSuggestions.id, createdAt: anonymousSuggestions.createdAt });
  return NextResponse.json(created, { status: 201 });
}

export async function GET() {
  const auth = await requireAdminApi();
  if ("error" in auth) return auth.error;
  const rows = await db
    .select()
    .from(anonymousSuggestions)
    .orderBy(desc(anonymousSuggestions.createdAt));
  return NextResponse.json(rows);
}

export async function PATCH(req: NextRequest) {
  const auth = await requireAdminApi();
  if ("error" in auth) return auth.error;
  const body = await req.json().catch(() => ({}));
  const id = String(body.id || "");
  const status = String(body.status || "");
  if (!/^[0-9a-f-]{36}$/i.test(id) || !STATUSES.has(status)) {
    return NextResponse.json({ error: "Invalid suggestion update." }, { status: 400 });
  }
  const [updated] = await db
    .update(anonymousSuggestions)
    .set({
      status: status as "new" | "reviewing" | "planned" | "closed",
      adminNote: String(body.adminNote || "").trim().slice(0, 2_000) || null,
      updatedAt: new Date().toISOString(),
    })
    .where(eq(anonymousSuggestions.id, id))
    .returning();
  if (!updated) return NextResponse.json({ error: "Suggestion not found." }, { status: 404 });
  await logAudit(auth.session, "update", "anonymous_suggestion", id, `匿名建议状态更新为 ${status}`);
  return NextResponse.json(updated);
}
