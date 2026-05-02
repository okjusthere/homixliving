import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { buildings } from "@/db/schema";
import { eq } from "drizzle-orm";
import { requireActiveAgentApi, requireAdminApi } from "@/lib/auth-guards";

export async function GET() {
  const authResult = await requireActiveAgentApi();
  if ("error" in authResult) return authResult.error;

  const allBuildings = await db.select().from(buildings).orderBy(buildings.region, buildings.name);
  return NextResponse.json(allBuildings);
}

export async function POST(req: NextRequest) {
  const authResult = await requireAdminApi();
  if ("error" in authResult) return authResult.error;

  const body = await req.json();
  const result = await db.insert(buildings).values(body).returning();
  return NextResponse.json(result[0], { status: 201 });
}

export async function PUT(req: NextRequest) {
  const authResult = await requireAdminApi();
  if ("error" in authResult) return authResult.error;

  const body = await req.json();
  const { id, ...data } = body;
  const result = await db.update(buildings).set({ ...data, updatedAt: new Date().toISOString() }).where(eq(buildings.id, id)).returning();
  return NextResponse.json(result[0]);
}

export async function DELETE(req: NextRequest) {
  const authResult = await requireAdminApi();
  if ("error" in authResult) return authResult.error;

  const { id } = await req.json();
  await db.delete(buildings).where(eq(buildings.id, id));
  return NextResponse.json({ success: true });
}
