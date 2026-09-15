import { query } from "./store";
import { dispatchGeneration } from "./dispatch";
import { getRun } from "workflow/api";
export async function recoverGenerations(adminOnly = false) {
  // Repair a client disconnect between durable generation creation and the
  // office-task pointer update. This never creates another paid generation.
  await query("UPDATE portal.content_office_tasks t SET generation_id=g.id,updated_at=now() FROM portal.content_generations g WHERE g.office_task_id=t.id AND g.batch_id=g.id AND t.generation_id IS NULL");
  const stale = await query<{
    id: string;
    status: string;
    workflow_run_id: string | null;
  }>(
    "SELECT id,status,workflow_run_id FROM portal.content_generations WHERE ($1::boolean=false OR admin_only) AND status IN ('queued','preparing','generating','saving') AND updated_at < now()-interval '30 minutes' ORDER BY updated_at LIMIT 20",
    [adminOnly],
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
    "SELECT job.id FROM portal.content_generations job WHERE ($1::boolean=false OR job.admin_only) AND job.status='queued' AND job.workflow_run_id IS NULL AND (job.dispatch_at IS NULL OR job.dispatch_at < now()-interval '5 minutes') AND (job.predecessor_id IS NULL OR EXISTS (SELECT 1 FROM portal.content_generations predecessor WHERE predecessor.id=job.predecessor_id AND predecessor.status IN ('succeeded','failed','needs_review'))) ORDER BY job.created_at LIMIT 20",
    [adminOnly],
  );
  for (const row of rows) await dispatchGeneration(row.id);
  return { dispatched: rows.length };
}
