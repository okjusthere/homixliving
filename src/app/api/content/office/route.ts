import { contentActor, contentError, jsonBody } from "@/lib/content/api";
import { generationColumns, query } from "@/lib/content/store";
import { saveOfficeTask } from "@/lib/content/office";
export const runtime = "nodejs";
export async function GET(req: Request) {
  try {
    const actor = await contentActor(req, true);
    if (actor instanceof Response) return actor;
    const url = new URL(req.url);
    if (url.searchParams.has("agents")) {
      const q = (url.searchParams.get("q") || "").trim().slice(0, 100);
      const agents = await query("SELECT id,name,email,phone FROM portal.agents WHERE account_status='active' AND (name ILIKE $1 OR email ILIKE $1) ORDER BY name LIMIT 50", [`%${q}%`]);
      return Response.json({ agents });
    }
    const page = Math.max(0, Math.min(10000, Number(url.searchParams.get("page")) || 0));
    const view = ["drafts", "queue", "artwork"].includes(url.searchParams.get("view") || "") ? url.searchParams.get("view")! : "all";
    const tasks = await query(`SELECT t.id,t.subject_agent_id AS "subjectAgentId",a.name AS "agentName",ct.config->'name' AS "templateName",t.created_by AS "createdBy",c.name AS "creatorName",t.request,t.generation_id AS "generationId",t.submission_started_at AS "submissionStartedAt",t.created_at AS "createdAt" FROM portal.content_office_tasks t JOIN portal.agents a ON a.id=t.subject_agent_id JOIN portal.agents c ON c.id=t.created_by LEFT JOIN portal.content_templates ct ON ct.id::text=t.request->>'templateId'
      WHERE $2='all' OR ($2='drafts' AND t.generation_id IS NULL)
        OR ($2='queue' AND EXISTS(SELECT 1 FROM portal.content_generations g WHERE g.office_task_id=t.id AND g.status IN ('queued','preparing','generating','saving')))
        OR ($2='artwork' AND EXISTS(SELECT 1 FROM portal.content_generations g WHERE g.office_task_id=t.id AND g.status NOT IN ('queued','preparing','generating','saving')))
      ORDER BY t.created_at DESC LIMIT 50 OFFSET $1`, [page * 50, view]);
    const generations = await query(`SELECT ${generationColumns},office_task_id AS "officeTaskId",review_status AS "reviewStatus" FROM portal.content_generations WHERE office_task_id=ANY($1::uuid[]) ORDER BY created_at DESC`, [tasks.map((t) => t.id)]);
    const [counts] = await query("SELECT (SELECT count(*)::int FROM portal.content_office_tasks WHERE generation_id IS NULL) AS drafts,count(*) FILTER (WHERE status IN ('queued','preparing','generating','saving'))::int AS queue,count(*) FILTER (WHERE status NOT IN ('queued','preparing','generating','saving'))::int AS artwork FROM portal.content_generations WHERE office_task_id IS NOT NULL");
    return Response.json({ tasks, generations, counts, hasMore: tasks.length === 50 });
  } catch (e) { return contentError(e); }
}
export async function POST(req: Request) {
  try {
    const actor = await contentActor(req, true);
    if (actor instanceof Response) return actor;
    return Response.json({ id: await saveOfficeTask(actor.agentId, await jsonBody(req)) }, { status: 201 });
  } catch (e) { return contentError(e); }
}
