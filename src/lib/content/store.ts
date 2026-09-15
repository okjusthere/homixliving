import { pgPool } from "@/db";
import type { PoolClient, QueryResultRow } from "pg";
import type { ContentTemplate, Generation, Holiday } from "./types";

export async function query<T extends QueryResultRow = QueryResultRow>(
  sql: string,
  values: unknown[] = [],
  client?: PoolClient,
): Promise<T[]> {
  return (await (client ?? pgPool).query<T>(sql, values)).rows;
}
export async function transaction<T>(
  fn: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const client = await pgPool.connect();
  try {
    await client.query("BEGIN");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
export class ContentError extends Error {
  constructor(
    message: string,
    public status = 400,
    public code = "INVALID_INPUT",
  ) {
    super(message);
  }
}
export const templateColumns = `id,family_id AS "familyId",version,status,config,created_at AS "createdAt"`;
export const generationColumns = `id,project_id AS "projectId",owner_agent_id AS "ownerAgentId",office_task_id AS "officeTaskId",template_id AS "templateId",status,input,brand,prompt,output_asset_id AS "outputAssetId",error,usage,created_at AS "createdAt",updated_at AS "updatedAt"`;
export async function getTemplate(id: string) {
  return (
    await query<ContentTemplate>(
      `SELECT ${templateColumns} FROM portal.content_templates WHERE id=$1`,
      [id],
    )
  )[0];
}
export async function getGeneration(
  id: string,
  agentId: number,
  admin = false,
) {
  const [row] = await query<Generation>(
    `SELECT ${generationColumns} FROM portal.content_generations WHERE id=$1 AND ((owner_agent_id=$2 AND NOT admin_only) OR $3)`,
    [id, agentId, admin],
  );
  if (!row) throw new ContentError("Generation not found", 404, "NOT_FOUND");
  return row;
}
export async function holidays(includeDisabled = false): Promise<Holiday[]> {
  return query<Holiday>(
    `SELECT h.*,COALESCE((SELECT jsonb_agg(jsonb_build_object('year',d.year,'date',to_char(d.date,'YYYY-MM-DD')) ORDER BY d.year) FROM portal.content_holiday_dates d WHERE d.holiday_id=h.id),'[]'::jsonb) AS dates FROM portal.content_holidays h WHERE enabled OR $1 ORDER BY country,id`,
    [includeDisabled],
  );
}
export async function audit(
  agentId: number,
  action: string,
  id: string,
  client?: PoolClient,
) {
  await query(
    "INSERT INTO portal.content_audit(actor_agent_id,action,entity_id) VALUES($1,$2,$3)",
    [agentId, action, id],
    client,
  );
}
