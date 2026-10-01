import path from "node:path";

import withBundleAnalyzer from "@next/bundle-analyzer";
import type { NextConfig } from "next";

import { getWebSecurityHeaders } from "./lib/security/web-security-headers";

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        headers: getWebSecurityHeaders(process.env.NODE_ENV === "production"),
        source: "/(.*)",
      },
    ];
  },
  output: "standalone",
  outputFileTracingRoot: path.join(import.meta.dirname, "../.."),
  poweredByHeader: false,
  transpilePackages: ["@tripforge/ui"],
};

export default withBundleAnalyzer({
  enabled: process.env.ANALYZE === "true",
  openAnalyzer: false,
})(nextConfig);
