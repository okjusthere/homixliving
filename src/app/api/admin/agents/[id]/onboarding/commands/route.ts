import { closeOnboardingSigning } from "@/lib/onboarding-close-signing";
import { SigningBridgeError } from "@/lib/signing-bridge";
import { z } from "zod";
import { requireAdminApi } from "@/lib/auth-guards";
import {
  OnboardingCommandError,
  runOnboardingCommand,
} from "@/lib/onboarding-admin";

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
    return Response.json(
      await runOnboardingCommand(Number(id), auth.session.user.agentId!, body),
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    if (error instanceof SigningBridgeError)
      return Response.json(
        {
          error:
            "The signing service could not close all invitations. The failure is recorded; refresh and retry.",
          code: error.code,
        },
        { status: error.status },
      );
    if (error instanceof OnboardingCommandError)
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
