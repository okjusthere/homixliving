import { NextRequest, NextResponse } from "next/server";
import {
  ONBOARDING_ENTRY_COOKIE,
  ONBOARDING_ENTRY_MAX_AGE_SECONDS,
  onboardingEntryFromSearchParams,
  serializeOnboardingEntry,
} from "@/lib/onboarding-entry";

export function GET(request: NextRequest) {
  const context = onboardingEntryFromSearchParams(request.nextUrl.searchParams);
  const loginUrl = new URL("/login", request.url);
  loginUrl.searchParams.set("apply", "1");
  loginUrl.searchParams.set("lang", context.locale);
  loginUrl.searchParams.set("source", context.source === "website" ? "homix-web" : "direct");
  if (context.plan) loginUrl.searchParams.set("plan", context.plan);
  if (context.campaign) loginUrl.searchParams.set("campaign", context.campaign);

  const response = NextResponse.redirect(loginUrl);
  const secure = process.env.NODE_ENV === "production";
  response.cookies.set(ONBOARDING_ENTRY_COOKIE, serializeOnboardingEntry(context), {
    httpOnly: true,
    secure,
    sameSite: "lax",
    path: "/",
    maxAge: ONBOARDING_ENTRY_MAX_AGE_SECONDS,
  });
  response.cookies.set("locale", context.locale, {
    httpOnly: false,
    secure,
    sameSite: "lax",
    path: "/",
    maxAge: 365 * 24 * 60 * 60,
  });

  return response;
}

