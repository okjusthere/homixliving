import test from "node:test";
import assert from "node:assert/strict";
import sharp from "sharp";
import { addCompanyLogo, withCompanyLogo } from "../logo";
import { IMAGE_SIZES } from "../types";

test("every poster size preserves the artwork and adds a visible logo outside it", async () => {
  for (const size of IMAGE_SIZES) {
    const [width, height] = size.split("x").map(Number);
    // A colored frame catches cropping or branding stamped over the artwork.
    const source = Buffer.from(`<svg width="${width}" height="${height}"><rect width="100%" height="100%" fill="#ff0000"/><rect x="20" y="20" width="${width - 40}" height="${height - 40}" fill="#00ff00"/></svg>`);
    const result = await addCompanyLogo(await sharp(source).png().toBuffer(), size);
    const { data, info } = await sharp(result).removeAlpha().raw().toBuffer({ resolveWithObject: true });
    assert.equal(info.width, width);
    assert.equal(info.height, height);
    const pixel = (x: number, y: number) => [...data.subarray((y * width + x) * 3, (y * width + x) * 3 + 3)];
    assert.deepEqual(pixel(Math.floor(width / 2), 2), [255, 0, 0], "top frame is intact");
    assert.deepEqual(pixel(Math.floor(width / 2), Math.floor(height / 2)), [0, 255, 0], "artwork is unobscured");
    // Original logo has dark gray pixels; artwork contains red/green, so these
    // pixels in the footer prove that branding was actually rendered.
    let logoPixels = 0;
    for (let y = Math.floor(height - width * 0.17); y < height; y++) {
      for (let x = Math.floor(width * 0.35); x < width * 0.65; x++) {
        const [r, g, b] = pixel(x, y);
        if (r < 180 && Math.abs(r - g) < 10 && Math.abs(g - b) < 10) logoPixels++;
      }
    }
    assert.ok(logoPixels > 300, `${size} includes a visible company logo`);
    assert.deepEqual(pixel(2, height - 2), [255, 255, 255], "footer has a solid contrast background");
  }
});


test("branding supplies the real transparent logo last without changing photo order", async () => {
  const portrait = Buffer.from("portrait");
  const property = Buffer.from("property");
  for (const refs of [[], [portrait, property]]) {
    const result = await withCompanyLogo("Existing saved prompt", refs);
    assert.deepEqual(result.references.slice(0, -1), refs);
    assert.equal(refs.length, result.references.length - 1);
    const logo = await sharp(result.references.at(-1)!).metadata();
    assert.equal(logo.format, "png");
    assert.equal(logo.hasAlpha, true);
    assert.match(result.prompt, /MUST appear exactly once INSIDE/);
    assert.match(result.prompt, /no branding will be added after generation/);
  }
});
