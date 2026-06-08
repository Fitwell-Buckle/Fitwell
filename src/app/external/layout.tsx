import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Sign in | Fitwell Buckle Co.",
};

/**
 * Shared shell for external sign-in pages (suppliers, B2B portal users, etc.).
 * Bare on purpose — no top bar, no nav. Just a centered card on a soft
 * background, so /external/login looks identical regardless of which role the
 * user is signing into. Once authenticated, NextAuth routes them to the right
 * portal via `callbackUrl`.
 */
export default function ExternalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen flex-col bg-[#fafafa]">
      <main className="mx-auto w-full max-w-5xl flex-1 px-6 py-8">{children}</main>
    </div>
  );
}
