import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // A package-lock.json in the home directory confuses root detection.
  turbopack: { root: path.resolve(__dirname) },
  // Native / heavy Node packages must not be bundled by Next.
  serverExternalPackages: ["better-sqlite3", "sharp", "@remotion/bundler", "@remotion/renderer"],
};

export default nextConfig;
