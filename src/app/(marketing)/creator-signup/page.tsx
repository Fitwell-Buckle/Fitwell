import type { Metadata } from "next";
import { SignupForm } from "./signup-form";

export const metadata: Metadata = {
  title: "Join the Fitwell creator program | Fitwell Buckle Co.",
  description:
    "Tell us about you and your channels — we'll be in touch about gifting and collaborations.",
};

export default function CreatorSignupPage() {
  return (
    <div className="mx-auto max-w-2xl px-4 py-16 sm:px-6 lg:px-8">
      <h1 className="text-3xl font-bold tracking-tight">
        Join the Fitwell creator program
      </h1>
      <p className="mt-3 text-zinc-600">
        We work with watch and EDC creators on gifting and collaborations. Drop
        your details and the social channels you post on — no need to do this
        more than once. We&apos;ll review and reach out.
      </p>
      <div className="mt-8">
        <SignupForm />
      </div>
    </div>
  );
}
