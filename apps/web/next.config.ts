import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  // NOT using output: 'standalone' — as of Next 16.2.9 its Turbopack build
  // has an open upstream regression that drops third-party deps from
  // .next/standalone/node_modules entirely (vercel/next.js#88844), and even
  // with the webpack fallback, pdfjs-dist's optional @napi-rs/canvas
  // dependency (needed at runtime, required from inside a try/catch the
  // tracer can't see through) still doesn't get traced. Docker instead
  // ships the full node_modules tree and runs `next start` — see
  // apps/web/Dockerfile.
  //
  // Monorepo root — still needed so Next resolves pnpm's symlinked
  // node_modules (which point up into the workspace root's .pnpm store)
  // from the correct base, and doesn't warn about an inferred wrong root.
  outputFileTracingRoot: path.join(__dirname, '../../'),
  // pdf-parse is ESM-only ("type": "module") and can't be bundled into the
  // CJS server output, so it's always left as a real require() regardless
  // of standalone mode — being explicit here matches that reality.
  serverExternalPackages: ['pdf-parse'],
};

export default nextConfig;
