import type { Metadata } from "next";
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
      >
        <PosthogProvider>{children}</PosthogProvider>
      </body>
    </html>
  );
}
