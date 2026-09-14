import { cp, mkdir } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
const require = createRequire(import.meta.url);
const source = path.dirname(require.resolve("pdfjs-dist/package.json"));
const target = new URL("../public/signing-pdf/", import.meta.url);
await mkdir(target, { recursive: true });
await cp(
  path.join(source, "build/pdf.worker.min.mjs"),
  new URL("pdf.worker.min.mjs", target),
);
await cp(
  path.join(source, "build/pdf.min.mjs"),
  new URL("pdf.min.mjs", target),
);
for (const folder of ["cmaps", "standard_fonts", "wasm"])
  await cp(path.join(source, folder), new URL(folder, target), {
    recursive: true,
  });
