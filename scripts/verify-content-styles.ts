/** Generate four local comparison samples using an existing approved input.
 * No campaign is sent or published; production records are read-only.
 * Supply DATABASE_URL, Azure and content R2 configuration via env files.
 */
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { Pool } from "pg";
import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";
import { initialTemplates } from "../src/lib/content/catalog";
import { buildPosterPrompt } from "../src/lib/content/prompts";
import { generateAzureImage } from "../src/lib/content/azure";
import { contentStorageConfig } from "../src/lib/content/storage-config";
import type { BrandContext, ContentInput } from "../src/lib/content/types";

async function main() {
  const id = process.argv[2];
  const output = process.argv[3];
  if (!id || !output || !process.env.DATABASE_URL) throw new Error("Supply generation ID, output directory and DATABASE_URL");
  const config = contentStorageConfig();
  if (!config) throw new Error("Content R2 configuration missing");
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 1, connectionTimeoutMillis: 10000 });
  let source: { input: ContentInput; brand: BrandContext; reference_asset_ids: string[] };
  const references: Buffer[] = [];
  try {
    const { rows } = await pool.query("SELECT input,brand,reference_asset_ids FROM portal.content_generations WHERE id=$1 AND status='succeeded'", [id]);
    source = rows[0];
    if (!source?.input.listing || !source.reference_asset_ids.length) throw new Error("A completed listing generation with references is required");
    const client = new S3Client({ region: "auto", endpoint: `https://${config.account}.r2.cloudflarestorage.com`, credentials: config.credentials });
    // Include only the saved portrait and original property photos, not old style references.
    const ids = source.reference_asset_ids.slice(0, Number(source.input.includePortrait) + source.input.listing.imageAssetIds.length);
    for (const assetId of ids) {
      const { rows: [asset] } = await pool.query("SELECT object_key FROM portal.content_assets WHERE id=$1", [assetId]);
      const result = await client.send(new GetObjectCommand({ Bucket: config.bucket, Key: asset.object_key }));
      if (!result.Body) throw new Error("Missing reference asset");
      references.push(Buffer.from(await result.Body.transformToByteArray()));
    }
    client.destroy();
  } finally { await pool.end(); }
  await mkdir(output, { recursive: true });
  // Two at a time keeps the comparison bounded without overwhelming the provider.
  for (const theme of ["under_contract", "open_house"]) {
    const results = await Promise.allSettled(["editorial", "modern"].map(async (style) => {
      const template = initialTemplates().find((t) => t.key === `${theme}-${style}`)!;
      const input: ContentInput = { ...source.input, theme, headline: "", message: "", additionalInstructions: "", language: theme === "open_house" ? "zh" : "en" };
      const prompt = buildPosterPrompt(template.config, input, source.brand);
      const filename = path.join(output, `${theme}-${style}`);
      await writeFile(`${filename}.prompt.txt`, prompt, { mode: 0o600 });
      const result = await generateAzureImage(prompt, input.size, references);
      await writeFile(`${filename}.png`, result.bytes, { mode: 0o600 });
      await writeFile(`${filename}.usage.json`, JSON.stringify({ usage: result.usage, requestId: result.requestId, deployment: result.deployment }, null, 2), { mode: 0o600 });
      console.log(JSON.stringify({ output: `${filename}.png`, deployment: result.deployment, bytes: result.bytes.length }));
    }));
    if (results.some((r) => r.status === "rejected")) throw new Error("Sample generation failed; inspect completed outputs before retrying");
  }
}
main().catch((error) => {
  console.error(JSON.stringify({ error: error instanceof Error ? error.message : "Sample verification failed" }));
  process.exitCode = 1;
});
