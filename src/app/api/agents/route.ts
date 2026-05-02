import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { agents, dealAgents, deals, teams } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { requireActiveAgentApi, requireAdminApi } from "@/lib/auth-guards";
import {
  activeDeal,
  commissionAgentsForDeal,
  dealInMonth,
  getAgentTakeForDeal,
  getMonthKey,
  type DealForReporting,
} from "@/lib/reporting";

function numberOrNull(value: unknown) {
  if (value === undefined || value === null || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function stringOrNull(value: unknown) {
  if (value === undefined || value === null) return null;
  const cleaned = String(value).trim();
  return cleaned || null;
}

function normalizeEmail(value: unknown) {
  return stringOrNull(value)?.toLowerCase() || null;
}

function cleanAdminAgentPayload(body: Record<string, unknown>) {
  const splitPct = numberOrNull(body.splitPct);
  const teamId = numberOrNull(body.teamId);
  return {
    name: String(body.name || "").trim(),
    email: normalizeEmail(body.email),
    phone: stringOrNull(body.phone),
    licenseNumber: stringOrNull(body.licenseNumber),
    licensedCompany: stringOrNull(body.licensedCompany),
    splitPct: splitPct ?? 50,
    teamId,
    isActive: body.isActive === undefined ? true : Boolean(body.isActive),
    joinedAt: stringOrNull(body.joinedAt),
    notes: stringOrNull(body.notes),
    updatedAt: new Date().toISOString(),
  };
}

export async function GET(req: NextRequest) {
  const authResult = await requireActiveAgentApi();
  if ("error" in authResult) return authResult.error;

  const teamIdParam = req.nextUrl.searchParams.get("teamId");
  const teamId = teamIdParam ? parseInt(teamIdParam, 10) : null;

  const rows = await db
    .select({
      agent: agents,
      teamName: teams.name,
    })
    .from(agents)
    .leftJoin(teams, eq(agents.teamId, teams.id))
    .where(teamId && Number.isFinite(teamId) ? eq(agents.teamId, teamId) : undefined)
    .orderBy(teams.name, agents.name);

  const visibleRows = authResult.session.user.isAdmin
    ? rows
    : rows.filter((row) => row.agent.isActive);

  const allDeals = await db.select().from(deals);
  const allDealAgents = await db.select().from(dealAgents);
  const allAgents = rows.map((row) => row.agent);
  const currentMonth = getMonthKey();

  const result = visibleRows.map((row) => {
    const monthDealIds = new Set(
      allDealAgents
        .filter((dealAgent) => dealAgent.agentId === row.agent.id)
        .map((dealAgent) => dealAgent.dealId)
    );
    const monthDeals = allDeals.filter(
      (deal) =>
        activeDeal(deal) &&
        dealInMonth(deal, currentMonth) &&
        monthDealIds.has(deal.id)
    );
    const mtdTake = monthDeals.reduce((sum, deal) => {
      const participants = commissionAgentsForDeal({
        dealId: deal.id,
        dealAgents: allDealAgents,
        agents: allAgents,
      });
      return (
        sum +
        getAgentTakeForDeal({
          deal: deal as DealForReporting,
          agentId: row.agent.id,
          participants,
        })
      );
    }, 0);
    return { ...row, mtdDeals: monthDeals.length, mtdTake };
  });

  return NextResponse.json(result);
}

export async function POST(req: NextRequest) {
  const authResult = await requireAdminApi();
  if ("error" in authResult) return authResult.error;

  try {
    const body = await req.json();
    if ("isAdmin" in body || "is_admin" in body) {
      return NextResponse.json({ error: "isAdmin is env-managed" }, { status: 400 });
    }

    const data = cleanAdminAgentPayload(body);
    if (!data.name) {
      return NextResponse.json({ error: "Name is required" }, { status: 400 });
    }
    const email = data.email;
    if (!email) {
      return NextResponse.json({ error: "Email is required" }, { status: 400 });
    }
    if (data.splitPct < 0 || data.splitPct > 100) {
      return NextResponse.json({ error: "Split must be between 0 and 100" }, { status: 400 });
    }
    if (data.teamId) {
      const team = await db.select().from(teams).where(eq(teams.id, data.teamId)).get();
      if (!team) return NextResponse.json({ error: "Team not found" }, { status: 404 });
    }

    const [created] = await db
      .insert(agents)
      .values({ ...data, email, createdAt: new Date().toISOString() })
      .returning();
    return NextResponse.json(created, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Agent creation failed" }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  const authResult = await requireActiveAgentApi();
  if ("error" in authResult) return authResult.error;

  try {
    const body = await req.json();
    const id = parseInt(String(body.id), 10);
    if (!Number.isFinite(id)) {
      return NextResponse.json({ error: "Valid agent id is required" }, { status: 400 });
    }
    if ("isAdmin" in body || "is_admin" in body) {
      return NextResponse.json({ error: "isAdmin is env-managed" }, { status: 400 });
    }

    const existing = await db.select().from(agents).where(eq(agents.id, id)).get();
    if (!existing) return NextResponse.json({ error: "Agent not found" }, { status: 404 });

    if (body.email !== undefined && normalizeEmail(body.email) !== existing.email.toLowerCase()) {
      return NextResponse.json({ error: "Email cannot be changed" }, { status: 400 });
    }

    const isSelf = authResult.session.user.agentId === id;
    const isAdmin = authResult.session.user.isAdmin;
    if (!isAdmin && !isSelf) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const restrictedFields = [
      "licensedCompany",
      "splitPct",
      "teamId",
      "joinedAt",
      "notes",
      "isActive",
    ];
    if (!isAdmin && restrictedFields.some((field) => field in body)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const cleaned = cleanAdminAgentPayload({ ...body, email: existing.email });
    const data = isAdmin
      ? {
          name: cleaned.name,
          phone: cleaned.phone,
          licenseNumber: cleaned.licenseNumber,
          licensedCompany: cleaned.licensedCompany,
          splitPct: cleaned.splitPct,
          teamId: cleaned.teamId,
          isActive: body.isActive === undefined ? existing.isActive : cleaned.isActive,
          joinedAt: cleaned.joinedAt,
          notes: cleaned.notes,
          updatedAt: cleaned.updatedAt,
        }
      : {
          name: String(body.name || existing.name).trim(),
          phone: stringOrNull(body.phone),
          licenseNumber: stringOrNull(body.licenseNumber),
          updatedAt: new Date().toISOString(),
        };

    if (!data.name) {
      return NextResponse.json({ error: "Name is required" }, { status: 400 });
    }
    if (
      "splitPct" in data &&
      typeof data.splitPct === "number" &&
      (data.splitPct < 0 || data.splitPct > 100)
    ) {
      return NextResponse.json({ error: "Split must be between 0 and 100" }, { status: 400 });
    }
    if ("teamId" in data && data.teamId) {
      const team = await db.select().from(teams).where(eq(teams.id, data.teamId)).get();
      if (!team) return NextResponse.json({ error: "Team not found" }, { status: 404 });
    }

    const [updated] = await db.update(agents).set(data).where(eq(agents.id, id)).returning();
    return NextResponse.json(updated);
  } catch {
    return NextResponse.json({ error: "Agent update failed" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const authResult = await requireAdminApi();
  if ("error" in authResult) return authResult.error;

  try {
    const { id } = await req.json();
    const parsedId = parseInt(String(id), 10);
    if (!Number.isFinite(parsedId)) {
      return NextResponse.json({ error: "Valid agent id is required" }, { status: 400 });
    }
    await db
      .update(agents)
      .set({ isActive: false, updatedAt: new Date().toISOString() })
      .where(and(eq(agents.id, parsedId), eq(agents.isActive, true)));
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "Agent delete failed" }, { status: 500 });
  }
}
