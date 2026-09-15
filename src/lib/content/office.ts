import { officeDraftInputSchema } from "./office-draft-schema";
import { getAsset, assetBytes, putAsset } from "./storage";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { uuid } from "./validation";
import { audit, ContentError, query, transaction } from "./store";
import { submitGeneration } from "./generations";
import { dispatchGeneration } from "./dispatch";
import { posterLanguages } from "./output-plan";
import type { OfficeRequest } from "./office-types";

export const officeRequestSchema = z.object({
  templateId: uuid,
  input: officeDraftInputSchema,
  languages: z.array(z.enum(["zh", "en"])).min(1).max(2),
});

export async function saveOfficeTask(actor: number, body: Record<string, unknown>) {
  const subject = z.number().int().positive().parse(body.subjectAgentId);
  const request = officeRequestSchema.parse(body.request);
  request.languages = posterLanguages(request.input, request.languages);
  const [agent] = await query("SELECT id FROM portal.agents WHERE id=$1 AND account_status='active'", [subject]);
  if (!agent) throw new ContentError("Choose an active Agent / 请选择有效的经纪人", 404);
  // Copy only when changing the subject. Each Agent receives their own private
  // asset records; publishing one output never exposes another Agent's library.
  const remap: Record<string, string> = {};
  for (const assetId of [...(request.input.listing?.imageAssetIds || []), ...(request.input.referenceAssetIds || [])]) {
    const asset = await getAsset(assetId, actor, true);
    if (asset.owner_agent_id !== subject) {
      const copy = await putAsset(subject, await assetBytes(asset), "upload", undefined, false, true);
      remap[assetId] = copy.id;
    }
  }
  if (request.input.listing) request.input.listing.imageAssetIds = request.input.listing.imageAssetIds.map((id) => remap[id] || id);
  if (request.input.referenceAssetIds) request.input.referenceAssetIds = request.input.referenceAssetIds.map((id) => remap[id] || id);
  const id = body.id ? uuid.parse(body.id) : randomUUID();
  await transaction(async (c) => {
    if (body.id) {
      const rows = await query("UPDATE portal.content_office_tasks SET subject_agent_id=$2,request=$3,updated_at=now() WHERE id=$1 AND submission_started_at IS NULL AND generation_id IS NULL RETURNING id", [id, subject, JSON.stringify(request)], c);
      if (!rows.length) throw new ContentError("This task was already submitted. Duplicate it to make another version / 此任务已提交，请复制后制作新版本", 409);
    } else {
      await c.query("INSERT INTO portal.content_office_tasks(id,created_by,subject_agent_id,request,submission_key) VALUES($1,$2,$3,$4,$5)", [id, actor, subject, JSON.stringify(request), randomUUID()]);
    }
    await audit(actor, "office.task.save", id, c);
  });
  return id;
}

export async function submitOfficeTask(actor: number, id: string) {
  const [task] = await query<{ subject_agent_id: number; created_by: number; request: OfficeRequest; submission_key: string; generation_id: string | null }>(
    "UPDATE portal.content_office_tasks SET submission_started_at=COALESCE(submission_started_at,now()),updated_at=now() WHERE id=$1 RETURNING *", [id],
  );
  if (!task) throw new ContentError("Task not found / 找不到任务", 404);
  if (task.generation_id) {
    await dispatchGeneration(task.generation_id);
    return task.generation_id;
  }
  try {
    // The task ID is the stable idempotency context; audit the actual submitter.
    const generationId = await submitGeneration(task.subject_agent_id, true, {
      ...task.request, idempotencyKey: task.submission_key,
    }, { actorAgentId: actor, taskId: id });
    await query("UPDATE portal.content_office_tasks SET generation_id=$2,updated_at=now() WHERE id=$1", [id, generationId]);
    await audit(actor, "office.task.submit", id);
    await dispatchGeneration(generationId);
    return generationId;
  } catch (e) {
    // Only unlock editing when no durable generation exists. A transport error
    // after commit must not result in a second generation on retry.
    await query("UPDATE portal.content_office_tasks SET submission_started_at=NULL WHERE id=$1 AND NOT EXISTS(SELECT 1 FROM portal.content_generations WHERE office_task_id=$1)", [id]);
    throw e;
  }
}

export async function deleteOfficeTask(actor: number, id: string) {
  await transaction(async (c) => {
    const rows = await query("DELETE FROM portal.content_office_tasks WHERE id=$1 AND submission_started_at IS NULL AND generation_id IS NULL RETURNING id", [id], c);
    if (!rows.length) throw new ContentError("Only unsubmitted drafts can be deleted / 仅未提交的草稿可以删除", 409);
    await audit(actor, "office.task.delete", id, c);
  });
}

export async function reviewOfficeOutput(actor: number, id: string, action: string) {
  if (!["approve", "deliver", "cancel"].includes(action)) throw new ContentError("Unknown action", 400);
  await transaction(async (c) => {
    const [job] = await query<{ status: string; review_status: string; output_asset_id: string | null; owner_agent_id: number; project_id: string; input: OfficeRequest["input"] }>("SELECT * FROM portal.content_generations WHERE id=$1 AND office_task_id IS NOT NULL FOR UPDATE", [id], c);
    if (!job) throw new ContentError("Office artwork not found / 找不到办公室作品", 404);
    if (action === "cancel") {
      const changed = await query("UPDATE portal.content_generations SET status='failed',error='CANCELLED_BY_USER',updated_at=now() WHERE id=$1 AND status='queued' AND workflow_run_id IS NULL AND dispatch_at IS NULL RETURNING id", [id], c);
      if (!changed.length) throw new ContentError("This image has started; wait for the result / 这张图片已经开始处理，请等待结果", 409);
    } else {
      if (job.status !== "succeeded" || !job.output_asset_id) throw new ContentError("Wait for a completed image before reviewing / 请等待图片生成完成后审核", 409);
      if (action === "deliver" && !["approved", "delivered"].includes(job.review_status)) throw new ContentError("Approve this image before delivery / 请先审核通过这张图片再交付", 409);
      if (action === "approve" && job.review_status !== "delivered") await c.query("UPDATE portal.content_generations SET review_status='approved',updated_at=now() WHERE id=$1", [id]);
      if (action === "deliver") {
        const ids = [job.output_asset_id, ...(job.input.listing?.imageAssetIds || []), ...(job.input.referenceAssetIds || [])];
        await c.query("UPDATE portal.content_assets SET admin_only=false WHERE id=ANY($1::uuid[]) AND owner_agent_id=$2", [ids, job.owner_agent_id]);
        await c.query("UPDATE portal.content_generations SET review_status='delivered',admin_only=false,updated_at=now() WHERE id=$1", [id]);
        // Project stays office-private: the Agent can re-generate as a NEW
        // personal project without exposing other unapproved language versions.
      }
    }
    await audit(actor, `office.output.${action}`, id, c);
  });
  if (action === "cancel") {
    const children = await query<{ id: string }>("SELECT id FROM portal.content_generations WHERE predecessor_id=$1 AND status='queued'", [id]);
    for (const child of children) await dispatchGeneration(child.id);
  }
}
