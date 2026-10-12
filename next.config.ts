import type { NextConfig } from "next";

/**
 * Two builds from one codebase:
 * - default: full server edition (API routes, SSE, server session runtime).
 * - STATIC_EXPORT=1: static demo edition for GitHub Pages. Route handlers are
 *   excluded (only .tsx files are routes), pages are prerendered, and the
 *   session runtime runs in the browser (NEXT_PUBLIC_STATIC_DEMO=1).
 */
const isStatic = process.env.STATIC_EXPORT === "1";
const basePath = process.env.NEXT_PUBLIC_BASE_PATH || undefined;

const nextConfig: NextConfig = isStatic
  ? {
      output: "export",
      basePath,
      trailingSlash: true,
      images: { unoptimized: true },
      pageExtensions: ["tsx"],
      env: { NEXT_PUBLIC_STATIC_DEMO: "1" },
    }
  : // STANDALONE=1 (Docker image): self-contained .next/standalone/server.js.
    process.env.STANDALONE === "1"
    ? { output: "standalone" }
    : {};

export default nextConfig;
