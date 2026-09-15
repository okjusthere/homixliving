import { NextResponse } from "next/server";
import { LEGACY_CLAIM_COOKIE } from "@/lib/legacy-agent-claim-token";

export async function GET(request: Request) {
  const response = NextResponse.redirect(new URL("/login", request.url));
  response.cookies.delete(LEGACY_CLAIM_COOKIE);
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}
