import { contentActor, contentError } from "@/lib/content/api";
import { getAsset, assetUrl } from "@/lib/content/storage";
import { uuid } from "@/lib/content/validation";
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const actor = await contentActor(req);
    if (actor instanceof Response) return actor;
    const asset = await getAsset(
      uuid.parse((await params).id),
      actor.agentId,
      actor.admin,
    );
    return Response.redirect(
      await assetUrl(
        asset,
        new URL(req.url).searchParams.get("download") === "1",
      ),
      302,
    );
  } catch (e) {
    return contentError(e);
  }
}
