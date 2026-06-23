import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  outputFileTracingIncludes: {
    "/docs/*": ["./specs/**/*.md"],
  },
  // Permanent redirects for renamed routes. Search params (`callbackUrl`,
  // magic-link `token`s, etc.) carry across automatically.
  redirects: async () => [
    {
      // /supplier/login was the original supplier sign-in URL; renamed to
      // /external/login (Jun 2026). Keep this around for legacy bookmarks /
      // emailed links — drop once analytics show no traffic.
      source: "/supplier/login",
      destination: "/external/login",
      permanent: true,
    },
  ],
  headers: async () => [
    {
      source: "/(.*)",
      headers: [
        { key: "X-Frame-Options", value: "DENY" },
        { key: "X-Content-Type-Options", value: "nosniff" },
        { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        {
          key: "Strict-Transport-Security",
          value: "max-age=63072000; includeSubDomains; preload",
        },
        {
          key: "Content-Security-Policy",
          value: [
            "default-src 'self'",
            "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://us.i.posthog.com https://www.googletagmanager.com https://www.google-analytics.com",
            "style-src 'self' 'unsafe-inline'",
            "img-src 'self' data: blob: https:",
            "font-src 'self' data:",
            // `blob:` is needed by the public <model-viewer> 3D viewer: three.js
            // unpacks a GLB's embedded textures into blob: URLs and fetches them.
            // The Vercel Blob host serves the GLB files themselves.
            "connect-src 'self' blob: https://*.public.blob.vercel-storage.com https://us.i.posthog.com https://www.google-analytics.com https://analytics.google.com",
            // <model-viewer> / three.js may decode textures in blob: workers.
            "worker-src 'self' blob:",
            // Allow embedding Autodesk Fusion share viewers (prototype CAD
            // reference previews). Scoped to Autodesk hosts only.
            "frame-src 'self' https://*.autodesk360.com https://a360.co",
            "frame-ancestors 'none'",
          ].join("; "),
        },
      ],
    },
  ],
};

export default nextConfig;
