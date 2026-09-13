import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { agents } from "@/db/schema";
import { requireAdminApi } from "@/lib/auth-guards";
import {
  signingActor,
  signingApiError,
  signingBridgeJson,
  SigningBridgeError,
  verifiedSigningEmails,
} from "@/lib/signing-bridge";

export const maxDuration = 180;
type Context = { params: Promise<{ path: string[] }> };
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export async function GET(request: Request, context: Context) {
  const auth = await requireAdminApi();
  if ("error" in auth) return auth.error;
  try {
    const { path } = await context.params,
      actor = await signingActor();
    if (path.length === 1 && ["packages", "connections"].includes(path[0]))
      return Response.json(
        await signingBridgeJson(`/v1/${path[0]}`, actor, z.unknown()),
        { headers: { "Cache-Control": "private, no-store" } },
      );
    if (
      path.length === 3 &&
      path[0] === "connections" &&
      uuid.test(path[1]) &&
      ["templates", "webhook-configuration"].includes(path[2])
    ) {
      const query = new URLSearchParams();
      for (const name of ["templateId", "page"]) {
        const value = new URL(request.url).searchParams.get(name);
        if (value) query.set(name, value);
      }
      return Response.json(
        await signingBridgeJson(
          `/v1/${path.join("/")}?${query}`,
          actor,
          z.unknown(),
        ),
        { headers: { "Cache-Control": "private, no-store" } },
      );
    }
    throw new SigningBridgeError("NOT_FOUND", 404);
  } catch (e) {
    return signingApiError(e);
  }
}
export async function POST(request: Request, context: Context) {
  const auth = await requireAdminApi();
  if ("error" in auth) return auth.error;
  if (request.headers.get("origin") !== new URL(request.url).origin)
    return Response.json({ error: "INVALID_ORIGIN" }, { status: 403 });
  try {
    const { path } = await context.params,
      actor = await signingActor();
    if (
      path.join("/") === "connections" ||
      (path.length === 3 &&
        path[0] === "connections" &&
        uuid.test(path[1]) &&
        path[2] === "rotate")
    ) {
      const input = z
        .object({
          scope: z.enum(["customer", "company"]),
          agentId: z.number().int().positive(),
          companyKey: z.enum(["homix_realty", "homix_living"]),
          token: z.string().min(16).max(500),
          proofEnvelopeId: z.string().min(1).max(200),
          isolationConfirmed: z.literal(true),
          isolationNotes: z.string().trim().min(20).max(2000),
        })
        .strict()
        .parse(await request.json());
      const [subject] = await db
        .select({ id: agents.id, isAdmin: agents.isAdmin })
        .from(agents)
        .where(
          and(eq(agents.id, input.agentId), eq(agents.accountStatus, "active")),
        );
      if (!subject || (input.scope === "company" && !subject.isAdmin))
        throw new SigningBridgeError("ACTIVE_SIGNING_ACCOUNT_REQUIRED", 409);
      const verifiedEmails = await verifiedSigningEmails(subject.id);
      if (!verifiedEmails.length)
        throw new SigningBridgeError("VERIFIED_EMAIL_REQUIRED", 409);
      const body = {
        scope: input.scope,
        ...(input.scope === "customer"
          ? { ownerAgentId: subject.id }
          : { companyKey: input.companyKey }),
        verifiedEmails,
        token: input.token,
        proofEnvelopeId: input.proofEnvelopeId,
        isolationConfirmed: input.isolationConfirmed,
        isolationNotes: input.isolationNotes,
      };
      return Response.json(
        await signingBridgeJson(
          `/v1/${path.join("/")}`,
          actor,
          z.unknown(),
          body,
        ),
        { status: path.length === 1 ? 201 : 200 },
      );
    }
    if (path.join("/") === "packages")
      return Response.json(
        await signingBridgeJson(
          "/v1/packages",
          actor,
          z.unknown(),
          await request.json(),
        ),
        { status: 201 },
      );
    if (
      path.length === 3 &&
      uuid.test(path[1]) &&
      ((path[0] === "packages" && path[2] === "retire") ||
        (path[0] === "connections" && path[2] === "revoke"))
    )
      return Response.json(
        await signingBridgeJson(
          `/v1/${path.join("/")}`,
          actor,
          z.unknown(),
          await request.json(),
        ),
      );
    throw new SigningBridgeError("NOT_FOUND", 404);
  } catch (e) {
    return signingApiError(e);
  }
}
