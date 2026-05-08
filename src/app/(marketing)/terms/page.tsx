import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Terms of Service | Fitwell Buckle Co.",
};

export default function TermsPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-16 sm:px-6 lg:px-8">
      <h1 className="text-3xl font-bold">Terms of Service</h1>
      <p className="mt-4 text-zinc-600">
        These terms of service govern your use of the Fitwell Buckle Co. website
        and services.
      </p>
      <p className="mt-4 text-sm text-zinc-400">Last updated: May 2026</p>
    </div>
  );
}
