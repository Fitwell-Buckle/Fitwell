import type { MetadataRoute } from "next";

// Web app manifest (served at /manifest.webmanifest) that makes the admin
// portal installable as a home-screen app. Required for iOS Web Push, which
// only works once the PWA is added to the home screen.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Fitwell Admin",
    short_name: "Fitwell",
    description:
      "Fitwell Buckle Co. ops portal — orders, leads, production, analytics.",
    // Land on the dashboard; unauthenticated installs redirect to login.
    start_url: "/dashboard",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#ffffff",
    theme_color: "#18181b",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      {
        src: "/icon-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
