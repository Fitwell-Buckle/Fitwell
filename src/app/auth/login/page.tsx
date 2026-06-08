"use client";

import Image from "next/image";
import { signIn } from "next-auth/react";
import { Button } from "@/components/ui/button";

export default function LoginPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-brand">
      <div className="w-full max-w-sm text-center">
        <Image
          src="/images/fitwell-logo.png"
          alt="Fitwell Buckle Co."
          width={200}
          height={48}
          // Brand wordmark is black on white; invert for this dark login bg.
          className="mx-auto invert"
          priority
        />
        <p className="mt-4 text-sm text-zinc-500">
          Sign in to access the admin dashboard
        </p>
        <Button
          className="mt-8 w-full bg-white text-zinc-900 hover:bg-zinc-100"
          onClick={() => signIn("google", { callbackUrl: "/dashboard" })}
        >
          Sign in with Google
        </Button>
      </div>
    </div>
  );
}
