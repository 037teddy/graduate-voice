import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Dev only: let the app be opened via this computer's network address
  // (e.g. from a phone on the same Wi-Fi) without blocking live reload and fonts.
  allowedDevOrigins: ["172.30.64.1"],
  cacheComponents: true,
  partialPrefetching: true,
  turbopack: {
    // Keep Next.js from picking up unrelated lockfiles higher up in C:\xampp\htdocs
    root: __dirname,
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
