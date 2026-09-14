import { z } from "zod";
import { requireActiveAgentApi } from "@/lib/auth-guards";
import {
  signingActor,
  signingApiError,
  signingBridgeFetch,
  signingBridgeJson,
  SigningBridgeError,
} from "@/lib/signing-bridge";
import {
  signingListSchema,
  signingPackageSchema,
  signingRequestSchema,
  signingReviewSchema,
} from "@/lib/signing-contract";

export const maxDuration = 180;
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
type Context = { params: Promise<{ path: string[] }> };
export async function GET(request: Request, context: Context) {
  const auth = await requireActiveAgentApi();
  if ("error" in auth) return auth.error;
  try {
    const { path } = await context.params,
      actor = await signingActor(),
      query = new URL(request.url).searchParams;
    if (path.join("/") === "packages") {
      const result = await signingBridgeJson(
        "/v1/packages",
        actor,
        z.object({ items: z.array(signingPackageSchema) }),
      );
      return Response.json({
        items: result.items.filter(
          (p) => p.scenario === "buyer" || p.scenario === "seller",
        ),
      });
    }
    if (path.join("/") === "connections")
      return Response.json(
        await signingBridgeJson(
          "/v1/connections",
          actor,
          z.object({
            items: z.array(
              z.object({
                id: z.string(),
                scope: z.string(),
                ownerAgentId: z.number().nullable(),
                nativeEmail: z.string(),
                revokedAt: z.string().nullable(),
              }),
            ),
          }),
        ),
      );
    if (path[0] !== "requests") throw new SigningBridgeError("NOT_FOUND", 404);
    if (path.length === 1) {
      const params = new URLSearchParams();
      for (const name of ["query", "category", "page"])
        if (query.has(name)) params.set(name, query.get(name)!);
      return Response.json(
        await signingBridgeJson(
          `/v1/requests?${params}`,
          actor,
          signingListSchema,
        ),
      );
    }
    if (!uuid.test(path[1])) throw new SigningBridgeError("NOT_FOUND", 404);
    if (path.length === 3 && ["review", "reissue"].includes(path[2]))
      return Response.json(
        await signingBridgeJson(
          `/v1/${path.join("/")}`,
          actor,
          path[2] === "review" ? signingReviewSchema : z.unknown(),
        ),
        { headers: { "Cache-Control": "private, no-store" } },
      );
    if (path.length === 3 && path[2] === "bundle") {
      const response = await signingBridgeFetch(`/v1/${path.join("/")}`, actor);
      return new Response(response.body, {
        headers: {
          "Content-Type": "application/zip",
          "Content-Disposition":
            response.headers.get("Content-Disposition") ||
            'attachment; filename="signed-package.zip"',
          "Cache-Control": "private, no-store",
          "Referrer-Policy": "no-referrer",
        },
      });
    }
    if (path.length === 2)
      return Response.json(
        await signingBridgeJson(
          `/v1/requests/${path[1]}`,
          actor,
          signingRequestSchema,
        ),
      );
    if (
      path.length === 5 &&
      path[2] === "parts" &&
      uuid.test(path[3]) &&
      path[4] === "files"
    ) {
      const params = new URLSearchParams();
      for (const name of ["kind", "itemId"])
        if (query.has(name)) params.set(name, query.get(name)!);
      const response = await signingBridgeFetch(
        `/v1/requests/${path[1]}/parts/${path[3]}/files?${params}`,
        actor,
      );
      return new Response(response.body, {
        headers: {
          "Content-Type": "application/pdf",
          "Content-Disposition":
            response.headers.get("Content-Disposition") ||
            'attachment; filename="signing-document.pdf"',
          "Cache-Control": "private, no-store",
          "Referrer-Policy": "no-referrer",
        },
      });
    }
    throw new SigningBridgeError("NOT_FOUND", 404);
  } catch (error) {
    return signingApiError(error);
  }
}
export async function POST(request: Request, context: Context) {
  const auth = await requireActiveAgentApi();
  if ("error" in auth) return auth.error;
  if (request.headers.get("origin") !== new URL(request.url).origin)
    return Response.json({ error: "INVALID_ORIGIN" }, { status: 403 });
  try {
    const { path } = await context.params,
      actor = await signingActor();
    if (path.join("/") === "uploads")
      throw new SigningBridgeError("PERSONAL_SIGNING_UNAVAILABLE", 403);
    if (
      path.join("/") === "requests" ||
      path.join("/") === "packages/preview"
    ) {
      if (
        request.headers.get("content-type")?.startsWith("multipart/form-data")
      )
        throw new SigningBridgeError("PERSONAL_SIGNING_UNAVAILABLE", 403);
      const raw = await request.json();
      if (raw?.scenario === "custom")
        throw new SigningBridgeError("PERSONAL_SIGNING_UNAVAILABLE", 403);
      const input = z
        .object({
          scenario: z.enum(["buyer", "seller"]),
          companyKey: z.enum(["homix_realty", "homix_living"]),
        })
        .passthrough()
        .parse(raw);
      if (!actor.allowedCompanyKeys.includes(input.companyKey))
        throw new SigningBridgeError("COMPANY_ACCESS_DENIED", 403);
      return Response.json(
        await signingBridgeJson(
          `/v1/${path.join("/")}`,
          actor,
          path[0] === "requests" ? signingRequestSchema : z.unknown(),
          { ...input, ownerAgentId: actor.agentId },
        ),
        { status: path[0] === "requests" ? 201 : 200 },
      );
    }
    if (path[0] !== "requests" || !uuid.test(path[1] ?? ""))
      throw new SigningBridgeError("NOT_FOUND", 404);
    if (path.length === 3 && ["commands", "refresh"].includes(path[2]))
      return Response.json(
        await signingBridgeJson(
          `/v1/${path.join("/")}`,
          actor,
          signingRequestSchema,
          path[2] === "refresh" ? {} : await request.json(),
        ),
      );
    if (
      path.length === 5 &&
      path[2] === "parts" &&
      uuid.test(path[3]) &&
      path[4] === "access"
    ) {
      const input = z
        .object({
          kind: z.enum(["editor", "signer"]),
          recipientId: z.number().int().positive().optional(),
        })
        .strict()
        .parse(await request.json());
      if (input.kind === "editor")
        throw new SigningBridgeError("PERSONAL_SIGNING_UNAVAILABLE", 403);
      return Response.json(
        await signingBridgeJson(
          `/v1/${path.join("/")}`,
          actor,
          z.object({ url: z.string().url() }),
          input,
        ),
        {
          headers: {
            "Cache-Control": "private, no-store",
            "Referrer-Policy": "no-referrer",
          },
        },
      );
    }
    throw new SigningBridgeError("NOT_FOUND", 404);
  } catch (error) {
    return signingApiError(error);
  }
}
