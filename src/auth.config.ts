// Edge-safe Auth.js config — used by proxy/middleware.
// Uses JWT strategy so sessions can be verified at the edge without DB access.
import type { NextAuthConfig } from "next-auth";

export const authConfig: NextAuthConfig = {
  providers: [], // Real providers are added in src/auth.ts
  pages: {
    signIn: "/login",
    verifyRequest: "/login/check-email",
    error: "/login",
  },
  session: {
    strategy: "jwt",
    maxAge: 30 * 24 * 60 * 60,
  },
  callbacks: {
    async authorized({ request, auth }) {
      const { pathname } = request.nextUrl;
      const PUBLIC_PATHS = ["/login", "/api/auth", "/_next", "/favicon"];
      const isPublic = PUBLIC_PATHS.some((p) => pathname.startsWith(p));
      if (isPublic) return true;
      return !!auth;
    },
  },
};
