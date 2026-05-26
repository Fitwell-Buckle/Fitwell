"use client";

import { useState } from "react";
import Image from "next/image";
import { signIn } from "next-auth/react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export default function PortalLoginPage() {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const addr = email.trim().toLowerCase();
    if (!addr) return;
    setBusy(true);
    setError(null);
    try {
      const res = await signIn("email", {
        email: addr,
        redirect: false,
        callbackUrl: "/portal",
      });
      if (res?.error) {
        setError(
          "We couldn't send a sign-in link to that address. Make sure it's the email Fitwell set up for your brand, or get in touch.",
        );
      } else {
        setSent(true);
      }
    } catch {
      setError("Something went wrong — please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-[70vh] items-center justify-center">
      <div className="w-full max-w-sm">
        <Image
          src="/images/fitwell-logo.png"
          alt="Fitwell Buckle Co."
          width={180}
          height={43}
          // White wordmark asset → render black on this light background.
          className="mx-auto brightness-0"
          priority
        />
        <Card className="mt-8 p-6">
          {sent ? (
            <div className="text-center">
              <h1 className="text-sm font-semibold text-zinc-900">Check your email</h1>
              <p className="mt-2 text-sm text-zinc-500">
                We sent a sign-in link to{" "}
                <span className="font-medium text-zinc-700">{email.trim().toLowerCase()}</span>.
                It expires in 1 hour.
              </p>
              <button
                onClick={() => {
                  setSent(false);
                  setEmail("");
                }}
                className="mt-4 text-sm text-zinc-500 underline underline-offset-2 hover:text-zinc-900"
              >
                Use a different email
              </button>
            </div>
          ) : (
            <form onSubmit={submit}>
              <h1 className="text-sm font-semibold text-zinc-900">Customer sign in</h1>
              <p className="mt-1 text-xs text-zinc-500">
                Order Fitwell buckles at your brand&apos;s pricing. Enter your work
                email and we&apos;ll send a one-time sign-in link.
              </p>
              <Input
                type="email"
                placeholder="you@company.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="mt-4"
                autoFocus
                required
              />
              {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
              <Button type="submit" className="mt-4 w-full" disabled={busy || !email.trim()}>
                {busy ? "Sending…" : "Email me a sign-in link"}
              </Button>
            </form>
          )}
        </Card>
      </div>
    </div>
  );
}
