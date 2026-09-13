import { NextRequest } from "next/server";
import { z } from "zod";
import { requireAdminApi } from "@/lib/auth-guards";
import { OnboardingCommandError, recordOnboardingReceipt } from "@/lib/onboarding-admin";

export async function POST(request: NextRequest) {
  const auth = await requireAdminApi();
  if ("error" in auth) return auth.error;
  if (request.headers.get("origin") !== request.nextUrl.origin) return Response.json({ error: "Invalid origin" }, { status: 403 });
  try {
    return Response.json(await recordOnboardingReceipt(auth.session.user.agentId!, await request.json()), { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    if (error instanceof OnboardingCommandError) return Response.json({ error: error.message }, { status: error.status });
    if (error instanceof z.ZodError || error instanceof SyntaxError) return Response.json({ error: "Enter a valid amount, payment reference and date" }, { status: 400 });
    console.error("Receipt recording failed", error);
    return Response.json({ error: "Unable to record receipt. Please retry with the same request." }, { status: 500 });
  }
}
