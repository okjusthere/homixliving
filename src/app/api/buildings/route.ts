import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { buildings } from "@/db/schema";
import { eq } from "drizzle-orm";

export async function GET() {
  const allBuildings = await db.select().from(buildings).orderBy(buildings.region, buildings.name);
  return NextResponse.json(allBuildings);
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const result = await db.insert(buildings).values(body).returning();
  return NextResponse.json(result[0], { status: 201 });
}

export async function PUT(req: NextRequest) {
  const body = await req.json();
  const { id, ...data } = body;
  const result = await db.update(buildings).set({ ...data, updatedAt: new Date().toISOString() }).where(eq(buildings.id, id)).returning();
  return NextResponse.json(result[0]);
}

export async function DELETE(req: NextRequest) {
  const { id } = await req.json();
  await db.delete(buildings).where(eq(buildings.id, id));
  return NextResponse.json({ success: true });
}
