import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { PosthogProvider } from "@/components/providers/posthog-provider";
import "./globals.css";

const inter = Inter({ subsets: ["latin"] });

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
      <body className={`${inter.className} min-h-screen bg-white antialiased`}>
        <PosthogProvider>{children}</PosthogProvider>
      </body>
    </html>
  );
}
