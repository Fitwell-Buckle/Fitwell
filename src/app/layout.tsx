import type { Metadata, Viewport } from "next";
import { DM_Sans, DM_Mono } from "next/font/google";
import { PosthogProvider } from "@/components/providers/posthog-provider";
import "./globals.css";

const dmSans = DM_Sans({ subsets: ["latin"], variable: "--font-sans" });
const dmMono = DM_Mono({
  weight: ["400", "500"],
  subsets: ["latin"],
  variable: "--font-mono",
});

export const metadata: Metadata = {
  title: "Fitwell Buckle Co.",
  description:
    "Precision micro-adjust watch buckles engineered for the perfect fit. The Fitwell digital platform for analytics, attribution, and customer intelligence.",
  // Home-screen install (iOS): standalone chrome + status-bar style + icon.
  appleWebApp: {
    capable: true,
    title: "Fitwell Portal",
    statusBarStyle: "black-translucent",
  },
  icons: {
    icon: [
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180" }],
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // Let content extend under the iOS notch / home indicator in standalone mode.
  viewportFit: "cover",
  themeColor: "#18181b",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body
        className={`${dmSans.variable} ${dmMono.variable} min-h-screen bg-white font-sans antialiased`}
        // Browser extensions (Grammarly etc.) inject attributes on <body>
        // before React hydrates; suppress the resulting attribute-mismatch
        // warning for this element only — it doesn't affect the React tree.
        suppressHydrationWarning
      >
        <PosthogProvider>{children}</PosthogProvider>
      </body>
    </html>
  );
}
