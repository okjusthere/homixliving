import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
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

async function upsertAgentFromGoogle(user: {
  email?: string | null;
  name?: string | null;
}) {
  if (!user.email) throw new Error("Google account has no email");

  const email = user.email.trim().toLowerCase();
  const admin = isAdminEmail(email);
  const now = new Date().toISOString();

  // Detect a genuinely new signup (the jwt callback runs on every token
  // refresh, so the "notify admins" event must fire only on first creation).
  const [preExisting] = await db
    .select({ id: agents.id })
    .from(agents)
    .where(sql`lower(${agents.email}) = ${email}`)
    .limit(1);

  await db
    .insert(agents)
    .values({
      email,
      name: user.name || email.split("@")[0],
      isAdmin: admin,
      isActive: admin,
      approvalStatus: admin ? "approved" : "pending",
      splitPct: DEFAULT_AGENT_SPLIT_PCT,
      joinedAt: now.slice(0, 10),
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoNothing({ target: agents.email });

  if (!preExisting && !admin) {
    // New pending agent — tell the admins so approval doesn't sit unnoticed.
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
  }

  const [existing] = await db
    .select()
    .from(agents)
    .where(sql`lower(${agents.email}) = ${email}`)
    .limit(1);

  if (!existing) {
    throw new Error(`Failed to upsert agent for ${email}`);
  }

  const needsAdminFlip = Boolean(existing.isAdmin) !== admin;
  const needsActiveForce = admin && !existing.isActive;
  const needsNameFill = !existing.name && Boolean(user.name);

  if (needsAdminFlip || needsActiveForce || needsNameFill) {
    const [updated] = await db
      .update(agents)
      .set({
        isAdmin: admin,
        ...(admin ? { approvalStatus: "approved" } : {}),
        ...(needsActiveForce ? { isActive: true, approvalStatus: "approved" } : {}),
        ...(needsNameFill ? { name: user.name! } : {}),
        updatedAt: now,
      })
      .where(eq(agents.id, existing.id))
      .returning();

    return updated || existing;
  }

  return existing;
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
    async jwt({ token, user }) {
      const email =
        (typeof user?.email === "string" && user.email) ||
        (typeof token.email === "string" && token.email) ||
        "";

      if (!email) return token;

      const agent = await upsertAgentFromGoogle({
        email,
        name:
          (typeof user?.name === "string" && user.name) ||
          (typeof token.name === "string" ? token.name : null),
      });

      token.agentId = agent.id;
      token.email = agent.email;
      token.name = agent.name;
      token.isAdmin = Boolean(agent.isAdmin);
      token.isActive = Boolean(agent.isActive);

      return token;
    },
    // session callback intentionally omitted — it lives in src/auth.config.ts
    // so edge middleware sees the same custom fields. See the comment there.
  },
});
