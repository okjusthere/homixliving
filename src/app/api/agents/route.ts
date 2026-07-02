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
import { DEFAULT_AGENT_SPLIT_PCT } from "@/lib/splits";

const AGENT_APPROVAL_STATUSES = ["pending", "approved", "ignored", "revoked"] as const;

function approvalStatusOrDefault(value: unknown, isActive: boolean) {
  if (
    typeof value === "string" &&
    AGENT_APPROVAL_STATUSES.includes(value as (typeof AGENT_APPROVAL_STATUSES)[number])
  ) {
    return value as (typeof AGENT_APPROVAL_STATUSES)[number];
  }
  return isActive ? "approved" : "pending";
}

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
  const isActive = body.isActive === undefined ? true : Boolean(body.isActive);
  return {
    name: String(body.name || "").trim(),
    email: normalizeEmail(body.email),
    phone: stringOrNull(body.phone),
    licenseNumber: stringOrNull(body.licenseNumber),
    licensedCompany: stringOrNull(body.licensedCompany),
    splitPct: splitPct ?? DEFAULT_AGENT_SPLIT_PCT,
    teamId,
    isActive,
    approvalStatus: approvalStatusOrDefault(body.approvalStatus, isActive),
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

  // Non-admins get a slim roster: enough to pick co-agents and preview a deal's
  // commission split (id, name, split %), but NOT colleagues' month-to-date
  // earnings, license numbers, phones, or admin notes. Only admins see the
  // enriched, per-agent MTD figures below.
  if (!authResult.session.user.isAdmin) {
    const slim = rows
      .filter((row) => row.agent.isActive)
      .map((row) => ({
        agent: {
          id: row.agent.id,
          name: row.agent.name,
          email: row.agent.email,
          splitPct: row.agent.splitPct,
          teamId: row.agent.teamId,
          isActive: row.agent.isActive,
        },
        teamName: row.teamName,
        mtdDeals: 0,
        mtdTake: 0,
      }));
    return NextResponse.json(slim);
  }

  const visibleRows = rows;

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
    // isAdmin is env-managed (synced from ADMIN_EMAILS in the JWT callback,
    // see src/auth.ts). The frontend often round-trips the full agent
    // object — including isAdmin — so rejecting any request that mentions
    // the key would break every legitimate save. cleanAdminAgentPayload
    // below does NOT include isAdmin in the writable field set, so any
    // value passed in is silently ignored — that's the actual safety net.
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
    // isAdmin is env-managed (see POST handler comment). Frontend round-trips
    // the full agent object, so don't reject when isAdmin is merely present —
    // cleanAdminAgentPayload silently drops it from the writable set below.

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
      "approvalStatus",
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
          approvalStatus:
            (body.isActive === undefined ? existing.isActive : cleaned.isActive)
              ? "approved"
              : cleaned.approvalStatus,
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
      .set({ isActive: false, approvalStatus: "revoked", updatedAt: new Date().toISOString() })
      .where(and(eq(agents.id, parsedId), eq(agents.isActive, true)));
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "Agent delete failed" }, { status: 500 });
  }
}
