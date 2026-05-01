// Edge-safe proxy/middleware. The `authorized` callback inside authConfig
// handles redirects (returns true to allow, false to redirect to /login).
import NextAuth from "next-auth";
import { authConfig } from "@/auth.config";

export default NextAuth(authConfig).auth;

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
