import { NextResponse } from "next/server";
import { findUsableInvitation, ONBOARDING_INVITE_COOKIE } from "@/lib/onboarding-invites";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  const invite = await findUsableInvitation(token);
  const destination = new URL(invite ? "/login?apply=1" : "/login?invite=invalid", request.url);
  const locale = new URL(request.url).searchParams.get("lang");
  if (invite) destination.searchParams.set("invitation", token);
  if (locale === "en" || locale === "zh") destination.searchParams.set("lang", locale);
  const response = NextResponse.redirect(destination);
  response.headers.set("Cache-Control", "private, no-store");
  response.headers.set("Referrer-Policy", "no-referrer");
  if (locale === "en" || locale === "zh") {
    response.cookies.set("locale", locale, { path: "/", sameSite: "lax", maxAge: 365 * 86400 });
  }
  if (invite) {
    response.cookies.set(ONBOARDING_INVITE_COOKIE, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 30,
    });
  } else {
    response.cookies.delete(ONBOARDING_INVITE_COOKIE);
  }
  return response;
}
