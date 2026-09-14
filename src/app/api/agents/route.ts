import { onboardingContracts, onboardingReceipts, onboardingAccessGrants } from "@/db/onboarding-schema";
import { onboardingTasks } from "@/lib/onboarding-tasks";
import { getOnboardingStaleSettlements } from "@/lib/onboarding-stripe-guard";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import {
  agentEmailAddresses,
  agentPaymentProfiles,
  agents,
  commerceOrders,
  dealAgents,
  deals,
  teams,
} from "@/db/schema";
import { and, desc, eq, gt, inArray, sql } from "drizzle-orm";
import { requireActiveAgentApi, requireAdminApi } from "@/lib/auth-guards";
import { isAgentPractice, normalizeAgentPlan, PLAN_SPLIT_PCT } from "@/lib/agent-plans";
import {
  activeDeal,
  commissionAgentsForDeal,
  dealInMonth,
  getAgentTakeForDeal,
  getMonthKey,
  type DealForReporting,
} from "@/lib/reporting";
import { DEFAULT_AGENT_SPLIT_PCT } from "@/lib/splits";
import { logAudit } from "@/lib/audit";
import { syncPublicAgentProfile } from "@/lib/sync-public-profile";
import { cleanAgentName, hasSignedNameBasis, validAgentName } from "@/lib/agent-names";
import {
  isAgentAccountStatus,
  normalizeAgentAccountStatus,
} from "@/lib/agent-lifecycle";
import { hidePublicProfileForOffboarding } from "@/lib/homixweb";
import { dateOrNull } from "@/lib/db-time";
import { resolveLicensedCompany } from "@/lib/licensed-companies";

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

// A malformed expiry silently disables the license-reminder cron (daysUntil
// yields null), so reject anything that isn't a plain date. Empty clears.
function invalidLicenseExpiry(body: Record<string, unknown>): boolean {
  const value = body.licenseExpiresAt;
  if (value === undefined || value === null || value === "") return false;
  return !/^\d{4}-\d{2}-\d{2}$/.test(String(value).trim());
}

