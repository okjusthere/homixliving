import { createHash, randomUUID } from "node:crypto";
import { inputSchema, uuid } from "./validation";
import {
  audit,
  ContentError,
  getTemplate,
  holidays,
  query,
  transaction,
} from "./store";
import { loadBrand } from "./brand";
import { buildPosterPrompt } from "./prompts";
import { azureImageSnapshot } from "./azure";
import { getAsset, assertContentStorageConfigured } from "./storage";
import { posterLanguages, listingDetailLevel } from "./output-plan";

export async function submitGeneration(
  agentId: number,
  admin: boolean,
  body: Record<string, unknown>,
) {
  const templateId = uuid.parse(body.templateId),
    idempotencyKey = uuid.parse(body.idempotencyKey);
  const input = inputSchema.parse(body.input);
  if (
    input.kind === "listing" &&
    listingDetailLevel(input.theme) === "detailed" &&
    input.listing?.description?.trim() &&
    !input.listing.highlightsReviewed
  )
    throw new ContentError(
      "Extract and confirm the property highlights first / 请先提取并确认房源亮点",
      409,
      "HIGHLIGHTS_REVIEW_REQUIRED",
    );
  const languages = posterLanguages(input, body.languages);
  const projectId = body.projectId ? uuid.parse(body.projectId) : undefined;
  const hash = createHash("sha256")
    .update(JSON.stringify({ templateId, input, projectId, languages }))
    .digest("hex");
  const [existing] = await query<{ id: string; request_hash: string }>(
    "SELECT id,request_hash FROM portal.content_generations WHERE owner_agent_id=$1 AND idempotency_key=$2",
    [agentId, idempotencyKey],
  );
  if (existing) {
    if (existing.request_hash !== hash)
      throw new ContentError(
        "Request key was already used for different content",
        409,
      );
    return existing.id;
  }
  const providerConfig = azureImageSnapshot();
  assertContentStorageConfigured();
  const template = await getTemplate(templateId);
  if (!template || (!admin && template.status !== "published"))
    throw new ContentError("Template not available / 模板尚未发布", 404);
  if (
    template.config.kind !== input.kind ||
    (!template.config.themes.includes("*") &&
      !template.config.themes.includes(input.theme)) ||
    !template.config.sizes.includes(input.size)
  )
    throw new ContentError("Template does not support this topic or size");
  const brand = await loadBrand(agentId);
  if (input.includePortrait && !brand.photoUrl)
    throw new ContentError(
      "Add your real portrait in My Profile first / 请先在个人资料中上传头像",
      409,
      "PORTRAIT_REQUIRED",
    );
  const holiday =
    input.kind === "holiday"
      ? (await holidays()).find((h) => h.id === input.theme)
      : undefined;
  if (input.kind === "holiday" && !holiday)
    throw new ContentError("Holiday is unavailable", 404);
  for (const id of input.listing?.imageAssetIds || [])
    await getAsset(id, agentId);
  for (const id of template.config.referenceAssetIds) {
    const a = await getAsset(id, agentId, true);
    if (a.purpose !== "template")
      throw new ContentError("Template reference is invalid");
  }
  return transaction(async (c) => {
    await c.query("SELECT pg_advisory_xact_lock(702610,$1)", [agentId]);
    const [again] = await query<{ id: string; request_hash: string }>(
      "SELECT id,request_hash FROM portal.content_generations WHERE owner_agent_id=$1 AND idempotency_key=$2",
      [agentId, idempotencyKey],
      c,
    );
    if (again) {
      if (again.request_hash !== hash)
        throw new ContentError("Request conflict", 409);
      return again.id;
    }
    const [{ count }] = await query<{ count: string }>(
      "SELECT count(*) FROM portal.content_generations WHERE owner_agent_id=$1 AND NOT admin_only AND created_at >= ((now() AT TIME ZONE 'America/New_York')::date AT TIME ZONE 'America/New_York')",
      [agentId],
      c,
    );
    const [settings] = await query<{ value: string }>(
      "SELECT value FROM portal.settings WHERE key='content_daily_limit'",
      [],
      c,
    );
    const limit = Math.max(1, Math.min(100, Number(settings?.value) || 10));
    if (Number(count) + languages.length > limit)
      throw new ContentError(
        "Not enough daily generations for these images / 今日剩余次数不足以生成所选图片",
        429,
        "DAILY_LIMIT",
      );
    // The per-agent transaction lock serializes concurrent submissions. Append
    // to the current queue tail, including the second language in a pair.
    const [tail] = await query<{ id: string }>(
      "SELECT job.id FROM portal.content_generations job WHERE job.owner_agent_id=$1 AND job.status IN ('queued','preparing','generating','saving') AND NOT EXISTS (SELECT 1 FROM portal.content_generations child WHERE child.predecessor_id=job.id AND child.status IN ('queued','preparing','generating','saving')) ORDER BY job.created_at DESC,job.id DESC LIMIT 1",
      [agentId],
      c,
    );
    const project = projectId || randomUUID();
    if (projectId) {
      const rows = await query(
        "UPDATE portal.content_projects SET input=$1,updated_at=now() WHERE id=$2 AND owner_agent_id=$3 AND NOT admin_only RETURNING id",
        [JSON.stringify(input), projectId, agentId],
        c,
      );
      if (!rows.length) throw new ContentError("Project not found", 404);
    } else
      await c.query(
        "INSERT INTO portal.content_projects(id,owner_agent_id,title,input) VALUES($1,$2,$3,$4)",
        [
          project,
          agentId,
          input.listing?.address ||
            input.headline ||
            holiday?.name.en ||
            input.theme,
          JSON.stringify(input),
        ],
      );
    const id = randomUUID();
    let predecessor: string | null = tail?.id || null;
    for (const [index, language] of languages.entries()) {
      const outputId = index === 0 ? id : randomUUID();
      const outputInput = { ...input, language };
      const prompt = buildPosterPrompt(
        template.config,
        outputInput,
        brand,
        holiday,
      );
      await c.query(
        "INSERT INTO portal.content_generations(id,project_id,owner_agent_id,template_id,idempotency_key,request_hash,status,input,brand,prompt,provider_config,batch_id,predecessor_id) VALUES($1,$2,$3,$4,$5,$6,'queued',$7,$8,$9,$10,$11,$12)",
        [
          outputId,
          project,
          agentId,
          templateId,
          index === 0 ? idempotencyKey : randomUUID(),
          hash,
          JSON.stringify(outputInput),
          JSON.stringify(brand),
          prompt,
          JSON.stringify(providerConfig),
          id,
          predecessor,
        ],
      );
      await audit(agentId, "generation.create", outputId, c);
      predecessor = outputId;
    }
    return id;
  });
}
