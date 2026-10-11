import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async redirects() {
    return [{ source: "/omnibox.html", destination: "/", permanent: true }];
  },
  async rewrites() {
    return {
      beforeFiles: [{ source: "/", destination: "/omnibox.html" }],
      afterFiles: [],
      fallback: [],
    };
  },
};

export default nextConfig;
