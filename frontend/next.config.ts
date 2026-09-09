import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // @prepkit/shared is consumed as raw TS source from the workspace (no build
  // step for it), so Next needs to transpile it itself rather than treating it
  // as a pre-built dependency.
  transpilePackages: ["@prepkit/shared"],
};

export default nextConfig;
