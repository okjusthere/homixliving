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
    );
    refs.push(a.id);
  }
  refs.push(...(job.input.listing?.imageAssetIds || []));
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
    "UPDATE portal.content_generations SET status='generating',provider_started_at=now(),updated_at=now() WHERE id=$1 AND status='preparing' RETURNING id",
    [id],
  );
  if (!claimed.length) return null;
  try {
    const result = await generateAzureImage(
      job.prompt,
      job.input.size,
      refs,
      job.provider_config || undefined,
    );
    // Workflow persists the successful step result before the next step. Never
    // repeat the provider call if the process died after taking the DB claim.
    return {
      bytes: new Uint8Array(result.bytes),
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
    Buffer.from(result.bytes),
    "output",
    id,
    false,
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