function cleanAdminAgentPayload(body: Record<string, unknown>) {
  const teamId = numberOrNull(body.teamId);
  const plan = normalizeAgentPlan(body.plan);
  const company = resolveLicensedCompany(
    stringOrNull(body.licensedCompanyId) || stringOrNull(body.licensedCompany),
  );
  return {
    name: cleanAgentName(body.name),
    email: normalizeEmail(body.email),
    phone: stringOrNull(body.phone),
    licenseNumber: stringOrNull(body.licenseNumber),
    licenseExpiresAt: stringOrNull(body.licenseExpiresAt),
    licensedCompany: company?.legalName || null,
    licensedCompanyId: company?.id || null,
    splitPct: PLAN_SPLIT_PCT[plan] ?? DEFAULT_AGENT_SPLIT_PCT,
    teamId,
    accountStatus: normalizeAgentAccountStatus(body.accountStatus, "active"),
    joinedAt: dateOrNull(body.joinedAt),
    notes: stringOrNull(body.notes),
    legalName: cleanAgentName(body.legalName) || null,
    // Commission plan and practice area. Invalid values fall back rather than
    // 500 — the UI only ever sends the known set.
    plan,
    planEffectiveFrom: dateOrNull(body.planEffectiveFrom),
    anniversaryStart: dateOrNull(body.anniversaryStart),
    affiliationTermMonths: numberOrNull(body.affiliationTermMonths),
    affiliationPaidAt: dateOrNull(body.affiliationPaidAt),
    practice: isAgentPractice(body.practice) ? body.practice : null,
    // Which existing agent recruited this one. Admin-entered only; the caller
    // sends an agent id, and self-referral is rejected below.
    referredByAgentId: numberOrNull(body.referredByAgentId),
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
      .filter((row) => row.agent.accountStatus === "active")
      .map((row) => ({
        agent: {
          id: row.agent.id,
          name: row.agent.name,
          email: row.agent.email,
          splitPct: row.agent.splitPct,
          teamId: row.agent.teamId,
          accountStatus: row.agent.accountStatus,
          isActive: row.agent.accountStatus === "active",
        },
        teamName: row.teamName,
        mtdDeals: 0,
        mtdTake: 0,
      }));
    return NextResponse.json(slim);
  }

  const visibleRows = rows;

  const loginEmailRows = await db
    .select({
      agentId: agentEmailAddresses.agentId,
      email: agentEmailAddresses.email,
      isPrimary: agentEmailAddresses.isPrimary,
      verifiedAt: agentEmailAddresses.verifiedAt,
    })
    .from(agentEmailAddresses)
    .where(eq(agentEmailAddresses.canSignIn, true));
  const loginEmailsByAgent = new Map<number, typeof loginEmailRows>();
  for (const address of loginEmailRows) {
    loginEmailsByAgent.set(address.agentId, [
      ...(loginEmailsByAgent.get(address.agentId) || []),
      address,
    ]);
  }

  const allDeals = await db.select().from(deals);
  const allDealAgents = await db.select().from(dealAgents);
  const allAgents = rows.map((row) => row.agent);
  const currentMonth = getMonthKey();

  // Payout readiness per agent, for the roster's onboarding hint. Only the
  // presence of the details is exposed — never routing/account digits.
  const paymentRows = await db
    .select({
      agentId: agentPaymentProfiles.agentId,
      routingNumber: agentPaymentProfiles.routingNumber,
      accountNumber: agentPaymentProfiles.accountNumber,
      payeeName: agentPaymentProfiles.payeeName,
      w9ObjectKey: agentPaymentProfiles.w9ObjectKey,
    })
    .from(agentPaymentProfiles);
  const paymentByAgent = new Map(
    paymentRows.map((p) => [
      p.agentId,
      {
        hasPayout: Boolean(p.routingNumber && p.accountNumber && p.payeeName),
        hasW9: Boolean(p.w9ObjectKey),
      },
    ]),
  );

  // Only onboarding orders carry the one-time licence-transfer fee. Expose
  // the latest settled channel so the admin UI can reserve approval for cash,
  // check, Zelle, or another verified offline payment. Stripe activates from
  // its signed webhook and must not depend on an admin click.
  const onboardingOrderRows = await db
    .select({
      agentId: commerceOrders.agentId,
      paymentChannel: commerceOrders.paymentChannel,
    })
    .from(commerceOrders)
    .where(and(
      gt(commerceOrders.licenseTransferFeeCents, 0),
      inArray(commerceOrders.status, ["paid", "active"]),
    ))
    .orderBy(desc(commerceOrders.paidAt), desc(commerceOrders.id));
  const onboardingPaymentChannelByAgent = new Map<number, string>();
  for (const order of onboardingOrderRows) {
    if (order.agentId && !onboardingPaymentChannelByAgent.has(order.agentId)) {
      onboardingPaymentChannelByAgent.set(order.agentId, order.paymentChannel);
    }
  }

  const [manualContracts, receipts, grants, staleSettlements] = await Promise.all([
    db.select({ agentId: onboardingContracts.agentId, status: onboardingContracts.status }).from(onboardingContracts),
    db.select({ agentId: onboardingReceipts.agentId, status: onboardingReceipts.status }).from(onboardingReceipts),
    db.select({ agentId: onboardingAccessGrants.agentId, status: onboardingAccessGrants.status, expiresAt: onboardingAccessGrants.expiresAt }).from(onboardingAccessGrants),
    getOnboardingStaleSettlements(visibleRows.map(row => row.agent.id)),
  ]);
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
    const payment = paymentByAgent.get(row.agent.id);
    return {
      ...row,
      onboardingTasks: onboardingTasks(row.agent, onboardingPaymentChannelByAgent.get(row.agent.id) || null, {
        contracts: manualContracts.filter((c) => c.agentId === row.agent.id),
        receipts: receipts.filter((c) => c.agentId === row.agent.id),
        grants: grants.filter((c) => c.agentId === row.agent.id),
        staleSettlements: staleSettlements.filter((c) => c.agentId === row.agent.id),
      }),
      loginEmails: loginEmailsByAgent.get(row.agent.id) || [],
      mtdDeals: monthDeals.length,
      mtdTake,
      hasPayout: payment?.hasPayout ?? false,
      hasW9: payment?.hasW9 ?? false,
      onboardingPaymentChannel: onboardingPaymentChannelByAgent.get(row.agent.id) || null,
    };
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
    if (invalidLicenseExpiry(body)) {
      return NextResponse.json({ error: "licenseExpiresAt must be YYYY-MM-DD" }, { status: 400 });
    }
    const data = { ...cleanAdminAgentPayload(body), accountStatus: "pending" as const };
    if (!validAgentName(body.name) || (data.legalName && !validAgentName(body.legalName))) {
      return NextResponse.json({ error: "Enter a valid Preferred name / Legal name (maximum 200 characters)." }, { status: 400 });
    }
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
      const team = await db.select().from(teams).where(eq(teams.id, data.teamId)).then((rows) => rows[0]);
      if (!team) return NextResponse.json({ error: "Team not found" }, { status: 404 });
      if (!data.licensedCompanyId || team.companyId !== data.licensedCompanyId) {
        return NextResponse.json(
          { error: "Agent and team must belong to the same licensed company" },
          { status: 409 },
        );
      }
    }
    if (data.plan === "team_member" && !data.teamId) {
      return NextResponse.json({ error: "Team Member plan requires a team" }, { status: 400 });
    }

    const created = await db.transaction(async (tx) => {
      const now = new Date().toISOString();
      const [newAgent] = await tx
        .insert(agents)
        .values({ ...data, email, createdAt: now })
        .returning();
      await tx.insert(agentEmailAddresses).values({
        agentId: newAgent.id,
        email,
        kind: "login",
        canSignIn: true,
        isPrimary: true,
        verifiedAt: now,
        source: "admin_created",
        createdByAgentId: authResult.session.user.agentId,
        updatedAt: now,
      });
      return newAgent;
    });
    await logAudit(
      authResult.session,
      "create",
      "agent",
      created.id,
      `创建经纪人 ${created.name} (#${created.id})`,
    );
    // New accounts enter the reviewed onboarding path; publishing happens on
    // activation, never simply because an administrator entered an email.
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

    const existing = await db.select().from(agents).where(eq(agents.id, id)).then((rows) => rows[0]);
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
      "licensedCompanyId",
      "splitPct",
      "teamId",
      "joinedAt",
      "notes",
      "accountStatus",
      // Referrals and plan terms are office-managed, never self-reported.
      "referredByAgentId",
      "plan",
      "practice",
    ];
    if (!isAdmin && restrictedFields.some((field) => field in body)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    const legalChanged = body.legalName !== undefined && (body.legalName ?? "") !== (existing.legalName || "");
    const preferredName = body.name === undefined || body.name === existing.name
      ? existing.name : cleanAgentName(body.name);
    if (legalChanged && ((!isAdmin && Boolean(existing.legalName)) || hasSignedNameBasis(existing))) {
      return NextResponse.json({ error: "Legal name is locked. Contact the office to correct signed identity records. 法定姓名已锁定，请联系管理员通过协议更正流程处理。" }, { status: 409 });
    }
    if (!validAgentName(body.name ?? existing.name) ||
        (body.legalName !== undefined && !validAgentName(body.legalName) && body.legalName !== null && body.legalName !== "")) {
      return NextResponse.json({ error: "Enter a valid Preferred name / Legal name (maximum 200 characters)." }, { status: 400 });
    }
    if (hasSignedNameBasis(existing) && !existing.legalName && preferredName !== existing.name) {
      return NextResponse.json({ error: "Confirm the legal identity with the office before changing this legacy Preferred name. 请先由管理员核对旧协议的法定姓名。" }, { status: 409 });
    }
    if (body.accountStatus !== undefined && !isAgentAccountStatus(body.accountStatus)) {
      return NextResponse.json({ error: "Invalid account status" }, { status: 400 });
    }
    if (existing.accountStatus !== "active" && body.accountStatus === "active") {
      return NextResponse.json({ error: "请通过「处理入职」审批开通账号。Use the onboarding approval flow to activate a pending account." }, { status: 409 });
    }

    if (invalidLicenseExpiry(body)) {
      return NextResponse.json({ error: "licenseExpiresAt must be YYYY-MM-DD" }, { status: 400 });
    }
    const cleaned = cleanAdminAgentPayload({ ...existing, ...body, email: existing.email });
    cleaned.name = preferredName;
    if (!legalChanged) cleaned.legalName = existing.legalName;
    const companyChanged = cleaned.licensedCompanyId !== existing.licensedCompanyId;
    if (
      isAdmin &&
      companyChanged &&
      (existing.accountStatus !== "pending" || existing.agreementStatus !== "not_started")
    ) {
      return NextResponse.json(
        {
          error:
            "Licensed company changes require a pending, unsigned onboarding record so the team, MLS requirement, and agreement can be revalidated.",
        },
        { status: 409 },
      );
    }
    if (isAdmin && existing.accountStatus === "pending" && existing.agreementStatus !== "not_started") {
      const signedFactsChanged =
        cleaned.legalName !== existing.legalName ||
        cleaned.phone !== existing.phone ||
        cleaned.licenseNumber !== existing.licenseNumber ||
        cleaned.licensedCompany !== existing.licensedCompany ||
        cleaned.licensedCompanyId !== existing.licensedCompanyId ||
        cleaned.practice !== existing.practice ||
        cleaned.teamId !== existing.teamId ||
        cleaned.referredByAgentId !== existing.referredByAgentId ||
        cleaned.plan !== normalizeAgentPlan(existing.plan) ||
        cleaned.affiliationTermMonths !== existing.affiliationTermMonths;
      if (signedFactsChanged) {
        return NextResponse.json(
          { error: "Signed onboarding facts cannot change after the affiliation agreement is sent." },
          { status: 409 },
        );
      }
    }
    if (isAdmin && body.plan !== undefined && cleaned.plan !== normalizeAgentPlan(existing.plan)) {
      const today = new Date().toISOString().slice(0, 10);
      const requestedEffectiveFrom = dateOrNull(body.planEffectiveFrom);
      if (requestedEffectiveFrom && requestedEffectiveFrom !== today) {
        return NextResponse.json(
          { error: "Plan changes take effect immediately. Future plan scheduling requires a versioned plan-history workflow." },
          { status: 409 },
        );
      }
      cleaned.planEffectiveFrom = today;
    }
    if (isAdmin && cleaned.teamId) {
      const [selectedTeam] = await db
        .select({ id: teams.id, companyId: teams.companyId })
        .from(teams)
        .where(eq(teams.id, cleaned.teamId))
        .limit(1);
      if (!selectedTeam) {
        return NextResponse.json({ error: "Team not found" }, { status: 404 });
      }
      if (!cleaned.licensedCompanyId || selectedTeam.companyId !== cleaned.licensedCompanyId) {
        return NextResponse.json(
          { error: "Agent and team must belong to the same licensed company" },
          { status: 409 },
        );
      }
    }
    const data = isAdmin
      ? {
          name: cleaned.name,
          phone: cleaned.phone,
          licenseNumber: cleaned.licenseNumber,
          licenseExpiresAt: cleaned.licenseExpiresAt,
          licensedCompany: cleaned.licensedCompany,
          licensedCompanyId: cleaned.licensedCompanyId,
          splitPct: cleaned.splitPct,
          teamId: cleaned.teamId,
          accountStatus:
            body.accountStatus === undefined ? existing.accountStatus : cleaned.accountStatus,
          joinedAt: cleaned.joinedAt,
          notes: cleaned.notes,
          legalName: cleaned.legalName,
          referredByAgentId: cleaned.referredByAgentId,
          plan: cleaned.plan,
          planEffectiveFrom: cleaned.planEffectiveFrom || existing.planEffectiveFrom,
          anniversaryStart: cleaned.anniversaryStart || existing.anniversaryStart,
          affiliationTermMonths: cleaned.affiliationTermMonths ?? existing.affiliationTermMonths,
          affiliationPaidAt: cleaned.affiliationPaidAt ?? existing.affiliationPaidAt,
          practice: cleaned.practice,
          updatedAt: cleaned.updatedAt,
        }
      : {
          name: preferredName,
          ...(legalChanged ? { legalName: cleanAgentName(body.legalName) } : {}),
          phone: body.phone === undefined ? existing.phone : stringOrNull(body.phone),
          licenseNumber: body.licenseNumber === undefined
            ? existing.licenseNumber
            : stringOrNull(body.licenseNumber),
          // Their license, their renewal date — self-editable like the number.
          licenseExpiresAt: body.licenseExpiresAt === undefined
            ? existing.licenseExpiresAt
            : stringOrNull(body.licenseExpiresAt),
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
    // A referrer must be a real, different agent — a self-referral would make
    // recruiting credit meaningless, and a dangling id would render as a blank.
    if ("referredByAgentId" in data && data.referredByAgentId != null) {
      if (data.referredByAgentId === id) {
        return NextResponse.json({ error: "An agent cannot refer themselves" }, { status: 400 });
      }
      const referrer = await db
        .select({ id: agents.id })
        .from(agents)
        .where(eq(agents.id, data.referredByAgentId))
        .then((rows) => rows[0]);
      if (!referrer) {
        return NextResponse.json({ error: "Referring agent not found" }, { status: 404 });
      }
    }
    if ("teamId" in data && data.teamId) {
      const team = await db.select().from(teams).where(eq(teams.id, data.teamId)).then((rows) => rows[0]);
      if (!team) return NextResponse.json({ error: "Team not found" }, { status: 404 });
    }
    if ("plan" in data && data.plan === "team_member" && !("teamId" in data && data.teamId)) {
      return NextResponse.json({ error: "Team Member plan requires a team" }, { status: 400 });
    }

    if (
      existing.accountStatus !== "inactive" &&
      "accountStatus" in data &&
      data.accountStatus === "inactive"
    ) {
      const hidden = await hidePublicProfileForOffboarding(id);
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
    }

    const [updated] = await db.update(agents).set(data).where(and(eq(agents.id, id), sql`${agents.updatedAt} IS NOT DISTINCT FROM ${existing.updatedAt}::timestamptz`)).returning();
    if (!updated) return NextResponse.json({ error: "Profile changed while saving. Refresh and retry. 资料已更新，请刷新后重试。" }, { status: 409 });
    await logAudit(
      authResult.session,
      "update",
      "agent",
      id,
      `更新经纪人 ${updated.name} (#${id})`,
      data
    );
    // Same database as the marketing site now — mirror the shared identity
    // fields onto the linked public profile and nudge its cache. Best-effort;
    // unlinked agents are skipped (see scripts/link-agent-rosters.ts).
    const mlsVerification = await syncPublicAgentProfile({
      agentId: updated.id,
      name: updated.name,
      legalName: updated.legalName,
      phone: updated.phone,
      licenseNumber: updated.licenseNumber,
    });
    return NextResponse.json({ ...updated, mlsVerification });
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
      .where(and(eq(agents.id, parsedId), eq(agents.accountStatus, "active")));
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "Agent delete failed" }, { status: 500 });
  }
}
