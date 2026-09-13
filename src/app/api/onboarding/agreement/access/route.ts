import { z } from "zod";
import { auth } from "@/auth";
import { SigningBridgeError } from "@/lib/signing-bridge";
import { requestBytes, RequestBodyTooLarge } from "@/lib/content/request-body";
import {
  requestOnboardingSigning,
  SigningAccessError,
} from "@/lib/onboarding-signing-access";

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.agentId)
    return Response.json({ code: "UNAUTHORIZED" }, { status: 401 });
  if (request.headers.get("origin") !== new URL(request.url).origin)
    return Response.json({ code: "INVALID_ORIGIN" }, { status: 403 });
  try {
    const body = z
      .object({ action: z.enum(["continue", "resend"]) })
      .strict()
      .parse(
        JSON.parse(new TextDecoder().decode(await requestBytes(request, 512))),
      );
    return Response.json(
      await requestOnboardingSigning({
        agentId: session.user.agentId,
        actorId: session.user.agentId,
        action: body.action,
      }),
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    if (error instanceof SigningAccessError)
      return Response.json({ code: error.code }, { status: error.status });
    if (
      error instanceof z.ZodError ||
      error instanceof SyntaxError ||
      error instanceof RequestBodyTooLarge
    )
      return Response.json({ code: "INVALID_REQUEST" }, { status: 400 });
    if (error instanceof SigningBridgeError)
      return Response.json(
        {
          code:
            error.code,
        },
        { status: error.status },
      );
    console.error("Signing access failed", {
      type: error instanceof Error ? error.name : "unknown",
    });
    return Response.json({ code: "SIGNING_UNAVAILABLE" }, { status: 502 });
  }
}
