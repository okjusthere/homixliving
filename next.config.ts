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
    // Vercel's image optimizer is a metered resource, and this project had
    // exhausted its transformation quota: /_next/image started returning
    // 402 OPTIMIZED_IMAGE_REQUEST_PAYMENT_REQUIRED for any variant not already
    // cached. Desktops kept working (their widths were cached from earlier
    // visits) while phones — which request narrower variants — got broken
    // images on /onboarding. Serving the files directly is free and unmetered;
    // they are pre-sized to their rendered dimensions by
    // scripts/optimize-public-images.mjs. Matches the marketing site, which
    // already sets this for the same reason.
    unoptimized: true,
    remotePatterns: [new URL("https://www.homixny.com/homix-mark.webp")],
  },
  outputFileTracingIncludes: {
    "/api/invoices/*/send": ["src/assets/homix-living-inc-w9.pdf"],
  },
};

export default nextConfig;
