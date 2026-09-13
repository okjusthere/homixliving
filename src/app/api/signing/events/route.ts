import { requestBytes, RequestBodyTooLarge } from "@/lib/content/request-body";
import { verifySigningEvent } from "@/lib/signing-event-auth";
import { receiveSigningEvent } from "@/lib/signing-events";
import { signingApiError } from "@/lib/signing-bridge";
export const runtime = "nodejs";
export const maxDuration = 300;
export async function POST(request: Request) {
  try {
    const body = new TextDecoder().decode(await requestBytes(request, 4096));
    if (
      !verifySigningEvent(
        body,
        request.headers.get("x-esign-timestamp"),
        request.headers.get("x-esign-signature"),
        process.env.ESIGN_PORTAL_CALLBACK_SECRET,
      )
    )
      return Response.json(
        { error: "INVALID_EVENT_SIGNATURE" },
        { status: 401 },
      );
    return Response.json(await receiveSigningEvent(JSON.parse(body)), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    if (error instanceof RequestBodyTooLarge)
      return Response.json({ error: "EVENT_TOO_LARGE" }, { status: 413 });
    return signingApiError(error);
  }
}
