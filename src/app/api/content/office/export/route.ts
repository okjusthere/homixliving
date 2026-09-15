import { Readable } from "node:stream";
import { z } from "zod";
import { contentActor, contentError, jsonBody } from "@/lib/content/api";
import { ContentError, query } from "@/lib/content/store";
import { assetBytes, getAsset } from "@/lib/content/storage";
import { posterFilename, zipImages } from "@/lib/content/zip";
import { uuid } from "@/lib/content/validation";
import type { ContentInput, BrandContext } from "@/lib/content/types";
export const runtime = "nodejs";
export const maxDuration = 300;
export async function POST(req: Request) {
  try {
    const actor = await contentActor(req, true);
    if (actor instanceof Response) return actor;
    const ids = [...new Set(z.array(uuid).min(1).max(100).parse((await jsonBody(req)).ids))];
    const jobs = await query<{ id: string; output_asset_id: string; input: ContentInput; brand: BrandContext }>("SELECT id,output_asset_id,input,brand FROM portal.content_generations WHERE id=ANY($1::uuid[]) AND office_task_id IS NOT NULL AND status='succeeded' AND review_status IN ('approved','delivered') ORDER BY created_at,id", [ids]);
    if (jobs.length !== ids.length) throw new ContentError("Approve all selected images before downloading the finished collection / 请先审核通过所有选中图片，再打包下载成品", 409);
    const entries = [];
    for (const job of jobs) {
      const asset = await getAsset(job.output_asset_id, actor.agentId, true);
      entries.push({ name: posterFilename(job.brand.name, job.input.listing?.address || job.input.headline || "poster", job.input.theme, job.input.language, job.id), bytes: () => assetBytes(asset) });
    }
    return new Response(Readable.toWeb(Readable.from(zipImages(entries))) as ReadableStream, { headers: { "Content-Type": "application/zip", "Content-Disposition": 'attachment; filename="homix-posters.zip"', "Cache-Control": "private, no-store" } });
  } catch (e) { return contentError(e); }
}
