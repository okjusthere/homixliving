import NextAuth from "next-auth";
import Resend from "next-auth/providers/resend";
import Google from "next-auth/providers/google";
import { DrizzleAdapter } from "@auth/drizzle-adapter";
import { db } from "@/db";
import { agents, users, accounts, sessions, verificationTokens } from "@/db/schema";
import { eq, sql } from "drizzle-orm";
import { authConfig } from "./auth.config";

const adminEmails = (process.env.ADMIN_EMAILS || "")
  .split(",")
  .map((e) => e.trim().toLowerCase())
  .filter(Boolean);

// Conditional providers (matches Openhouse pattern):
// only enable a provider when its credentials are present.
const googleEnabled =
  !!process.env.AUTH_GOOGLE_ID && !!process.env.AUTH_GOOGLE_SECRET;
const resendEnabled = !!process.env.RESEND_API_KEY;
const authEmailFrom =
  process.env.AUTH_EMAIL_FROM ||
  process.env.FROM_EMAIL ||
  "invoice@homixny.com";

type AuthUser = {
  id?: string | null;
  name?: string | null;
  email?: string | null;
};

type AgentRow = typeof agents.$inferSelect;

function normalizeEmail(email: string | null | undefined) {
  return email?.trim().toLowerCase() || null;
}

function isAdminEmail(email: string | null | undefined) {
  const normalized = normalizeEmail(email);
  return normalized ? adminEmails.includes(normalized) : false;
}

function pickAuthAgent(rows: AgentRow[]) {
  return [...rows].sort((a, b) => {
    if (Boolean(a.isAdmin) !== Boolean(b.isAdmin)) {
      return Number(Boolean(b.isAdmin)) - Number(Boolean(a.isAdmin));
    }
    if (Boolean(a.isActive) !== Boolean(b.isActive)) {
      return Number(Boolean(b.isActive)) - Number(Boolean(a.isActive));
    }
    return a.id - b.id;
  })[0] || null;
}

async function findAuthAgent(user: AuthUser) {
  const userId = user.id ? String(user.id) : null;
  const email = normalizeEmail(user.email);

  if (userId) {
    const rows = await db.select().from(agents).where(eq(agents.userId, userId));
    const selected = pickAuthAgent(rows);
    if (selected) return selected;
  }

  if (email) {
    const rows = await db
      .select()
      .from(agents)
      .where(sql`lower(${agents.email}) = ${email}`);
    const selected = pickAuthAgent(rows);
    if (selected) return selected;
  }

  return null;
}

async function ensureAuthAgent(user: AuthUser) {
  const userId = user.id ? String(user.id) : null;
  const email = normalizeEmail(user.email);
  if (!userId || !email) return null;

  const admin = isAdminEmail(email);
  const existing = await findAuthAgent({ id: userId, email });
  const now = new Date().toISOString();

  if (existing) {
    const update: Partial<typeof agents.$inferInsert> = {};

    if (!existing.userId) update.userId = userId;
    if (normalizeEmail(existing.email) !== email) update.email = email;
    if (!existing.name && user.name) update.name = user.name;

    // ADMIN_EMAILS is the bootstrap source of truth for owner/admin accounts.
    // It should promote an existing pending/manual agent, but it should not
    // auto-activate non-admin brokers.
    if (admin && !existing.isAdmin) update.isAdmin = true;
    if (admin && !existing.isActive) update.isActive = true;

    if (Object.keys(update).length === 0) return existing;

    const [updated] = await db
      .update(agents)
      .set({ ...update, updatedAt: now })
      .where(eq(agents.id, existing.id))
      .returning();
    return updated || existing;
  }

  const [created] = await db
    .insert(agents)
    .values({
      userId,
      name: user.name || email.split("@")[0],
      email,
      splitPct: 50,
      isActive: admin,
      isAdmin: admin,
      joinedAt: new Date().toISOString().slice(0, 10),
      createdAt: now,
      updatedAt: now,
    })
    .returning();

  return created || null;
}

function applyAgentToToken(
  token: Record<string, unknown>,
  agent: AgentRow | null
) {
  token.agentId = agent?.id || null;
  token.isAdmin = Boolean(agent?.isAdmin);
  token.isActive = Boolean(agent?.isActive);
  return token;
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  providers: [
    ...(resendEnabled
      ? [
          Resend({
            apiKey: process.env.RESEND_API_KEY,
            from: authEmailFrom,
          }),
        ]
      : []),
    ...(googleEnabled
      ? [
          Google({
            clientId: process.env.AUTH_GOOGLE_ID,
            clientSecret: process.env.AUTH_GOOGLE_SECRET,
            // Auto-link Google account to an existing user with the same email
            // (e.g. someone who first signed in via magic link). Safe within an
            // org-scoped app where email is the source of truth.
            allowDangerousEmailAccountLinking: true,
          }),
        ]
      : []),
  ],
  adapter: DrizzleAdapter(db, {
    usersTable: users,
    accountsTable: accounts,
    sessionsTable: sessions,
    verificationTokensTable: verificationTokens,
  }),
  callbacks: {
    ...authConfig.callbacks,
    async jwt({ token, user }) {
      const userId = user?.id ? String(user.id) : token.userId ? String(token.userId) : null;
      const email = normalizeEmail(user?.email || token.email);

      if (!userId) return applyAgentToToken(token, null);

      token.userId = userId;

      // Refresh on every session read. Approval/revocation changes live in the
      // agents table, so a 30-day JWT must not be treated as the source of truth.
      const agent = await ensureAuthAgent({
        id: userId,
        email,
        name: user?.name || (typeof token.name === "string" ? token.name : null),
      });

      return applyAgentToToken(token, agent);
    },
    async session({ session, token }) {
      if (token.userId) session.user.id = String(token.userId);
      session.user.agentId = (token.agentId as number | null) ?? null;
      session.user.isAdmin = Boolean(token.isAdmin);
      session.user.isActive = Boolean(token.isActive);
      return session;
    },
  },
  events: {
    async createUser({ user }) {
      await ensureAuthAgent(user);
    },
  },
});
