import { readFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import type { ImageSize } from "./types";

// Ship the approved original with the worker; never depend on an external URL
// or ask the image model to recreate the company's identity.
export async function companyLogo(): Promise<Buffer> {
  return readFile(path.join(process.cwd(), "src/assets/content/homix-logo.webp"));
}

/** A separate footer guarantees branding without covering any generated copy.
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
