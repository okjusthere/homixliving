import { start } from "workflow/api";
import { companyOpenHouseWorkflow } from "@/workflows/company-open-house";
import { query } from "./store";

export async function dispatchOpenHouseJobs() {
  const rows = await query<{ id: string }>(`UPDATE portal.content_open_house_jobs SET dispatch_at=now()
    WHERE id IN (SELECT id FROM portal.content_open_house_jobs
      WHERE (status='queued' AND (dispatch_at IS NULL OR dispatch_at<now()-interval '5 minutes'))
         OR (status='preparing' AND updated_at<now()-interval '10 minutes' AND dispatch_at<now()-interval '10 minutes')
      ORDER BY created_at LIMIT 100 FOR UPDATE SKIP LOCKED)
    RETURNING id`);
  for (let i = 0; i < rows.length; i += 4) {
    await Promise.all(rows.slice(i, i + 4).map(async ({ id }) => {
      try { await start(companyOpenHouseWorkflow, [id]); }
      catch { console.warn("Open House preparation dispatch pending", { id }); }
    }));
  }
  return rows.length;
}
