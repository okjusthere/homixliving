/**
 * Shrink the static images in public/ to the sizes the UI actually renders.
 *
 * Why: `next/image` used to resize these on the fly, but Vercel's image
 * optimizer is a metered resource — once the plan's transformation quota was
 * exhausted it started returning 402 for any variant it hadn't already cached,
 * which is what broke avatars on phones (phones request narrower variants than
 * desktops, so they were the ones missing from the cache). The portal now
 * serves these as plain static files (`images.unoptimized`), which is free and
 * unmetered — but that only works if the files themselves are reasonably sized.
 *
 * Filenames and formats are preserved so no code references change. Originals
 * are in git, so `git checkout -- public` restores them.
 *
 * Caps are the rendered CSS size x2 for retina, rounded up:
 *   founder portraits render at most 260px wide  -> 900px long edge
 *   member thumbs render at 64px                 -> covered by the same cap
 *   channel QR codes render at 210px             -> 600px
 *   self-branding art renders at ~450px          -> 1200px
 *   the team banner renders up to 1320px wide    -> 1600px
 *
 * Run: node scripts/optimize-public-images.mjs
 */
import sharp from "sharp";
import fs from "node:fs";
import path from "node:path";

const RULES = [
  { dir: "public/onboarding", match: /^homix-social-media-team\./, cap: 1600 },
  { dir: "public/onboarding", match: /^homix-.*-qr/, cap: 600 },
  { dir: "public/onboarding", match: /^self-branding-/, cap: 1200 },
  { dir: "public/onboarding", match: /.*/, cap: 900 },
  { dir: "public/training", match: /.*/, cap: 1000 },
  { dir: "public/auth", match: /.*/, cap: 1200 },
  { dir: "public/icons", match: /.*/, cap: 512 },
];

function capFor(dir, file) {
  const rule = RULES.find((r) => r.dir === dir && r.match.test(file));
  return rule ? rule.cap : 1200;
}

let beforeTotal = 0;
let afterTotal = 0;
const rows = [];

for (const dir of [...new Set(RULES.map((r) => r.dir))]) {
  if (!fs.existsSync(dir)) continue;
  for (const file of fs.readdirSync(dir).sort()) {
    if (!/\.(jpe?g|png)$/i.test(file)) continue;
    const p = path.join(dir, file);
    const before = fs.statSync(p).size;
    const meta = await sharp(p).metadata();
    const cap = capFor(dir, file);
    const isPng = /\.png$/i.test(file);

    let pipeline = sharp(p).rotate(); // honour EXIF orientation
    if (Math.max(meta.width, meta.height) > cap) {
      pipeline = pipeline.resize({
        width: cap,
        height: cap,
        fit: "inside",
        withoutEnlargement: true,
      });
    }
    pipeline = isPng
      ? pipeline.png({ compressionLevel: 9, palette: true })
      : pipeline.jpeg({ quality: 82, mozjpeg: true, progressive: true });

    const buf = await pipeline.toBuffer();
    // Never write a bigger file than we started with.
    if (buf.length < before) fs.writeFileSync(p, buf);

    const after = fs.statSync(p).size;
    const out = await sharp(p).metadata();
    beforeTotal += before;
    afterTotal += after;
    rows.push({
      file: `${dir.replace("public/", "")}/${file}`,
      before: Math.round(before / 1024),
      after: Math.round(after / 1024),
      dims: `${meta.width}x${meta.height} -> ${out.width}x${out.height}`,
    });
  }
}

for (const r of rows) {
  const saved = r.before > 0 ? Math.round((1 - r.after / r.before) * 100) : 0;
  console.log(
    `${String(r.before).padStart(4)}KB -> ${String(r.after).padStart(4)}KB  (-${String(saved).padStart(2)}%)  ${r.dims.padEnd(24)} ${r.file}`,
  );
}
console.log(
  `\nTOTAL ${Math.round(beforeTotal / 1024)}KB -> ${Math.round(afterTotal / 1024)}KB ` +
    `(-${Math.round((1 - afterTotal / beforeTotal) * 100)}%)`,
);
