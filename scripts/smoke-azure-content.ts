import { readFile, writeFile } from "node:fs/promises";
import { generateAzureImage, AzureImageError } from "../src/lib/content/azure";
import { initialTemplates } from "../src/lib/content/catalog";
import { buildPosterPrompt } from "../src/lib/content/prompts";

async function main() {
  const env = await readFile(".env.local", "utf8");
  for (const line of env.split(/\r?\n/)) {
    const m =
      /^(AZURE_IMAGE_(?:ENDPOINT|API_KEY|DEPLOYMENT|API_VERSION))=(.*)$/.exec(
        line,
      );
    if (m) process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
  }
  const output =
    process.env.CONTENT_SMOKE_OUTPUT ||
    "/private/tmp/homix-azure-content-smoke.png";
  const reference = process.env.CONTENT_SMOKE_REFERENCE;
  const prompt = buildPosterPrompt(
    initialTemplates().find((t) => t.key === "holiday-minimal")!.config,
    {
      kind: "holiday", theme: "mid-autumn", language: "zh", size: "1024x1280",
      includePortrait: false, headline: "中秋快乐", message: "月圆人团圆",
      additionalInstructions: "",
    },
    { agentId: 0, name: "Homix Realty", title: "", email: "", phone: "",
      licenseNumber: "", companyId: "homix_realty", companyName: "Homix Realty", photoUrl: null },
  );
  const result = await generateAzureImage(
    prompt,
    "1024x1280",
    reference ? [await readFile(reference)] : [],
  );
  await writeFile(output, result.bytes, { mode: 0o600 });
  console.log(
    JSON.stringify({
      ok: true,
      deployment: result.deployment,
      requestId: result.requestId,
      bytes: result.bytes.length,
      usage: result.usage,
      output,
    }),
  );
}
main().catch((e) => {
  console.error(
    JSON.stringify({
      ok: false,
      code: e instanceof AzureImageError ? e.code : "SMOKE_FAILED",
      uncertain: e instanceof AzureImageError ? e.uncertain : true,
    }),
  );
  process.exitCode = 1;
});
