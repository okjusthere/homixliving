import { timingSafeEqual } from "node:crypto";
import { query } from "@/lib/content/store";
import { dispatchGeneration } from "@/lib/content/dispatch";
import { getRun } from "workflow/api";
export const maxDuration = 60;
export async function GET(req: Request) {
  const expected = process.env.CONTENT_RECOVERY_SECRET,
    token = req.headers.get("authorization")?.replace(/^Bearer /, "");
  if (
    !expected ||
    !token ||
    Buffer.byteLength(token) !== Buffer.byteLength(expected) ||
    !timingSafeEqual(Buffer.from(token), Buffer.from(expected))
  )
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  const stale = await query<{
    id: string;
    status: string;
    workflow_run_id: string | null;
  }>(
    "SELECT id,status,workflow_run_id FROM portal.content_generations WHERE status IN ('queued','preparing','generating','saving') AND updated_at < now()-interval '30 minutes' ORDER BY updated_at LIMIT 20",
  );
  for (const job of stale) {
    if (job.workflow_run_id) {
      try {
        const run = getRun(job.workflow_run_id);
        if (await run.exists) {
          const status = await run.status;
          if (status === "pending" || status === "running") continue;
        }
      } catch {
        continue;
      } // An unavailable status service is not evidence that a run stopped.
    }
    if (job.status === "generating" || job.status === "saving")
      await query(
        "UPDATE portal.content_generations SET status='needs_review',error='WORKFLOW_INTERRUPTED',updated_at=now() WHERE id=$1 AND status=$2 AND updated_at < now()-interval '30 minutes'",
        [job.id, job.status],
      );
    else
      await query(
        "UPDATE portal.content_generations SET status='queued',workflow_run_id=null,dispatch_at=null,updated_at=now() WHERE id=$1 AND status=$2 AND updated_at < now()-interval '30 minutes'",
        [job.id, job.status],
      );
  }
  const rows = await query<{ id: string }>(
    "SELECT job.id FROM portal.content_generations job WHERE job.status='queued' AND job.workflow_run_id IS NULL AND (job.dispatch_at IS NULL OR job.dispatch_at < now()-interval '5 minutes') AND (job.predecessor_id IS NULL OR EXISTS (SELECT 1 FROM portal.content_generations predecessor WHERE predecessor.id=job.predecessor_id AND predecessor.status IN ('succeeded','failed','needs_review'))) ORDER BY job.created_at LIMIT 20",
  );
  for (const row of rows) await dispatchGeneration(row.id);
  return Response.json({ dispatched: rows.length });
}
