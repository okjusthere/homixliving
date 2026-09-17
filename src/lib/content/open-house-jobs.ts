import "server-only";
import { randomUUID } from "node:crypto";
import { audit, query, transaction } from "./store";
import { companyOpenHouseInput } from "./company-open-house";
import { inputSchema } from "./validation";
import type { ContentTemplate } from "./types";
import type { CompanyOpenHouse, OpenHouseJob } from "./company-open-house";

export async function enqueueOpenHouses(actor: number, items: CompanyOpenHouse[], template: ContentTemplate) {
  const requests = items.filter((item) => !item.problem && item.agent).map((item) => {
    const id = randomUUID();
    const input = companyOpenHouseInput(item.listing, id, item.events);
    return { id, item, request: { templateId: template.id, input: inputSchema.parse(input), languages: ["zh"] } };
  });
  return transaction(async (c) => {
    const ids: string[] = [];
    for (const { id, item, request } of requests) {
      const rows = await query<{ id: string }>(`INSERT INTO portal.content_open_house_jobs(id,fingerprint,created_by,subject_agent_id,listing,request)
        VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(fingerprint) DO NOTHING RETURNING id`,
      [id, item.key, actor, item.agent!.id, JSON.stringify(item.listing), JSON.stringify(request)], c);
      if (rows.length) { ids.push(rows[0].id); await audit(actor, "office.open_house.enqueue", rows[0].id, c); }
    }
    return ids;
  });
}
export async function openHouseJobs(keys?: string[]): Promise<OpenHouseJob[]> {
  return query<OpenHouseJob>(`SELECT j.id,j.fingerprint AS key,
    COALESCE(g.status,j.status) AS status,COALESCE(g.error,j.error) AS error,
    t.generation_id AS "generationId",g.output_asset_id AS "outputAssetId",
    j.listing->'address'->>'full' AS address,a.name AS "agentName"
    FROM portal.content_open_house_jobs j JOIN portal.agents a ON a.id=j.subject_agent_id
    LEFT JOIN portal.content_office_tasks t ON t.id=j.id
    LEFT JOIN portal.content_generations g ON g.id=t.generation_id
    WHERE ($1::text[] IS NULL OR j.fingerprint=ANY($1))
    ORDER BY j.created_at DESC LIMIT 2000`, [keys ?? null]);
}
