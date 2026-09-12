import { z } from "zod";
import { requireAdminApi } from "@/lib/auth-guards";
import {
  AgentEmailError,
  linkAgentEmail,
  listAgentEmails,
  previewAgentEmail,
} from "@/lib/admin-agent-emails";
import { requestBytes, RequestBodyTooLarge } from "@/lib/content/request-body";
import { mergeAgentAccount, previewAgentMerge } from "@/lib/admin-agent-merge";

type Context = { params: Promise<{ id: string }> };
const bodySchema = z.discriminatedUnion("action", [
  z
    .object({
      action: z.literal("merge-preview"),
      sourceId: z.number().int().positive().max(2147483647),
    })
    .strict(),
  z
    .object({
      action: z.literal("merge"),
      sourceId: z.number().int().positive().max(2147483647),
      revision: z.string().regex(/^[a-f0-9]{64}$/),
      confirmed: z.literal(true),
    })
    .strict(),
  z
    .object({ action: z.literal("preview"), email: z.string().max(254) })
    .strict(),
  z
    .object({
      action: z.literal("link"),
      email: z.string().max(254),
      confirmed: z.literal(true),
      expectedAdmin: z.boolean(),
    })
    .strict(),
]);

function agentId(value: string) {
  const id = Number(value);
  if (
    !/^\d+$/.test(value) ||
    !Number.isSafeInteger(id) ||
    id < 1 ||
    id > 2147483647
  ) {
    throw new AgentEmailError("INVALID_AGENT_ID", 400);
  }
  return id;
}
function failure(error: unknown) {
  if (error instanceof AgentEmailError)
    return Response.json({ code: error.code }, { status: error.status });
  if (error instanceof RequestBodyTooLarge)
    return Response.json({ code: "BODY_TOO_LARGE" }, { status: 413 });
  if (error instanceof z.ZodError || error instanceof SyntaxError)
    return Response.json({ code: "INVALID_REQUEST" }, { status: 400 });
  console.error("Admin email management failed", {
    type: error instanceof Error ? error.name : "unknown",
    code:
      error && typeof error === "object" && "code" in error
        ? String(error.code)
        : undefined,
    constraint:
      error && typeof error === "object" && "constraint" in error
        ? String(error.constraint)
        : undefined,
  });
  return Response.json({ code: "UNAVAILABLE" }, { status: 500 });
}

export async function GET(_request: Request, { params }: Context) {
  const auth = await requireAdminApi();
  if ("error" in auth) return auth.error;
  try {
    return Response.json(
      { emails: await listAgentEmails(agentId((await params).id)) },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return failure(error);
  }
}

export async function POST(request: Request, { params }: Context) {
  const auth = await requireAdminApi();
  if ("error" in auth) return auth.error;
  if (request.headers.get("origin") !== new URL(request.url).origin)
    return Response.json({ code: "INVALID_ORIGIN" }, { status: 403 });
  try {
    const id = agentId((await params).id);
    const body = bodySchema.parse(
      JSON.parse(new TextDecoder().decode(await requestBytes(request, 2048))),
    );
    if (body.action === "preview")
      return Response.json(await previewAgentEmail(id, body.email));
    if (body.action === "merge-preview")
      return Response.json(await previewAgentMerge(body.sourceId, id));
    const actorId = auth.session.user.agentId;
    if (!actorId) throw new AgentEmailError("FORBIDDEN", 403);
    if (body.action === "merge")
      return Response.json(
        await mergeAgentAccount({
          actorId,
          sourceId: body.sourceId,
          targetId: id,
          revision: body.revision,
        }),
      );
    return Response.json(
      await linkAgentEmail({
        agentId: id,
        email: body.email,
        actorId,
        expectedAdmin: body.expectedAdmin,
      }),
    );
  } catch (error) {
    return failure(error);
  }
}
