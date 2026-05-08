import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Privacy Policy | Fitwell Buckle Co.",
};

export default function PrivacyPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-16 sm:px-6 lg:px-8">
      <h1 className="text-3xl font-bold">Privacy Policy</h1>
      <p className="mt-4 text-zinc-600">
        This privacy policy describes how Fitwell Buckle Co. collects, uses, and
        protects your information.
      </p>
      <p className="mt-4 text-sm text-zinc-400">Last updated: May 2026</p>
    </div>
  );
}
