// Edge-safe Auth.js config used by Proxy.
// Uses JWT cookies so auth can be checked without database session tables.
import type { NextAuthConfig } from "next-auth";
import { NextResponse } from "next/server";

export const authConfig: NextAuthConfig = {
  providers: [], // Real providers are added in src/auth.ts
  // Custom domains (e.g. deals.homixny.com) need explicit trust.
  trustHost: true,
  pages: {
    signIn: "/login",
    error: "/login",
  },
  session: {
    strategy: "jwt",
    maxAge: 30 * 24 * 60 * 60,
  },
  callbacks: {
    // Session callback MUST live in the edge config (this file), not in
    // src/auth.ts. Auth.js v5 middleware runs in edge runtime and only sees
    // callbacks defined here. Without this, `auth.user.isAdmin` /
    // `auth.user.isActive` are `undefined` in middleware (because the JWT
    // token fields never get copied into the session), `!undefined === true`
    // forces every authenticated request into `/pending`, then `/pending`
    // (running in node runtime, sees the right values) sends admins back to
    // `/` → infinite redirect loop. Keep this in sync with the JWT callback
    // in src/auth.ts (any field set on token must be mirrored here).
    async session({ session, token }) {
      session.user.id = String(token.agentId);
      session.user.agentId = (token.agentId as number | null) ?? null;
      session.user.email =
        typeof token.email === "string" ? token.email : session.user.email;
      session.user.name =
        typeof token.name === "string" ? token.name : session.user.name;
      session.user.isAdmin = Boolean(token.isAdmin);
      session.user.isActive = Boolean(token.isActive);
      return session;
    },
    async authorized({ request, auth }) {
      const { pathname } = request.nextUrl;
      // Genuinely public — no session required. Cron routes are unauthenticated
      // at the edge and enforce their own CRON_SECRET; the Stripe webhook
      // verifies its signature; checkout/pay is public by design.
      const PUBLIC_PATHS = [
        "/login",
        "/pending",
        "/pay",
        "/api/auth",
        "/api/checkout",
        "/api/stripe/webhook",
        "/api/cron",
        // Self-enforces admin session OR CRON_SECRET bearer (schema rollouts
        // must be triggerable without a browser session).
        "/api/admin/ensure-schema",
        "/_next",
        "/favicon",
      ];
      const isPublic = PUBLIC_PATHS.some((p) => pathname.startsWith(p));
      if (isPublic) return true;
      if (!auth) return false;
      // Default-DENY for data APIs: only active/admin users clear the edge, so a
      // route that forgets its own guard is no longer wide open to any signed-in
      // (including pending, self-registered) Google account.
      if (pathname.startsWith("/api")) {
        return Boolean(auth.user?.isAdmin || auth.user?.isActive);
      }
      if (!auth.user?.isAdmin && !auth.user?.isActive) {
        return NextResponse.redirect(new URL("/pending", request.nextUrl));
      }
      return true;
    },
  },
};
