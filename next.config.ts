import type { NextConfig } from "next";
import { fileURLToPath } from "node:url";

const nextConfig: NextConfig = {
  // Pin the workspace root to this project. Turbopack otherwise infers it by
  // walking up for lockfiles, and any stray package-lock.json in a parent
  // directory (e.g. the home folder) silently wins — which resolves
  // instrumentation.ts against the wrong root and crashes `next dev` with
  // "Could not parse module … file not found".
  turbopack: {
    root: fileURLToPath(new URL(".", import.meta.url)),
  },
  images: {
    remotePatterns: [new URL("https://www.homixny.com/homix-mark.webp")],
  },
  outputFileTracingIncludes: {
    "/api/invoices/*/send": ["src/assets/homix-living-inc-w9.pdf"],
  },
};

export default nextConfig;
