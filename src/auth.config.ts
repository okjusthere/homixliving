// Edge-safe Auth.js config used by Proxy.
// Uses JWT cookies so auth can be checked without database session tables.
import type { NextAuthConfig } from "next-auth";
import { NextResponse } from "next/server";

export const authConfig: NextAuthConfig = {
  providers: [], // Real providers are added in src/auth.ts
  // Custom domains (e.g. living.homixny.com) need explicit trust.
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
    async authorized({ request, auth }) {
      const { pathname } = request.nextUrl;
      const PUBLIC_PATHS = ["/login", "/pending", "/api/auth", "/_next", "/favicon"];
      const isPublic = PUBLIC_PATHS.some((p) => pathname.startsWith(p));
      if (isPublic) return true;
      if (!auth) return false;
      if (pathname.startsWith("/api")) return true;
      if (!auth.user?.isAdmin && !auth.user?.isActive) {
        return NextResponse.redirect(new URL("/pending", request.nextUrl));
      }
      return true;
    },
  },
};
