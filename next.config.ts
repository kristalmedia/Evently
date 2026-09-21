import type { NextConfig } from "next";

// Set NEXT_BASE_PATH (and the matching NEXT_PUBLIC_BASE_PATH, see
// lib/api-path.ts) when this app is served under a sub-path, e.g.
// NEXT_BASE_PATH=/evently for https://apps.kristal.media/evently.
// Left unset, the app is served from "/" as before (local dev default).
const basePath = process.env.NEXT_BASE_PATH || undefined;

const nextConfig: NextConfig = {
  reactStrictMode: true,
  basePath,
  experimental: {
    optimizePackageImports: ["lucide-react"],
  },
};

export default nextConfig;
