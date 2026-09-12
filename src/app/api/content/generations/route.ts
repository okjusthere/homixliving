import { contentActor, contentError, jsonBody } from "@/lib/content/api";
import { submitGeneration } from "@/lib/content/generations";
import { generationColumns, query } from "@/lib/content/store";
import { dispatchGeneration } from "@/lib/content/dispatch";
import type { Generation } from "@/lib/content/types";
export const runtime = "nodejs";
export const maxDuration = 300;
export async function POST(req: Request) {
  try {
    const actor = await contentActor(req);
    if (actor instanceof Response) return actor;
    const id = await submitGeneration(
      actor.agentId,
      actor.admin,
      await jsonBody(req),
    );
    await dispatchGeneration(id);
    return Response.json({ generationId: id }, { status: 202 });
  } catch (e) {
    return contentError(e);
  }
}
export async function GET(req: Request) {
  try {
    const actor = await contentActor(req);
    if (actor instanceof Response) return actor;
    const url = new URL(req.url),
      page = Math.max(
        0,
        Math.min(10000, Number(url.searchParams.get("page")) || 0),
      );
    const generations = await query<Generation>(
      `SELECT ${generationColumns} FROM portal.content_generations WHERE (owner_agent_id=$1 AND NOT admin_only) OR $2 ORDER BY created_at DESC LIMIT 24 OFFSET $3`,
      [
        actor.agentId,
        actor.admin && url.searchParams.get("admin") === "1",
        page * 24,
      ],
    );
    return Response.json({ generations });
  } catch (e) {
    return contentError(e);
  }
}
