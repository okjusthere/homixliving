import { FatalError, RetryableError } from "workflow";
import { query, getTemplate } from "./store";
import { getAsset, assetBytes, fetchReferenceImage, putAsset } from "./storage";
import {
  AzureImageError,
  generateAzureImage,
  type AzureImageSnapshot,
} from "./azure";
import type { BrandContext, ContentInput } from "./types";
import { dispatchGeneration } from "./dispatch";
import { addCompanyLogo, companyLogo } from "./logo";
import { withoutPosterLicense } from "./prompts";

type Job = {
  id: string;
  owner_agent_id: number;
  template_id: string;
  brand: BrandContext;
  input: ContentInput;
  prompt: string;
  status: string;
  reference_asset_ids: string[];
  provider_config: AzureImageSnapshot | null;
  admin_only: boolean;
};
export async function prepareGeneration(id: string) {
  "use step";
  const [job] = await query<Job>(
    "SELECT * FROM portal.content_generations WHERE id=$1",
    [id],
  );
  if (!job || !["queued", "preparing"].includes(job.status)) return false;
  const [agent] = await query(
    "SELECT id FROM portal.agents WHERE id=$1 AND account_status='active'",
    [job.owner_agent_id],
  );
  if (!agent) throw new FatalError("Agent is no longer active");
  // Fail before spending an image generation if the deployment lacks branding.
  await companyLogo();
  await query(
    "UPDATE portal.content_generations SET status='preparing',updated_at=now() WHERE id=$1 AND status='queued'",
    [id],
  );
  if (job.reference_asset_ids.length) return true;
  const refs: string[] = [];
  if (job.input.includePortrait && job.brand.photoUrl) {
    const a = await putAsset(
      job.owner_agent_id,
      await fetchReferenceImage(job.brand.photoUrl),
      "reference",
      undefined,
      true,
      job.admin_only,
    );
    refs.push(a.id);
  }
  refs.push(...(job.input.listing?.imageAssetIds || []));
  refs.push(...(job.input.referenceAssetIds || []));
  const template = await getTemplate(job.template_id);
  refs.push(...(template?.config.referenceAssetIds || []));
  await query(
    "UPDATE portal.content_generations SET reference_asset_ids=$2,updated_at=now() WHERE id=$1 AND status='preparing'",
    [id, JSON.stringify(refs)],
  );
  return true;
}

export async function requestGeneration(id: string): Promise<{
  bytes: Uint8Array;
  branding: "integrated";
  usage: Record<string, unknown> | null;
  requestId: string | null;
} | null> {
  "use step";
  const [job] = await query<Job>(
    "SELECT * FROM portal.content_generations WHERE id=$1",
    [id],
  );
  if (!job || job.status !== "preparing") return null;
  const refs: Buffer[] = [];
  for (const assetId of job.reference_asset_ids)
    refs.push(
      await assetBytes(await getAsset(assetId, job.owner_agent_id, true)),
    );
  const claimed = await query(
    `UPDATE portal.content_generations g SET status='generating',provider_started_at=now(),updated_at=now() WHERE id=$1 AND status='preparing'
      AND (input->>'kind' NOT IN ('birthday','anniversary') OR EXISTS (
        SELECT 1 FROM portal.agent_celebration_events e JOIN portal.agent_celebration_profiles b ON b.agent_id=e.agent_id AND b.kind=e.kind JOIN portal.agents a ON a.id=b.agent_id
        WHERE e.generation_id=g.id AND e.profile_revision=b.revision AND b.enabled AND a.account_status='active'
      )) RETURNING id`,
    [id],
  );
  if (!claimed.length) {
    await query(
      "UPDATE portal.content_generations SET status='failed',error='BIRTHDAY_CHANGED',updated_at=now() WHERE id=$1 AND status='preparing' AND input->>'kind' IN ('birthday','anniversary')",
      [id],
    );
    return null;
  }
  try {
    const result = await generateAzureImage(
      withoutPosterLicense(job.prompt, job.brand.licenseNumber),
      job.input.size,
      refs,
      job.provider_config || undefined,
    );
    // Workflow persists the successful step result before the next step. Never
    // repeat the provider call if the process died after taking the DB claim.
    return {
      bytes: new Uint8Array(result.bytes),
      branding: "integrated",
      usage: result.usage,
      requestId: result.requestId,
    };
  } catch (error) {
    if (
      error instanceof AzureImageError &&
      error.code === "AZURE_RATE_LIMITED"
    ) {
      await query(
        "UPDATE portal.content_generations SET status='preparing',updated_at=now() WHERE id=$1 AND status='generating'",
        [id],
      );
      throw new RetryableError("Azure rate limited", {
        retryAfter: `${error.retryAfter}s`,
      });
    }
    const uncertain = !(error instanceof AzureImageError) || error.uncertain;
    await query(
      "UPDATE portal.content_generations SET status=$2,error=$3,provider_request_id=$4,updated_at=now() WHERE id=$1",
      [
        id,
        uncertain ? "needs_review" : "failed",
        error instanceof AzureImageError ? error.code : "AZURE_OUTCOME_UNKNOWN",
        error instanceof AzureImageError ? error.requestId : null,
      ],
    );
    throw new FatalError("Image provider request failed");
  }
}
requestGeneration.maxRetries = 3;

export async function saveGeneration(
  id: string,
  result: {
    bytes: Uint8Array;
    branding?: "integrated";
    usage: Record<string, unknown> | null;
    requestId: string | null;
  },
) {
  "use step";
  const [job] = await query<Job>(
    "SELECT * FROM portal.content_generations WHERE id=$1",
    [id],
  );
  if (!job || job.status === "succeeded") return;
  await query(
    "UPDATE portal.content_generations SET status='saving',updated_at=now() WHERE id=$1",
    [id],
  );
  // Output uses job ID so retries write the same immutable output object.
  await putAsset(
    job.owner_agent_id,
    result.branding === "integrated"
      ? Buffer.from(result.bytes)
      : await addCompanyLogo(Buffer.from(result.bytes), job.input.size),
    "output",
    id,
    false,
    job.admin_only,
  );
  await query(
    "UPDATE portal.content_generations SET status='succeeded',output_asset_id=$1,usage=$2,provider_request_id=$3,error=null,updated_at=now() WHERE id=$1",
    [id, JSON.stringify(result.usage), result.requestId],
  );
}
saveGeneration.maxRetries = 5;

export async function failGeneration(id: string) {
  "use step";
  await query(
    "UPDATE portal.content_generations SET status=CASE WHEN status IN ('generating','saving') THEN 'needs_review' ELSE 'failed' END,error=COALESCE(error,'GENERATION_FAILED'),updated_at=now() WHERE id=$1 AND status NOT IN ('succeeded','failed','needs_review')",
    [id],
  );
}

export async function dispatchFollowingGeneration(id: string) {
  "use step";
  const rows = await query<{ id: string }>(
    "SELECT id FROM portal.content_generations WHERE predecessor_id=$1 AND status='queued'",
    [id],
  );
  for (const row of rows) await dispatchGeneration(row.id);
}
