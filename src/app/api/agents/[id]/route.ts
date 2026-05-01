import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { agents, teams } from "@/db/schema";
import { eq } from "drizzle-orm";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const parsedId = parseInt(id, 10);
  if (!Number.isFinite(parsedId)) {
    return NextResponse.json({ error: "Valid agent id is required" }, { status: 400 });
  }

  const result = await db
    .select({ agent: agents, teamName: teams.name })
    .from(agents)
    .leftJoin(teams, eq(agents.teamId, teams.id))
    .where(eq(agents.id, parsedId))
    .get();

  if (!result) {
    return NextResponse.json({ error: "Agent not found" }, { status: 404 });
  }

  return NextResponse.json(result);
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const parsedId = parseInt(id, 10);
  if (!Number.isFinite(parsedId)) {
    return NextResponse.json({ error: "Valid agent id is required" }, { status: 400 });
  }

  await db
    .update(agents)
    .set({ isActive: false, updatedAt: new Date().toISOString() })
    .where(eq(agents.id, parsedId));
  return NextResponse.json({ success: true });
}
