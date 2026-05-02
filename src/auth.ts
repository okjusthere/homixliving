import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import { db } from "@/db";
import { agents } from "@/db/schema";
import { eq, sql } from "drizzle-orm";
import { authConfig } from "./auth.config";

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

  await db
    .insert(agents)
    .values({
      email,
      name: user.name || email.split("@")[0],
      isAdmin: admin,
      isActive: admin,
      splitPct: 50,
      joinedAt: now.slice(0, 10),
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoNothing({ target: agents.email });

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
        ...(needsActiveForce ? { isActive: true } : {}),
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
