import { contentActor, contentError } from "@/lib/content/api";
import { query } from "@/lib/content/store";
export async function GET(req: Request) {
  try {
    const actor = await contentActor(req);
    if (actor instanceof Response) return actor;
    return Response.json({
      projects: await query(
        "SELECT id,title,input,created_at,updated_at FROM portal.content_projects WHERE owner_agent_id=$1 ORDER BY updated_at DESC LIMIT 100",
        [actor.agentId],
      ),
    });
  } catch (e) {
    return contentError(e);
  }
}
