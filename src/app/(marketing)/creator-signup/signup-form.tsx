"use client";

import { useState } from "react";
import { SIGNUP_PLATFORMS } from "@/lib/creators/signup";

const inputCls =
  "w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm outline-none placeholder:text-zinc-400 focus:border-zinc-500";

interface ProfileRow {
  platform: string;
  platformName: string; // only used when platform === "other"
  platformDomain: string; // only used when platform === "other"
  handle: string;
}

const emptyRow = (): ProfileRow => ({
  platform: "ig",
  platformName: "",
  platformDomain: "",
  handle: "",
});

export function SignupForm() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [notes, setNotes] = useState("");
  const [website, setWebsite] = useState(""); // honeypot
  const [profiles, setProfiles] = useState<ProfileRow[]>([emptyRow()]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  function updateProfile(i: number, patch: Partial<ProfileRow>) {
    setProfiles((prev) =>
      prev.map((p, idx) => (idx === i ? { ...p, ...patch } : p)),
    );
  }
  function addProfile() {
    setProfiles((prev) => [...prev, emptyRow()]);
  }
  function removeProfile(i: number) {
    setProfiles((prev) => prev.filter((_, idx) => idx !== i));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!name.trim()) return setError("Please enter your name.");
    const filled = profiles.filter((p) => p.handle.trim());
    if (filled.length === 0) {
      return setError("Add at least one social profile.");
    }
    if (
      filled.some(
        (p) =>
          p.platform === "other" &&
          (!p.platformName.trim() || !p.platformDomain.trim()),
      )
    ) {
      return setError(
        "For any “Other” profile, enter both the platform name and its domain.",
      );
    }
    if (email.trim() && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim())) {
      return setError("Enter a valid email or leave it blank.");
    }
    if (!email.trim() && !phone.trim()) {
      return setError("Enter an email or a phone / WhatsApp number so we can reach you.");
    }

    setBusy(true);
    try {
      const res = await fetch("/api/creator-signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          email: email.trim() || null,
          phone: phone.trim() || null,
          notes: notes.trim() || null,
          website, // honeypot
          profiles: filled.map((p) => ({
            platform: p.platform,
            platformName: p.platform === "other" ? p.platformName.trim() : null,
            platformDomain:
              p.platform === "other" ? p.platformDomain.trim() : null,
            handle: p.handle.trim(),
          })),
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(json.error ?? "Something went wrong — please try again.");
        return;
      }
      setDone(true);
    } catch {
      setError("Something went wrong — please try again.");
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-6">
        <h2 className="text-lg font-semibold text-emerald-900">
          Thanks — you&apos;re in.
        </h2>
        <p className="mt-2 text-sm text-emerald-800">
          We&apos;ve got your details. Our team reviews new creators and will
          reach out if there&apos;s a fit. No need to submit again.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-6">
      <div>
        <label className="block text-sm font-medium text-zinc-700">
          Name <span className="text-red-500">*</span>
        </label>
        <input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Your name"
          className={`${inputCls} mt-1`}
        />
      </div>

      <div>
        <div className="flex items-baseline justify-between">
          <label className="block text-sm font-medium text-zinc-700">
            How can we reach you? <span className="text-red-500">*</span>
          </label>
          <span className="text-xs text-zinc-400">Email or phone — at least one</span>
        </div>
        <div className="mt-1 grid gap-2 sm:grid-cols-2">
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            aria-label="Email"
            className={inputCls}
          />
          <input
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="Phone / WhatsApp"
            aria-label="Phone or WhatsApp"
            className={inputCls}
          />
        </div>
      </div>

      <div>
        <div className="flex items-center justify-between">
          <label className="block text-sm font-medium text-zinc-700">
            Social profiles <span className="text-red-500">*</span>
          </label>
          <span className="text-xs text-zinc-400">
            Add every channel you post on
          </span>
        </div>
        <div className="mt-2 space-y-2">
          {profiles.map((p, i) => (
            <div key={i} className="space-y-2">
              <div className="flex items-center gap-2">
                <select
                  value={p.platform}
                  onChange={(e) => updateProfile(i, { platform: e.target.value })}
                  className="rounded-lg border border-zinc-300 bg-white px-2 py-2 text-sm outline-none focus:border-zinc-500"
                >
                  {SIGNUP_PLATFORMS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
                <input
                  value={p.handle}
                  onChange={(e) => updateProfile(i, { handle: e.target.value })}
                  placeholder={
                    p.platform === "other"
                      ? "@handle or username"
                      : "@handle or profile URL"
                  }
                  className={inputCls}
                />
                {profiles.length > 1 && (
                  <button
                    type="button"
                    onClick={() => removeProfile(i)}
                    aria-label="Remove profile"
                    className="shrink-0 rounded-lg border border-zinc-200 px-2.5 py-2 text-sm text-zinc-500 hover:bg-zinc-50"
                  >
                    ✕
                  </button>
                )}
              </div>
              {p.platform === "other" && (
                <div className="flex items-center gap-2 pl-1">
                  <input
                    value={p.platformName}
                    onChange={(e) =>
                      updateProfile(i, { platformName: e.target.value })
                    }
                    placeholder="Platform name (e.g. Twitch)"
                    aria-label="Platform name"
                    className={inputCls}
                  />
                  <input
                    value={p.platformDomain}
                    onChange={(e) =>
                      updateProfile(i, { platformDomain: e.target.value })
                    }
                    placeholder="Domain (e.g. twitch.tv)"
                    aria-label="Platform domain"
                    className={inputCls}
                  />
                </div>
              )}
            </div>
          ))}
        </div>
        <button
          type="button"
          onClick={addProfile}
          className="mt-2 text-sm font-medium text-zinc-700 underline-offset-2 hover:underline"
        >
          + Add another profile
        </button>
      </div>

      <div>
        <label className="block text-sm font-medium text-zinc-700">
          Anything else? <span className="text-zinc-400">(optional)</span>
        </label>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={3}
          placeholder="What you make, audience, favourite watches…"
          className={`${inputCls} mt-1`}
        />
      </div>

      {/* Honeypot — hidden from real users, catches bots. */}
      <div aria-hidden className="hidden">
        <label>
          Website
          <input
            tabIndex={-1}
            autoComplete="off"
            value={website}
            onChange={(e) => setWebsite(e.target.value)}
          />
        </label>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <button
        type="submit"
        disabled={busy}
        className="rounded-lg bg-zinc-900 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-zinc-800 disabled:opacity-50"
      >
        {busy ? "Submitting…" : "Submit"}
      </button>
    </form>
  );
}
