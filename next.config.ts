import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [new URL("https://www.homixny.com/homix-mark.webp")],
  },
  outputFileTracingIncludes: {
    "/api/invoices/*/send": ["src/assets/homix-living-inc-w9.pdf"],
  },
};

export default nextConfig;
