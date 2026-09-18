import { readFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import type { ImageSize } from "./types";

// Ship the approved original with the worker; never depend on an external URL
// and supply it to the image model as the authoritative brand reference.
export async function companyLogo(): Promise<Buffer> {
  return readFile(path.join(process.cwd(), "src/assets/content/homix-logo.webp"));
}

export const companyLogoInstructions = "FINAL COMPANY BRANDING OVERRIDE: The LAST reference image is the official company logo and MUST appear exactly once INSIDE the finished poster, on every theme, even without a portrait. Preserve its original lettering, proportions and linework; never replace it with typed text or an invented mark. Choose its placement to balance the composition, with clear space and sufficient contrast on a continuous background. No detached logo box, appended footer or extra canvas. Original Chinese and English logo lettering is allowed in either output language. This overrides any instruction to omit the logo or add it afterward; no branding will be added after generation.";

export async function withCompanyLogo(prompt: string, references: Buffer[]) {
  // Azure receives actual PNG bytes, including transparency, rather than a URL
  // or a WebP file mislabeled as image/png. Keep portrait/property indices stable.
  const logo = await sharp(await companyLogo()).png().toBuffer();
  return {
    prompt: `${prompt}\n\n${companyLogoInstructions}`,
    references: [...references, logo],
  };
}

/** Legacy fallback ONLY for provider results persisted before integrated branding.
 * A separate footer guarantees branding without covering any generated copy.
 * Fit the entire artwork above it, preserving proportions and output size.
 * This runs in the retryable save step, after the provider result is persisted.
 */
export async function addCompanyLogo(bytes: Buffer, size: ImageSize): Promise<Buffer> {
  const [width, height] = size.split("x").map(Number);
  const footerHeight = Math.round(width * 0.18);
  const padding = Math.round(width * 0.02);
  const logo = await sharp(await companyLogo())
    .resize({ width: Math.round(width * 0.25), height: footerHeight - padding * 2, fit: "inside" })
    .png()
    .toBuffer({ resolveWithObject: true });
  const artwork = await sharp(bytes, { limitInputPixels: 8_000_000 })
    .resize({ width, height: height - footerHeight, fit: "contain", background: "#ffffff" })
    .extend({ bottom: footerHeight, background: "#ffffff" })
    .png()
    .toBuffer();
  return sharp(artwork)
    .composite([{
      input: logo.data,
      left: Math.round((width - logo.info.width) / 2),
      top: height - footerHeight + Math.round((footerHeight - logo.info.height) / 2),
    }])
    .png()
    .toBuffer();
}
