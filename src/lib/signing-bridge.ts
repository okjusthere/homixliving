import "server-only";
import { z } from "zod";
import { pgPool } from "@/db";
import { currentSession } from "@/lib/auth-guards";

export class SigningBridgeError extends Error {
  constructor(
    public code: string,
    public status = 502,
  ) {
    super(code);
  }
}
export async function verifiedSigningEmails(agentId: number) {
  const { rows } = await pgPool.query<{ email: string }>(
    `SELECT lower(email) AS email FROM portal.agent_email_addresses WHERE agent_id=$1 AND can_sign_in=TRUE AND verified_at IS NOT NULL
    UNION SELECT lower(email_at_link) AS email FROM portal.agent_login_identities WHERE agent_id=$1 AND disabled_at IS NULL AND email_at_link IS NOT NULL`,
    [agentId],
  );
  return rows.map((row) => row.email);
}
export async function signingActor(agentId?: number) {
  const session = await currentSession();
  if (!session?.user?.agentId)
    throw new SigningBridgeError("UNAUTHORIZED", 401);
  if (session.user.accountStatus === "inactive")
    throw new SigningBridgeError("INACTIVE_ACCOUNT", 403);
  if (agentId !== undefined && agentId !== session.user.agentId)
    throw new SigningBridgeError("FORBIDDEN", 403);
  const verifiedEmails = await verifiedSigningEmails(session.user.agentId);
  if (!verifiedEmails.length)
    throw new SigningBridgeError("VERIFIED_EMAIL_REQUIRED", 403);
  return {
    agentId: session.user.agentId,
    admin: Boolean(session.user.isAdmin),
    verifiedEmails,
  };
}
type Actor = Awaited<ReturnType<typeof signingActor>>;
// Only background reconciliation and already-authorized HR commands call this.
// No administrator role is manufactured from a target person's account.
export async function signingSystemActor(agentId: number): Promise<Actor> {
  const {
    rows: [agent],
  } = await pgPool.query("SELECT id FROM portal.agents WHERE id=$1", [agentId]);
  if (!agent) throw new SigningBridgeError("AGENT_NOT_FOUND", 404);
  const verifiedEmails = await verifiedSigningEmails(agentId);
  if (!verifiedEmails.length)
    throw new SigningBridgeError("VERIFIED_EMAIL_REQUIRED", 403);
  return { agentId, admin: false, verifiedEmails };
}
export async function signingBridgeFetch(
  path: string,
  actor: Actor,
  init: RequestInit = {},
) {
  const base = process.env.ESIGN_BRIDGE_BASE_URL?.trim(),
    token = process.env.ESIGN_BRIDGE_API_KEY?.trim();
  if (!base || !token)
    throw new SigningBridgeError("SIGNING_NOT_CONFIGURED", 503);
  const origin = new URL(base);
  if (
    origin.origin !== base ||
    (origin.protocol !== "https:" &&
      !["localhost", "127.0.0.1"].includes(origin.hostname))
  )
    throw new SigningBridgeError("SIGNING_NOT_CONFIGURED", 503);
  if (!path.startsWith("/v1/") || path.includes("..") || path.includes("#"))
    throw new SigningBridgeError("INVALID_SIGNING_PATH", 400);
  let response: Response;
  try {
    response = await fetch(base + path, {
      ...init,
      cache: "no-store",
      redirect: "error",
      signal: AbortSignal.timeout(120000),
      headers: {
        ...init.headers,
        Authorization: `Bearer ${token}`,
        "X-Portal-Actor": Buffer.from(JSON.stringify(actor)).toString(
          "base64url",
        ),
      },
    });
  } catch {
    throw new SigningBridgeError("SIGNING_UNAVAILABLE", 503);
  }
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new SigningBridgeError(
      typeof body?.error === "string" &&
        /^[A-Z_:a-z0-9.-]{1,150}$/.test(body.error)
        ? body.error
        : "SIGNING_UNAVAILABLE",
      response.status,
    );
  }
  return response;
}
export async function signingBridgeJson<T>(
  path: string,
  actor: Actor,
  schema: z.ZodType<T>,
  body?: unknown,
) {
  const response = await signingBridgeFetch(
    path,
    actor,
    body === undefined
      ? {}
      : {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        },
  );
  return schema.parse(await response.json());
}
export function signingApiError(error: unknown) {
  const status =
    error instanceof SigningBridgeError
      ? error.status
      : error instanceof z.ZodError || error instanceof SyntaxError
        ? 400
        : 500;
  const code =
    error instanceof SigningBridgeError
      ? error.code
      : status === 400
        ? "INVALID_REQUEST"
        : "SIGNING_REQUEST_FAILED";
  console.error("Signing operation failed", { code, status });
  return Response.json(
    { error: code },
    { status, headers: { "Cache-Control": "private, no-store" } },
  );
}
