import NextAuth from "next-auth";
import Resend from "next-auth/providers/resend";
import Google from "next-auth/providers/google";
import { DrizzleAdapter } from "@auth/drizzle-adapter";
import { db } from "@/db";
import { agents, users, accounts, sessions, verificationTokens } from "@/db/schema";
import { eq } from "drizzle-orm";
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

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  providers: [
    ...(resendEnabled
      ? [
          Resend({
            apiKey: process.env.RESEND_API_KEY,
            from: process.env.FROM_EMAIL || "homix@invoice.homixny.com",
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
    async jwt({ token, user, trigger }) {
      // On sign-in, lazy-load the agent and embed in the token
      if (user?.id) {
        token.userId = user.id;
        const agent = await db.select().from(agents).where(eq(agents.userId, user.id)).get();
        token.agentId = agent?.id || null;
        token.isAdmin = agent?.isAdmin || false;
        token.isActive = agent?.isActive || false;
      } else if (trigger === "update" || trigger === "signIn") {
        // Refresh from DB on update events
        if (token.userId) {
          const agent = await db
            .select()
            .from(agents)
            .where(eq(agents.userId, String(token.userId)))
            .get();
          token.agentId = agent?.id || null;
          token.isAdmin = agent?.isAdmin || false;
          token.isActive = agent?.isActive || false;
        }
      }
      return token;
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
      if (!user.email) return;
      const isAdminEmail = adminEmails.includes(user.email.toLowerCase());
      await db.insert(agents).values({
        userId: user.id,
        name: user.name || user.email.split("@")[0],
        email: user.email,
        splitPct: 50,
        isActive: isAdminEmail,
        isAdmin: isAdminEmail,
        joinedAt: new Date().toISOString().slice(0, 10),
      });
    },
  },
});
