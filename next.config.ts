import type { NextConfig } from "next";

/**
 * Response headers applied to every route.
 *
 * The content security policy is the interesting one. It cannot be tightened to
 * `script-src 'self'` because the App Router inlines its own bootstrap and
 * hydration scripts, and giving each response a per-request nonce means moving
 * every rendered page behind one, which is a larger change than it looks. What
 * the policy still buys is the part that matters for injection: no inline or
 * remote script may introduce markup of its own, and object/embed is off
 * entirely.
 *
 * `frame-src` is the embed allowlist, and it is short on purpose: videos are
 * only ever rewritten to youtube-nocookie.com or player.vimeo.com by
 * lib/video-url.ts, and nothing else may frame.
 */
const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), interest-cohort=()" },
  {
    key: "Content-Security-Policy",
    value: [
      "default-src 'self'",
      // 'unsafe-inline' is required by the App Router's own scripts, and
      // 'unsafe-inline' for styles by the inline style props used throughout the
      // themed UI. Remote script and style hosts are still refused.
      "script-src 'self' 'unsafe-inline'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: https:",
      "font-src 'self' data:",
      "connect-src 'self'",
      "frame-src https://www.youtube-nocookie.com https://player.vimeo.com",
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      "frame-ancestors 'self'",
    ].join("; "),
  },
];

const nextConfig: NextConfig = {
  output: "standalone",
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: securityHeaders,
      },
    ];
  },
};

export default nextConfig;