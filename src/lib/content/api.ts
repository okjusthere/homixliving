import { contentValidationMessage } from "./form-state";
import { z } from "zod";
import { requireActiveAgentApi } from "@/lib/auth-guards";
import { ContentError, query } from "./store";
import { AzureImageError } from "./azure";
import { requestBytes, RequestBodyTooLarge } from "./request-body";

export type ContentActor = { agentId: number; admin: boolean; email: string };
export async function contentActor(
  req: Request,
  admin = false,
): Promise<ContentActor | Response> {
  const auth = await requireActiveAgentApi();
  if ("error" in auth && auth.error) return auth.error;
  const id = auth.session.user.agentId;
  if (!id)
    return Response.json({ error: "Agent profile required" }, { status: 403 });
  const [fresh] = await query<{
    is_admin: boolean;
    account_status: string;
    email: string;
  }>("SELECT is_admin,account_status,email FROM portal.agents WHERE id=$1", [
    id,
  ]);
  const effectiveAdmin = auth.session.user.isAdmin && fresh?.is_admin === true;
  if (!fresh || fresh.account_status !== "active" || (admin && !effectiveAdmin))
    return Response.json({ error: "Access denied" }, { status: 403 });
  if (
    !["GET", "HEAD"].includes(req.method) &&
    req.headers.get("origin") !== new URL(req.url).origin
  )
    return Response.json({ error: "Invalid request origin" }, { status: 403 });
  return { agentId: id, admin: effectiveAdmin, email: fresh.email };
}
export async function jsonBody(req: Request): Promise<Record<string, unknown>> {
  const text = new TextDecoder().decode(await requestBytes(req, 64000));
  try {
    const value = JSON.parse(text);
    if (!value || Array.isArray(value) || typeof value !== "object")
      throw new Error();
    return value;
  } catch {
    throw new ContentError("Invalid JSON");
  }
}
export function contentError(error: unknown): Response {
  if (error instanceof RequestBodyTooLarge)
    return Response.json({ error: "Request too large" }, { status: 413 });
  if (error instanceof z.ZodError)
    return Response.json(
      {
        error: contentValidationMessage(error.issues),
        issues: error.issues,
      },
      { status: 400 },
    );
  if (error instanceof ContentError)
    return Response.json(
      { error: error.message, code: error.code },
      { status: error.status },
    );
  if (error instanceof AzureImageError)
    return Response.json(
      {
        error: "Azure image service is not ready / Azure 图片服务尚未就绪",
        code: error.code,
      },
      { status: 503 },
    );
  console.error("Content operation failed", {
    type: error instanceof Error ? error.name : "unknown",
  });
  return Response.json(
    { error: "Unable to complete this operation / 暂时无法完成操作" },
    { status: 500 },
  );
}
