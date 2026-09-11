import { NextResponse } from "next/server";
import { reconcileOnboardingAgreements } from "@/lib/onboarding-agreement-reconciliation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const result = await reconcileOnboardingAgreements();
  return NextResponse.json(result, { status: result.failed > 0 ? 500 : 200 });
}
