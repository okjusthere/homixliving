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
} from "@/lib/signing-contract";
import { randomUUID } from "node:crypto";
import { createDealDocumentUploadUrl, readPrivatePdf } from "@/lib/r2-storage";

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
          "Content-Disposition": 'attachment; filename="signing-document.pdf"',
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
    if (path.join("/") === "uploads") {
      z.object({
        fileName: z
          .string()
          .min(1)
          .max(180)
          .regex(/\.pdf$/i),
        byteSize: z
          .number()
          .int()
          .positive()
          .max(25 * 1024 * 1024),
      }).parse(await request.json());
      const uploadId = randomUUID();
      const uploadUrl = await createDealDocumentUploadUrl(
        `signing-staging/${actor.agentId}/${uploadId}.pdf`,
        "application/pdf",
      );
      return Response.json(
        { uploadId, uploadUrl },
        { headers: { "Cache-Control": "private, no-store" } },
      );
    }
    if (
      path.join("/") === "requests" ||
      path.join("/") === "packages/preview"
    ) {
      let raw: unknown, upload: FormData | undefined;
      if (
        request.headers.get("content-type")?.startsWith("multipart/form-data")
      ) {
        const length = Number(request.headers.get("content-length") || 0);
        if (!length || length > 101 * 1024 * 1024)
          throw new SigningBridgeError("UPLOAD_TOO_LARGE", 413);
        upload = await request.formData();
        raw = JSON.parse(String(upload.get("payload")));
      } else raw = await request.json();
      const input = z
        .object({ scenario: z.enum(["buyer", "seller", "custom"]) })
        .passthrough()
        .parse(raw);
      const safe = { ...input, ownerAgentId: actor.agentId };
      if (!upload && input.scenario === "custom") {
        const { uploads } = z
          .object({
            uploads: z
              .array(
                z.object({
                  id: z.string().uuid(),
                  name: z
                    .string()
                    .min(1)
                    .max(180)
                    .regex(/\.pdf$/i),
                }),
              )
              .min(1)
              .max(10),
          })
          .parse(input);
        const form = new FormData();
        const payload = { ...safe } as Record<string, unknown>;
        delete payload.uploads;
        form.set("payload", JSON.stringify(payload));
        let total = 0;
        for (const file of uploads) {
          const bytes = await readPrivatePdf(
            `signing-staging/${actor.agentId}/${file.id}.pdf`,
          );
          total += bytes.length;
          if (total > 100 * 1024 * 1024)
            throw new SigningBridgeError("UPLOAD_TOO_LARGE", 413);
          form.append(
            "files",
            new Blob([new Uint8Array(bytes)], { type: "application/pdf" }),
            file.name,
          );
        }
        const response = await signingBridgeFetch("/v1/requests", actor, {
          method: "POST",
          body: form,
        });
        return Response.json(
          signingRequestSchema.parse(await response.json()),
          { status: 201 },
        );
      }
      if (upload) {
        if (path.join("/") !== "requests" || input.scenario !== "custom")
          throw new SigningBridgeError("INVALID_UPLOAD", 400);
        const files = upload.getAll("files");
        if (
          !files.length ||
          files.length > 10 ||
          files.some(
            (f) =>
              !(f instanceof File) ||
              f.size > 25 * 1024 * 1024 ||
              f.type !== "application/pdf",
          )
        )
          throw new SigningBridgeError("INVALID_UPLOAD", 400);
        const form = new FormData();
        form.set("payload", JSON.stringify(safe));
        for (const file of files) form.append("files", file);
        const response = await signingBridgeFetch("/v1/requests", actor, {
          method: "POST",
          body: form,
        });
        return Response.json(
          signingRequestSchema.parse(await response.json()),
          { status: 201 },
        );
      }
      return Response.json(
        await signingBridgeJson(
          `/v1/${path.join("/")}`,
          actor,
          path[0] === "requests" ? signingRequestSchema : z.unknown(),
          safe,
        ),
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
    )
      return Response.json(
        await signingBridgeJson(
          `/v1/${path.join("/")}`,
          actor,
          z.object({ url: z.string().url() }),
          await request.json(),
        ),
        {
          headers: {
            "Cache-Control": "private, no-store",
            "Referrer-Policy": "no-referrer",
          },
        },
      );
    throw new SigningBridgeError("NOT_FOUND", 404);
  } catch (error) {
    return signingApiError(error);
  }
}
