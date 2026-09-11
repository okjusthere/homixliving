import { query } from "./store";

export async function claimGenerationDispatch(id: string) {
  const rows = await query(
    "UPDATE portal.content_generations AS job SET dispatch_at=now() WHERE job.id=$1 AND job.status='queued' AND job.workflow_run_id IS NULL AND (job.dispatch_at IS NULL OR job.dispatch_at < now()-interval '5 minutes') AND (job.predecessor_id IS NULL OR EXISTS (SELECT 1 FROM portal.content_generations AS predecessor WHERE predecessor.id=job.predecessor_id AND predecessor.status IN ('succeeded','failed','needs_review'))) RETURNING job.id",
    [id],
  );
  return rows.length === 1;
}
