import { start } from "workflow/api";
import { contentGenerationWorkflow } from "@/workflows/content-generation";
import { query } from "./store";
import { claimGenerationDispatch } from "./dispatch-claim";

export async function dispatchGeneration(id: string) {
  if (!(await claimGenerationDispatch(id))) return;
  try {
    const run = await start(contentGenerationWorkflow, [id]);
    await query(
      "UPDATE portal.content_generations SET workflow_run_id=$2 WHERE id=$1",
      [id, run.runId],
    );
  } catch {
    // A durable queued row is picked up by reconciliation. An uncertain start
    // is safe: the provider step takes an atomic claim before spending.
    console.warn("Content workflow dispatch pending", { id });
  }
}
