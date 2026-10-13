import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  turbopack: {
    resolveAlias: {
      // X Chat SDK includes Node-only WASM loaders behind runtime checks.
      // In browser builds those branches must never be called.
      fs: { browser: "./src/lib/xchat/empty-node-module.ts" },
      module: { browser: "./src/lib/xchat/empty-node-module.ts" },
    },
  },
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
