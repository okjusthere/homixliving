import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { settings } from "@/db/schema";
import { eq } from "drizzle-orm";
import { requireActiveAgentApi, requireAdminApi } from "@/lib/auth-guards";

export async function GET() {
  const authResult = await requireActiveAgentApi();
  if ("error" in authResult) return authResult.error;

  const allSettings = await db.select().from(settings);
  const settingsMap = Object.fromEntries(allSettings.map((s) => [s.key, s.value]));
  return NextResponse.json(settingsMap);
}

export async function PUT(req: NextRequest) {
  const authResult = await requireAdminApi();
  if ("error" in authResult) return authResult.error;

  const body = await req.json();
  for (const [key, value] of Object.entries(body)) {
    const existing = await db.select().from(settings).where(eq(settings.key, key)).get();
    if (existing) {
      await db.update(settings).set({ value: String(value) }).where(eq(settings.key, key));
    } else {
      await db.insert(settings).values({ key, value: String(value) });
    }
  }
  return NextResponse.json({ success: true });
}
