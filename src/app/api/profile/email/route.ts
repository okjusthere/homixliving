import { NextResponse } from "next/server";
import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { agents } from "@/db/schema";
import { isConfiguredAdminEmail } from "@/lib/admin-emails";
import { requireActiveAgentApi } from "@/lib/auth-guards";
import { logAudit } from "@/lib/audit";
import {
  EMAIL_CHANGE_TTL_MS,
  emailChangeExpiresAt,
  isValidLoginEmail,
  normalizeEmail,
} from "@/lib/email-change";
import {
  EMAIL_CHANGE_COOKIE,
  createEmailChangeToken,
  hashEmailChangeToken,
} from "@/lib/email-change-token";

type EmailChangeBody = { email?: unknown };

export async function POST(request: Request) {
  const authResult = await requireActiveAgentApi();
  if ("error" in authResult) return authResult.error;

  const agentId = authResult.session.user.agentId;
  if (!agentId) {
    return NextResponse.json(
      { error: "Agent account not found", code: "AGENT_NOT_FOUND" },
      { status: 404 },
    );
  }

  const body = (await request.json().catch(() => null)) as EmailChangeBody | null;
  const pendingEmail = normalizeEmail(body?.email);
  if (!pendingEmail || !isValidLoginEmail(pendingEmail)) {
    return NextResponse.json(
      { error: "Enter a valid email address", code: "INVALID_EMAIL" },
      { status: 400 },
    );
  }

  const [agent] = await db
    .select()
    .from(agents)
    .where(eq(agents.id, agentId))
    .limit(1);
  if (!agent) {
    return NextResponse.json(
      { error: "Agent account not found", code: "AGENT_NOT_FOUND" },
      { status: 404 },
    );
  }

  if (agent.email.toLowerCase() === pendingEmail) {
    return NextResponse.json(
      { error: "This is already your login email", code: "SAME_EMAIL" },
      { status: 409 },
    );
  }

  if (
    (authResult.session.user.isAdmin || agent.isAdmin) &&
    !isConfiguredAdminEmail(pendingEmail)
  ) {
    return NextResponse.json(
      {
        error: "Add the new address to ADMIN_EMAILS before changing an admin login.",
        code: "ADMIN_EMAIL_NOT_CONFIGURED",
      },
      { status: 409 },
    );
  }

  // Expired requests must not reserve an email forever through the partial
  // unique index. Cleanup is idempotent and bounded to the staged fields.
  const expiredBefore = new Date(Date.now() - EMAIL_CHANGE_TTL_MS).toISOString();
  await db
    .update(agents)
    .set({
      pendingEmail: null,
      emailChangeRequestedAt: null,
      emailChangeTokenHash: null,
    })
    .where(sql`
      ${agents.pendingEmail} IS NOT NULL
      AND (
        ${agents.emailChangeRequestedAt} IS NULL
        OR ${agents.emailChangeRequestedAt} < ${expiredBefore}
      )
    `);

  const [conflict] = await db
    .select({ id: agents.id })
    .from(agents)
    .where(sql`
      ${agents.id} <> ${agentId}
      AND (
        lower(${agents.email}) = ${pendingEmail}
        OR lower(COALESCE(${agents.pendingEmail}, '')) = ${pendingEmail}
      )
    `)
    .limit(1);
  if (conflict) {
    return NextResponse.json(
      { error: "This email is already in use", code: "EMAIL_IN_USE" },
      { status: 409 },
    );
  }

  const requestedAt = new Date().toISOString();
  const verificationToken = createEmailChangeToken();
  try {
    await db
      .update(agents)
      .set({
        pendingEmail,
        emailChangeRequestedAt: requestedAt,
        emailChangeTokenHash: hashEmailChangeToken(verificationToken),
        updatedAt: requestedAt,
      })
      .where(eq(agents.id, agentId));
  } catch (error) {
    const code =
      error && typeof error === "object" && "code" in error
        ? String(error.code)
        : null;
    if (code === "23505") {
      return NextResponse.json(
        { error: "This email is already in use", code: "EMAIL_IN_USE" },
        { status: 409 },
      );
    }
    throw error;
  }

  await logAudit(
    authResult.session,
    "request_email_change",
    "agent",
    agentId,
    `申请将登录邮箱更换为 ${pendingEmail}`,
    { oldEmail: agent.email, pendingEmail },
  );

  const response = NextResponse.json({
    pendingEmail,
    expiresAt: emailChangeExpiresAt(requestedAt),
  });
  response.cookies.set(EMAIL_CHANGE_COOKIE, verificationToken, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: Math.floor(EMAIL_CHANGE_TTL_MS / 1000),
  });
  return response;
}

export async function DELETE() {
  const authResult = await requireActiveAgentApi();
  if ("error" in authResult) return authResult.error;

  const agentId = authResult.session.user.agentId;
  if (!agentId) {
    return NextResponse.json(
      { error: "Agent account not found", code: "AGENT_NOT_FOUND" },
      { status: 404 },
    );
  }

  const [agent] = await db
    .select({ pendingEmail: agents.pendingEmail })
    .from(agents)
    .where(eq(agents.id, agentId))
    .limit(1);

  const now = new Date().toISOString();
  await db
    .update(agents)
    .set({
      pendingEmail: null,
      emailChangeRequestedAt: null,
      emailChangeTokenHash: null,
      updatedAt: now,
    })
    .where(eq(agents.id, agentId));

  await logAudit(
    authResult.session,
    "cancel_email_change",
    "agent",
    agentId,
    "取消登录邮箱更换申请",
    { pendingEmail: agent?.pendingEmail ?? null },
  );

  const response = NextResponse.json({ ok: true });
  response.cookies.delete(EMAIL_CHANGE_COOKIE);
  return response;
}
