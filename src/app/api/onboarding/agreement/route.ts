import { z } from "zod";
import { and, desc, eq, gt, inArray } from "drizzle-orm";
import { db } from "@/db";
import { agents, commerceOrders } from "@/db/schema";
import { currentSession } from "@/lib/auth-guards";
import {
  onboardingAgreementAllowsPayment,
  onboardingPaymentProduct,
} from "@/lib/onboarding";
import { verifiedManualContract } from "@/lib/onboarding-requirements";
import { syncOnboardingAgreement } from "@/lib/onboarding-agreement";
import {
  availableOnboardingPackage,
  prepareOnboardingSigning,
  recoverOnboardingSigning,
} from "@/lib/signing-onboarding";
import { signingApiError } from "@/lib/signing-bridge";

export const runtime = "nodejs";
export const maxDuration = 300;
const headers = { "Cache-Control": "private, no-store" };
async function currentAgent() {
  const session = await currentSession();
  if (!session?.user?.agentId || session.user.accountStatus === "inactive")
    return null;
  return (
    (
      await db
        .select()
        .from(agents)
        .where(eq(agents.id, session.user.agentId))
        .limit(1)
    )[0] || null
  );
}
export async function GET() {
  const agent = await currentAgent();
  if (!agent) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const [payment] = await db
    .select({ channel: commerceOrders.paymentChannel })
    .from(commerceOrders)
    .where(
      and(
        eq(commerceOrders.agentId, agent.id),
        gt(commerceOrders.licenseTransferFeeCents, 0),
        inArray(commerceOrders.status, ["paid", "active"]),
      ),
    )
    .orderBy(desc(commerceOrders.paidAt), desc(commerceOrders.id))
    .limit(1);
  let configured = Boolean(agent.signingPreparation),
    synced = agent,
    syncError = false;
  if (!configured && !verifiedManualContract(agent)) {
    try {
      configured = Boolean(await availableOnboardingPackage(agent));
    } catch {
      configured = false;
    }
  }
  try {
    if (agent.signingRequestId) synced = await syncOnboardingAgreement(agent);
  } catch {
    syncError = true;
  }
  return Response.json(
    {
      configured,
      syncError,
      requestId: synced.signingRequestId,
      agreementStatus:
        synced.signingRequestId || verifiedManualContract(synced)
          ? synced.agreementStatus
          : synced.signingPreparation
            ? "preparing"
            : "not_started",
      agreementAgentSignedAt: synced.signingRequestId
        ? synced.agreementAgentSignedAt
        : null,
      agreementCountersignedAt: synced.signingRequestId
        ? synced.agreementCountersignedAt
        : null,
      contractSatisfied: onboardingAgreementAllowsPayment(synced),
      manualContract: verifiedManualContract(synced),
      onboardingStage: synced.onboardingStage,
      paymentStatus: synced.paymentStatus,
      paymentChannel: payment?.channel || null,
      paymentProduct: onboardingPaymentProduct(
        synced.plan,
        synced.affiliationTermMonths,
      ),
    },
    { headers },
  );
}
export async function POST(request: Request) {
  if (request.headers.get("origin") !== new URL(request.url).origin)
    return Response.json({ error: "INVALID_ORIGIN" }, { status: 403 });
  const agent = await currentAgent();
  if (!agent) return Response.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const body = z
      .object({ action: z.enum(["prepare", "recover"]).default("prepare") })
      .strict()
      .parse(
        request.headers.get("content-type")?.includes("application/json")
          ? await request.json()
          : {},
      );
    const updated =
      body.action === "recover"
        ? await recoverOnboardingSigning(agent)
        : await prepareOnboardingSigning(agent);
    return Response.json(
      {
        success: true,
        agreementStatus: updated.agreementStatus,
        requestId: updated.signingRequestId,
        contractSatisfied: onboardingAgreementAllowsPayment(updated),
        manualContract: verifiedManualContract(updated),
      },
      { headers },
    );
  } catch (error) {
    return signingApiError(error);
  }
}
