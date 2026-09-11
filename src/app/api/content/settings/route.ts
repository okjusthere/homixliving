import { contentActor, contentError, jsonBody } from "@/lib/content/api";
import { loadBrand } from "@/lib/content/brand";
import { audit, ContentError, query } from "@/lib/content/store";
import { verifyContentStorage } from "@/lib/content/storage";
import { contentStorageConfig } from "@/lib/content/storage-config";
export async function GET(req: Request) {
  try {
    const actor = await contentActor(req);
    if (actor instanceof Response) return actor;
    const brand = await loadBrand(actor.agentId);
    const storageVerified =
      actor.admin && new URL(req.url).searchParams.get("verify") === "1"
        ? await verifyContentStorage().catch(() => false)
        : undefined;
    const [limit] = await query<{ value: string }>(
      "SELECT value FROM portal.settings WHERE key='content_daily_limit'",
    );
    return Response.json({
      brand,
      admin: actor.admin,
      dailyLimit: Number(limit?.value) || 10,
      azureConfigured: Boolean(
        process.env.AZURE_IMAGE_API_KEY && process.env.AZURE_IMAGE_ENDPOINT,
      ),
      storageConfigured: Boolean(contentStorageConfig()),
      storageVerified,
    });
  } catch (e) {
    return contentError(e);
  }
}
export async function PATCH(req: Request) {
  try {
    const actor = await contentActor(req, true);
    if (actor instanceof Response) return actor;
    const { dailyLimit } = await jsonBody(req);
    if (
      typeof dailyLimit !== "number" ||
      !Number.isInteger(dailyLimit) ||
      dailyLimit < 1 ||
      dailyLimit > 100
    )
      throw new ContentError("Daily limit must be 1–100");
    await query(
      "INSERT INTO portal.settings(key,value) VALUES('content_daily_limit',$1) ON CONFLICT(key) DO UPDATE SET value=EXCLUDED.value",
      [String(dailyLimit)],
    );
    await audit(actor.agentId, "settings.daily_limit", "content_daily_limit");
    return Response.json({ ok: true });
  } catch (e) {
    return contentError(e);
  }
}
