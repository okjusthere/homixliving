import { randomUUID } from "node:crypto";
import { contentActor, contentError, jsonBody } from "@/lib/content/api";
import {
  audit,
  ContentError,
  query,
  templateColumns,
  transaction,
} from "@/lib/content/store";
import { templateConfigSchema, uuid } from "@/lib/content/validation";
import { getAsset } from "@/lib/content/storage";
import type { ContentTemplate } from "@/lib/content/types";
export const runtime = "nodejs";
export async function GET(req: Request) {
  try {
    const actor = await contentActor(req);
    if (actor instanceof Response) return actor;
    const all =
      actor.admin && new URL(req.url).searchParams.get("admin") === "1";
    const templates = await query<ContentTemplate>(
      `SELECT ${templateColumns} FROM portal.content_templates WHERE (status='published' AND config->>'kind' NOT IN ('birthday','anniversary')) OR $1 ORDER BY created_at DESC`,
      [all],
    );
    return Response.json({ templates });
  } catch (e) {
    return contentError(e);
  }
}
export async function POST(req: Request) {
  try {
    const actor = await contentActor(req, true);
    if (actor instanceof Response) return actor;
    const body = await jsonBody(req),
      config = templateConfigSchema.parse(body.config);
    const familyId = body.familyId ? uuid.parse(body.familyId) : randomUUID(),
      id = randomUUID();
    for (const assetId of config.referenceAssetIds) {
      const a = await getAsset(assetId, actor.agentId, true);
      if (a.purpose !== "template")
        throw new ContentError("Invalid template reference");
    }
    // Validate variable names before an administrator can publish the template.
    const allowed = new Set([
      "theme",
      "agent.name",
      "agent.email",
      "agent.phone",
      "brokerage.name",
      "listing.address",
      "listing.price",
      "holiday.name",
      "message",
    ]);
    for (const match of config.prompt.matchAll(/\{\{\s*([\w.]+)\s*\}\}/g))
      if (!allowed.has(match[1]))
        throw new ContentError(`Unsupported variable: ${match[1]}`);
    const result = await transaction(async (c) => {
      await c.query("SELECT pg_advisory_xact_lock(hashtext($1))", [
        `content-template:${familyId}`,
      ]);
      const [{ version }] = await query<{ version: number }>(
        "SELECT COALESCE(max(version),0)+1 AS version FROM portal.content_templates WHERE family_id=$1",
        [familyId],
        c,
      );
      const [row] = await query<ContentTemplate>(
        `INSERT INTO portal.content_templates(id,family_id,version,status,config,created_by) VALUES($1,$2,$3,'draft',$4,$5) RETURNING ${templateColumns}`,
        [id, familyId, version, JSON.stringify(config), actor.agentId],
        c,
      );
      await audit(actor.agentId, "template.save_draft", id, c);
      return row;
    });
    return Response.json({ template: result }, { status: 201 });
  } catch (e) {
    return contentError(e);
  }
}
export async function PATCH(req: Request) {
  try {
    const actor = await contentActor(req, true);
    if (actor instanceof Response) return actor;
    const body = await jsonBody(req),
      id = uuid.parse(body.id);
    if (!["publish", "retire"].includes(String(body.action)))
      throw new ContentError("Invalid action");
    await transaction(async (c) => {
      const [target] = await query<{ family_id: string }>(
        "SELECT family_id FROM portal.content_templates WHERE id=$1",
        [id],
        c,
      );
      if (!target) throw new ContentError("Template not found", 404);
      await c.query("SELECT pg_advisory_xact_lock(hashtext($1))", [
        `content-template:${target.family_id}`,
      ]);
      if (body.action === "publish")
        await c.query(
          "UPDATE portal.content_templates SET status='retired' WHERE family_id=$1 AND status='published'",
          [target.family_id],
        );
      await c.query(
        "UPDATE portal.content_templates SET status=$2 WHERE id=$1",
        [id, body.action === "publish" ? "published" : "retired"],
      );
      await audit(actor.agentId, `template.${body.action}`, id, c);
    });
    return Response.json({ ok: true });
  } catch (e) {
    return contentError(e);
  }
}
