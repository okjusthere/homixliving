import { z } from "zod";
import { contentActor, contentError, jsonBody } from "@/lib/content/api";
import { companyOpenHouseCatalog } from "@/lib/content/open-house-catalog";
import { enqueueOpenHouses, openHouseJobs } from "@/lib/content/open-house-jobs";
import { dispatchOpenHouseJobs } from "@/lib/content/open-house-dispatch";
import { audit, query } from "@/lib/content/store";
import { uuid } from "@/lib/content/validation";
export const runtime = "nodejs";
export const maxDuration = 300;
export async function GET(req: Request) {
  try {
    const actor = await contentActor(req, true);
    if (actor instanceof Response) return actor;
    if (new URL(req.url).searchParams.has("jobs")) {
      await dispatchOpenHouseJobs();
      return Response.json({ jobs: await openHouseJobs() }, { headers: { "Cache-Control": "private, no-store" } });
    }
    const { items } = await companyOpenHouseCatalog();
    return Response.json({ items, jobs: await openHouseJobs(items.map((i) => i.key)) }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (e) { return contentError(e); }
}
const submitSchema = z.object({ keys: z.array(z.string().regex(/^[a-f0-9]{64}$/)).min(1).max(1200) });
export async function POST(req: Request) {
  try {
    const actor = await contentActor(req, true);
    if (actor instanceof Response) return actor;
    const body = await jsonBody(req);
    if (body.retryId) {
      const id = uuid.parse(body.retryId);
      // Failed image generations are reviewed in the existing workbench. Only
      // preparation retries can be safely automated without another paid image.
      await query(`UPDATE portal.content_open_house_jobs j SET status='queued',error=NULL,dispatch_at=NULL,created_by=$2,updated_at=now()
        WHERE id=$1 AND status='failed' AND NOT EXISTS(SELECT 1 FROM portal.content_generations g WHERE g.office_task_id=j.id)`, [id, actor.agentId]);
      await audit(actor.agentId, "office.open_house.retry", id);
      await dispatchOpenHouseJobs();
      return Response.json({ jobs: await openHouseJobs() }, { status: 202 });
    }
    const { keys } = submitSchema.parse(body);
    // Re-read the trusted catalog at submission. Never trust client-supplied
    // Agent IDs, schedules, photo URLs or listing descriptions.
    const { items, template } = await companyOpenHouseCatalog();
    const eligible = items.filter((i) => keys.includes(i.key) && !i.problem);
    const ids = await enqueueOpenHouses(actor.agentId, eligible, template);
    await dispatchOpenHouseJobs();
    return Response.json({ added: ids.length, unchanged: eligible.length - ids.length, changed: keys.length - eligible.length, jobs: await openHouseJobs() }, { status: 202 });
  } catch (e) { return contentError(e); }
}
