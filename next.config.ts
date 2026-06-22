import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  outputFileTracingIncludes: {
    "/api/invoices/*/send": ["src/assets/homix-living-inc-w9.pdf"],
  },
};

export default nextConfig;
