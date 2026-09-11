import { contentActor, contentError, jsonBody } from "@/lib/content/api";
import { ContentError } from "@/lib/content/store";
import { putAsset, fetchReferenceImage } from "@/lib/content/storage";
import { requestBytes } from "@/lib/content/request-body";
export const runtime = "nodejs";
export async function POST(req: Request) {
  try {
    const actor = await contentActor(req);
    if (actor instanceof Response) return actor;
    let bytes: Buffer;
    let purpose = "upload";
    if (req.headers.get("content-type")?.includes("application/json")) {
      const body = await jsonBody(req);
      if (typeof body.url !== "string")
        throw new ContentError("Image URL required");
      bytes = await fetchReferenceImage(body.url);
    } else {
      const boundedBody = await requestBytes(req, 13 * 1024 * 1024);
      const form = await new Response(new Uint8Array(boundedBody), {
          headers: { "content-type": req.headers.get("content-type") || "" },
        }).formData(),
        file = form.get("file");
      if (!(file instanceof File) || !file.size || file.size > 12 * 1024 * 1024)
        throw new ContentError("Upload one image smaller than 12 MB");
      if (!["image/png", "image/jpeg", "image/webp"].includes(file.type))
        throw new ContentError("Use JPG, PNG or WebP");
      if (form.get("purpose") === "template") {
        if (!actor.admin) throw new ContentError("Admin required", 403);
        purpose = "template";
      }
      bytes = Buffer.from(await file.arrayBuffer());
    }
    const asset = await putAsset(actor.agentId, bytes, purpose);
    return Response.json(
      { asset: { id: asset.id, url: `/api/content/assets/${asset.id}` } },
      { status: 201 },
    );
  } catch (e) {
    return contentError(e);
  }
}
