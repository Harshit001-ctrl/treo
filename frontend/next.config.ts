import type { NextConfig } from "next";

const BACKEND_ORIGIN = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

const nextConfig: NextConfig = {
  transpilePackages: ["@prepkit/shared"],
  // Don't auto-generate AGENTS.md/CLAUDE.md files on every build.
  agentRules: false,

  // Proxy /api/* through the frontend's own origin instead of the browser
  // calling the Render backend cross-site directly. The session cookie only
  // works at all if the browser treats it as first-party — modern browsers
  // block or drop SameSite=None cookies for genuinely cross-site fetches
  // (frontend on vercel.app, backend on onrender.com are different sites).
  // With this rewrite the browser only ever talks to its own origin; Vercel
  // forwards to the real backend server-side, so the Set-Cookie response is
  // seen by the browser as first-party.
  async rewrites() {
    return [{ source: "/api/:path*", destination: `${BACKEND_ORIGIN}/api/:path*` }];
  },
};

export default nextConfig;
