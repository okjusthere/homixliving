import { closeOnboardingSigning } from "@/lib/onboarding-close-signing";
import { SigningBridgeError } from "@/lib/signing-bridge";
import { z } from "zod";
import { requireAdminApi } from "@/lib/auth-guards";
import {
  OnboardingCommandError,
  runOnboardingCommand,
  completeOnboarding,
  completionInput,
} from "@/lib/onboarding-admin";
import { db } from "@/db";
import { agents } from "@/db/schema";
import { eq } from "drizzle-orm";
import { syncOnboardingAgreement } from "@/lib/onboarding-agreement";
import { verifiedManualContract } from "@/lib/onboarding-requirements";
import { finalizeAutomaticOnboardingActivation, retryOnboardingWebsiteSync } from "@/lib/onboarding-activation";
import { OnboardingStripeConflict, verifyOnboardingCheckoutsClosed } from "@/lib/onboarding-stripe-guard";
import { getStripe } from "@/lib/stripe";

export const maxDuration = 300;

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAdminApi();
  if ("error" in auth) return auth.error;
  if (request.headers.get("origin") !== new URL(request.url).origin)
    return Response.json({ error: "Invalid origin" }, { status: 403 });
  const { id } = await params;
  if (!/^\d+$/.test(id) || !Number.isSafeInteger(Number(id)))
    return Response.json({ error: "Invalid agent" }, { status: 400 });
  try {
    const body = await request.json();
    if (body?.action === "retry_website_sync") {
      z.object({ action: z.literal("retry_website_sync") }).strict().parse(body);
      const followUp = await retryOnboardingWebsiteSync(Number(id));
      return Response.json({ success: followUp.publicProfileReady, followUp }, { status: followUp.publicProfileReady ? 200 : 502 });
    }
    if (body?.action === "complete_onboarding") {
      const command = completionInput.parse(body);
      const [agent] = await db.select().from(agents).where(eq(agents.id, Number(id)));
      if (agent?.accountStatus === "pending")
        await verifyOnboardingCheckoutsClosed(Number(id), (sessionId) =>
          getStripe().checkout.sessions.retrieve(sessionId, {}, { timeout: 5000, maxNetworkRetries: 0 }));
      if (agent?.accountStatus === "pending" && agent.signingRequestId && !verifiedManualContract(agent))
        await syncOnboardingAgreement(agent);
      const result = await completeOnboarding(Number(id), auth.session.user.agentId!, command);
      const followUp = await finalizeAutomaticOnboardingActivation({ agentId: Number(id), orderId: result.orderId,
        manualApprovalKey: command.idempotencyKey, actorEmail: auth.session.user.email || undefined });
      return Response.json({ ...result, followUp }, { headers: { "Cache-Control": "private, no-store" } });
    }
    if (body?.action === "close_online") {
      const command = z
        .object({
          action: z.literal("close_online"),
          reason: z.string().trim().min(5).max(2000),
        })
        .strict()
        .parse(body);
      return Response.json(
        await closeOnboardingSigning(
          Number(id),
          auth.session.user.agentId!,
          command.reason,
        ),
      );
    }
    if (body?.action === "match_receipt")
      await verifyOnboardingCheckoutsClosed(Number(id), (sessionId) =>
        getStripe().checkout.sessions.retrieve(sessionId, {}, { timeout: 5000, maxNetworkRetries: 0 }));
    return Response.json(
      await runOnboardingCommand(Number(id), auth.session.user.agentId!, body),
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    if (error instanceof SigningBridgeError)
      return Response.json(
        {
          error:
            "The signing service could not verify or update this agreement. No approval was applied; refresh and retry.",
          code: error.code,
        },
        { status: error.status },
      );
    if (error instanceof OnboardingCommandError || error instanceof OnboardingStripeConflict)
      return Response.json({ error: error.message }, { status: error.status });
    if (error instanceof z.ZodError || error instanceof SyntaxError)
      return Response.json(
        { error: "Check the required fields, dates and reason" },
        { status: 400 },
      );
    console.error("Onboarding command failed", error);
    return Response.json(
      { error: "The operation could not be saved" },
      { status: 500 },
    );
  }
}
