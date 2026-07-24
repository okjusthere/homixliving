import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { agents, teams } from "@/db/schema";
import { eq } from "drizzle-orm";
import { requireActiveAgentApi, requireAdminApi } from "@/lib/auth-guards";
import { hidePublicProfileForOffboarding } from "@/lib/homixweb";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authResult = await requireActiveAgentApi();
  if ("error" in authResult) return authResult.error;

  const { id } = await params;
  const parsedId = parseInt(id, 10);
  if (!Number.isFinite(parsedId)) {
    return NextResponse.json({ error: "Valid agent id is required" }, { status: 400 });
  }

  if (!authResult.session.user.isAdmin && authResult.session.user.agentId !== parsedId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const result = await db
    .select({ agent: agents, teamName: teams.name })
    .from(agents)
    .leftJoin(teams, eq(agents.teamId, teams.id))
    .where(eq(agents.id, parsedId))
    .then((rows) => rows[0]);

  if (!result) {
    return NextResponse.json({ error: "Agent not found" }, { status: 404 });
  }

  return NextResponse.json(result);
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authResult = await requireAdminApi();
  if ("error" in authResult) return authResult.error;

  const { id } = await params;
  const parsedId = parseInt(id, 10);
  if (!Number.isFinite(parsedId)) {
    return NextResponse.json({ error: "Valid agent id is required" }, { status: 400 });
  }

  const hidden = await hidePublicProfileForOffboarding(parsedId);
  if (!hidden.ok) {
    return NextResponse.json(
      {
        error:
          hidden.body.error ||
          "Unable to hide the public profile. The account was not deactivated.",
      },
      { status: 502 },
    );
  }
  await db
    .update(agents)
    .set({ accountStatus: "inactive", updatedAt: new Date().toISOString() })
    .where(eq(agents.id, parsedId));
  return NextResponse.json({ success: true });
}
