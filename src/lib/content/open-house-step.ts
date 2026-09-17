import { query, ContentError } from "./store";
import { putAsset, fetchReferenceImage } from "./storage";
import { officeRequestSchema, submitOfficeTask } from "./office";
import { loadBrand } from "./brand";
import { listingEvents, type StudioListing } from "./listing-source";
import type { OfficeRequest } from "./office-types";

/** Retry-safe: the asset, office task and submission key use the durable job ID. */
export async function prepareOpenHouseJob(id: string) {
  "use step";
  const [job] = await query<{ created_by: number; subject_agent_id: number; listing: StudioListing; request: OfficeRequest; status: string }>("SELECT * FROM portal.content_open_house_jobs WHERE id=$1", [id]);
  if (!job || job.status === "submitted" || job.status === "failed") return;
  let stage = "检查经纪人资料";
  try {
    const [admin] = await query("SELECT id FROM portal.agents WHERE id=$1 AND is_admin AND account_status='active'", [job.created_by]);
    if (!admin) throw new ContentError("提交人的管理员权限已失效，请管理员重新处理。", 403);
    await query("UPDATE portal.content_open_house_jobs SET status='preparing',updated_at=now() WHERE id=$1", [id]);
    const [existing] = await query("SELECT id FROM portal.content_office_tasks WHERE id=$1", [id]);
    if (!existing) {
      if (!listingEvents(job.listing).length) throw new ContentError("公展时间已过期，请刷新房源后重新制作。");
      const brand = await loadBrand(job.subject_agent_id);
      if (!brand.photoUrl) throw new ContentError(`${brand.name} 缺少头像，请先完善个人资料。`);
      stage = "导入房源照片";
      if (!job.listing.photos[0]?.url) throw new ContentError("房源缺少主图，请补充 MLS 照片。");
      await putAsset(job.subject_agent_id, await fetchReferenceImage(job.listing.photos[0].url), "upload", id, true, true);
      const request = officeRequestSchema.parse(job.request);
      await query(`INSERT INTO portal.content_office_tasks(id,created_by,subject_agent_id,request,submission_key)
        VALUES($1,$2,$3,$4,$1) ON CONFLICT(id) DO NOTHING`, [id, job.created_by, job.subject_agent_id, JSON.stringify(request)]);
    }
    stage = "加入海报生成队列";
    await submitOfficeTask(job.created_by, id);
    await query("UPDATE portal.content_open_house_jobs SET status='submitted',error=NULL,updated_at=now() WHERE id=$1", [id]);
  } catch (e) {
    const message = e instanceof ContentError ? e.message : `${stage}失败，请点击重试；持续失败请在海报制作中检查该房源资料。`;
    // A sibling/retried worker that completed must not be downgraded by this one.
    await query("UPDATE portal.content_open_house_jobs SET status='failed',error=$2,updated_at=now() WHERE id=$1 AND status<>'submitted'", [id, message]);
  }
}
