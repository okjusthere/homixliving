import type { NextConfig } from "next";
import { fileURLToPath } from "node:url";

const isDevelopment = process.env.NODE_ENV === "development";

const contentSecurityPolicy = [
  "default-src 'self'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "object-src 'none'",
  `script-src 'self' 'unsafe-inline'${isDevelopment ? " 'unsafe-eval'" : ""} https://tally.so https://va.vercel-scripts.com`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https://www.homixny.com https://*.supabase.co https://onekey.kevv.ai https://onekeymls.kevv.ai https://*.cloudflarestream.com https://*.videodelivery.net",
  "font-src 'self' data:",
  `connect-src 'self' https://*.r2.cloudflarestorage.com https://tally.so https://vitals.vercel-insights.com${isDevelopment ? " ws: http: https:" : ""}`,
  "frame-src https://tally.so https://cloud.fastgpt.io https://iframe.videodelivery.net https://*.cloudflarestream.com",
  "media-src 'self' blob: https://*.cloudflarestream.com https://*.videodelivery.net",
  "worker-src 'self' blob:",
  "manifest-src 'self'",
  ...(isDevelopment ? [] : ["upgrade-insecure-requests"]),
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: contentSecurityPolicy },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin-allow-popups" },
  {
    key: "Permissions-Policy",
    value:
      'camera=(), microphone=(self "https://cloud.fastgpt.io"), geolocation=(), payment=(), usb=(), browsing-topics=()',
  },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Permitted-Cross-Domain-Policies", value: "none" },
];

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
    remotePatterns: [new URL("https://www.homixny.com/homix-mark-small.webp")],
  },
  outputFileTracingIncludes: {
    "/api/invoices/*/send": ["src/assets/homix-living-inc-w9.pdf"],
  },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
