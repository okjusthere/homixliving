import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import { after } from "next/server";
import { db } from "@/db";
import { agents } from "@/db/schema";
import { eq, sql } from "drizzle-orm";
import { authConfig } from "./auth.config";
import { DEFAULT_AGENT_SPLIT_PCT } from "@/lib/splits";
import { adminAgentIds, notify } from "@/lib/notify";

const adminEmails = (process.env.ADMIN_EMAILS ?? "")
  .split(",")
  .map((email) => email.trim().toLowerCase())
  .filter(Boolean);

const googleEnabled =
  !!process.env.AUTH_GOOGLE_ID && !!process.env.AUTH_GOOGLE_SECRET;

const isAdminEmail = (email: string) =>
  adminEmails.includes(email.toLowerCase());

type Agent = typeof agents.$inferSelect;

async function reconcileConfiguredAccess(
  existing: Agent,
  admin: boolean,
  name: string | null | undefined,
) {
  const needsAdminFlip = Boolean(existing.isAdmin) !== admin;
  const needsActiveForce = admin && existing.accountStatus !== "active";
  const needsNameFill = !existing.name && Boolean(name);

  if (!needsAdminFlip && !needsActiveForce && !needsNameFill) {
    return existing;
  }

  const [updated] = await db
    .update(agents)
    .set({
      isAdmin: admin,
      ...(needsActiveForce ? { accountStatus: "active" as const } : {}),
      ...(needsNameFill ? { name: name! } : {}),
      updatedAt: new Date().toISOString(),
    })
    .where(eq(agents.id, existing.id))
    .returning();

  return updated || existing;
}

async function loadAgentFromDatabase(user: {
  email?: string | null;
  name?: string | null;
}) {
  if (!user.email) throw new Error("Google account has no email");

  const email = user.email.trim().toLowerCase();
  const [existing] = await db
    .select()
    .from(agents)
    .where(sql`lower(${agents.email}) = ${email}`)
    .limit(1);

  if (!existing) {
    throw new Error(`Agent account not found for ${email}`);
  }

  return reconcileConfiguredAccess(
    existing,
    isAdminEmail(email),
    user.name,
  );
}

async function upsertAgentFromGoogle(user: {
  email?: string | null;
  name?: string | null;
}) {
  if (!user.email) throw new Error("Google account has no email");

  const email = user.email.trim().toLowerCase();
  const admin = isAdminEmail(email);
  const now = new Date().toISOString();

  const [created] = await db
    .insert(agents)
    .values({
      email,
      name: user.name || email.split("@")[0],
      isAdmin: admin,
      accountStatus: admin ? "active" : "pending",
      splitPct: DEFAULT_AGENT_SPLIT_PCT,
      joinedAt: now.slice(0, 10),
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoNothing({ target: agents.email })
    .returning();

  if (created && !admin) {
    // Admin notification is not part of the OAuth critical path.
    after(async () => {
      try {
        await notify({
          recipientAgentIds: await adminAgentIds(),
          type: "agent_pending",
          title: `新经纪人待审批：${user.name || email}`,
          body: `${email} 刚通过 Google 登录注册，等待开通。`,
          href: "/agents",
          dedupeKey: `agent-pending:${email}`,
          email: true,
        });
      } catch (error) {
        console.error("agent_pending notification failed", error);
      }
    });
  }

  const existing =
    created ||
    (
      await db
        .select()
        .from(agents)
        .where(sql`lower(${agents.email}) = ${email}`)
        .limit(1)
    )[0];

  if (!existing) {
    throw new Error(`Failed to upsert agent for ${email}`);
  }

  return reconcileConfiguredAccess(existing, admin, user.name);
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  providers: googleEnabled
    ? [
        Google({
          clientId: process.env.AUTH_GOOGLE_ID!,
          clientSecret: process.env.AUTH_GOOGLE_SECRET!,
          allowDangerousEmailAccountLinking: true,
        }),
      ]
    : [],
  callbacks: {
    ...authConfig.callbacks,
    async jwt({ token, user, trigger }) {
      const email =
        (typeof user?.email === "string" && user.email) ||
        (typeof token.email === "string" && token.email) ||
        "";

      if (!email) return token;

      // `auth()` re-invokes this callback on nearly every page/API request
      // (it's how session reads work with the JWT strategy), and
      // upsertAgentFromGoogle does 2-4 DB round-trips. Running that on every
      // single request — multiplied by Next.js's automatic link prefetching
      // firing several requests at once — was hammering the shared Supabase
      // connection pool and causing the CONNECT_TIMEOUTs seen in prod. Only
      // hit the database on actual sign-in (`user` present) or when the
      // cached isAdmin/accountStatus is more than a few minutes old, so an
      // admin approving/promoting someone still lands within a few minutes
      // without a full sign-out required.
      const isFreshSignIn = Boolean(user);
      const checkedAt = typeof token.checkedAt === "number" ? token.checkedAt : 0;
      const isStale =
        trigger === "update" || Date.now() - checkedAt > 5 * 60 * 1000;
      if (!isFreshSignIn && !isStale) {
        return token;
      }

      const identity = {
        email,
        name:
          (typeof user?.name === "string" && user.name) ||
          (typeof token.name === "string" ? token.name : null),
      };
      const agent = isFreshSignIn
        ? await upsertAgentFromGoogle(identity)
        : await loadAgentFromDatabase(identity);

      token.agentId = agent.id;
      token.email = agent.email;
      token.name = agent.name;
      token.isAdmin = Boolean(agent.isAdmin);
      token.accountStatus = agent.accountStatus;
      // Derived compatibility flag for deal-access helpers. The database has
      // one lifecycle source of truth: account_status.
      token.isActive = agent.accountStatus === "active";
      token.checkedAt = Date.now();

      return token;
    },
    // session callback intentionally omitted — it lives in src/auth.config.ts
    // so edge middleware sees the same custom fields. See the comment there.
  },
});
