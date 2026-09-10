import { NextResponse } from "next/server";
import { and, isNotNull, ne } from "drizzle-orm";
import { db } from "@/db";
import { agents } from "@/db/schema";
import { syncOnboardingAgreement } from "@/lib/onboarding-agreement";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function isAuthorizedCronRequest(request: Request) {
  const secret = process.env.CRON_SECRET?.trim();
  return Boolean(secret && request.headers.get("authorization") === `Bearer ${secret}`);
}

export async function GET(request: Request) {
  if (!isAuthorizedCronRequest(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rows = await db
    .select()
    .from(agents)
    .where(and(
      isNotNull(agents.esignEnvelopeId),
      ne(agents.agreementStatus, "completed"),
    ))
    .limit(50);

  let completed = 0;
  const failures: number[] = [];
  for (const agent of rows) {
    try {
      const synced = await syncOnboardingAgreement(agent);
      if (synced.agreementStatus === "completed") completed += 1;
    } catch (error) {
      console.error("Onboarding agreement reconciliation failed", {
        agentId: agent.id,
        envelopeId: agent.esignEnvelopeId,
        error,
      });
      failures.push(agent.id);
    }
  }

  return NextResponse.json(
    { scanned: rows.length, completed, failed: failures.length, failures },
    { status: failures.length > 0 ? 500 : 200 },
  );
}
