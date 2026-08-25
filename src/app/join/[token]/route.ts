import { NextResponse } from "next/server";
import { findUsableInvitation, ONBOARDING_INVITE_COOKIE } from "@/lib/onboarding-invites";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  const invite = await findUsableInvitation(token);
  const destination = new URL(invite ? "/login" : "/login?invite=invalid", request.url);
  const response = NextResponse.redirect(destination);
  if (invite) {
    response.cookies.set(ONBOARDING_INVITE_COOKIE, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 30,
    });
  }
  return response;
}
