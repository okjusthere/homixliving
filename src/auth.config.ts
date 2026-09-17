// Edge-safe Auth.js config used by Proxy.
// Uses JWT cookies so auth can be checked without database session tables.
import type { NextAuthConfig } from "next-auth";
import { NextResponse } from "next/server";
import { isConfiguredAdminEmail } from "@/lib/admin-emails";

function isPathOrChild(pathname: string, prefix: string) {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

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
    // `auth.user.accountStatus` is `undefined` in middleware (because the JWT
    // token fields never get copied into the session), `!undefined === true`
    // forces every authenticated request into `/pending`, then `/pending`
    // (running in node runtime, sees the right values) sends admins back to
    // `/` → infinite redirect loop. Keep this in sync with the JWT callback
    // in src/auth.ts (any field set on token must be mirrored here).
    async session({ session, token }) {
      session.user.id = String(token.agentId);
      session.user.agentId = (token.agentId as number | null) ?? null;
      session.user.loginEmail = typeof token.loginEmail === "string" ? token.loginEmail : null;
      session.user.email =
        typeof token.email === "string" ? token.email : session.user.email;
      session.user.name =
        typeof token.name === "string" ? token.name : session.user.name;
      session.user.isTeamLeader = Boolean(token.isTeamLeader);
      session.user.accountStatus =
        token.accountStatus === "active" || token.accountStatus === "inactive"
          ? token.accountStatus
          : "pending";
      session.user.isAdmin = Boolean(token.isAdmin) && session.user.accountStatus === "active"
        && isConfiguredAdminEmail(session.user.loginEmail || "");
      session.user.isActive = session.user.accountStatus === "active";
      return session;
    },
    async authorized({ request, auth }) {
      const { pathname } = request.nextUrl;
      // Backend callbacks have no browser session. Only this exact endpoint
      // bypasses the login gate; its handler verifies the HMAC before reading
      // or changing signing state. Customer signing APIs stay protected.
      if (pathname === "/api/signing/events" && request.method === "POST") return true;
      // Genuinely public — no session required. Cron routes are unauthenticated
      // at the edge and enforce their own CRON_SECRET; the Stripe webhook
      // verifies its signature; checkout/pay is public by design.
      const PUBLIC_PATHS = [
        "/login",
        "/pending",
        "/join",
        "/claim",
        "/pay",
        "/api/auth",
        // Pending users authenticate inside these handlers. They must be able
        // to complete profile, agreement, and payment before activation.
        "/api/onboarding",
        "/api/checkout",
        "/api/stripe/webhook",
        "/api/cron",
        // Self-enforces admin session OR CRON_SECRET bearer (schema rollouts
        // must be triggerable without a browser session).
        "/api/admin/ensure-schema",
        "/_next",
        "/favicon.ico",
        "/icon.png",
        "/apple-icon.png",
        "/manifest.webmanifest",
        "/icons",
        "/auth",
      ];
      const isPublic = PUBLIC_PATHS.some((p) => isPathOrChild(pathname, p));
      if (isPublic) return true;
      if (!auth) return false;
      // These exact routes have fresh, database-backed capability guards.
      // This is routing admission only; a JWT never grants limited access.
      const capabilityPage = ["/limited", "/training", "/resources"].some((p) => pathname === p);
      const capabilityApi = ["/api/training", "/api/resources", "/api/onboarding/access"].includes(pathname) || /^\/api\/training\/\d+\/view$/.test(pathname);
      if (capabilityPage || capabilityApi) return true;
      // Default-DENY for data APIs: only active/admin users clear the edge, so a
      // route that forgets its own guard is no longer wide open to any signed-in
      // (including pending, self-registered) Google account.
      if (pathname.startsWith("/api")) {
        return Boolean(auth.user?.isAdmin || auth.user?.accountStatus === "active");
      }
      if (!auth.user?.isAdmin && auth.user?.accountStatus !== "active") {
        return NextResponse.redirect(new URL("/pending", request.nextUrl));
      }
      return true;
    },
  },
};
