"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { Input } from "@/components/ui/input";

/** A contact surfaced by the Gmail search (`GET /api/gmail/search`). */
export interface GmailContactMatch {
  email: string;
  name: string | null;
  snippet: string;
}

const MIN_QUERY = 2;
const DEBOUNCE_MS = 250;

/**
 * The backend does a full-text Gmail search and harvests every From/To/Cc
 * address on each matching message — so searching "cindy" also returns
 * everyone else on a thread that merely mentions Cindy. For an email-field
 * typeahead that's noise: keep only contacts whose email or name actually
 * contains what was typed (every whitespace-separated token must match).
 */
function matchesTyped(m: GmailContactMatch, query: string): boolean {
  const hay = `${m.email} ${m.name ?? ""}`.toLowerCase();
  return query
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .every((token) => hay.includes(token));
}

/**
 * Email field with inline Gmail-contact typeahead. As the admin types, it
 * debounces a search against /api/gmail/search (the signed-in admin's own
 * Gmail — people they've emailed) and drops down matches right under the
 * field; picking one fills the email. No separate "search" button — the
 * lookup just happens as you type. Falls back to a plain controlled input if
 * Gmail isn't connected (the dropdown silently shows nothing on error).
 *
 * `onChange` receives the raw email string. Optional `onPickContact` fires
 * with the full match when a suggestion is chosen, so a parent can also fill
 * name fields if it wants.
 */
export function GmailEmailInput({
  id,
  value,
  onChange,
  onPickContact,
  onEnter,
  placeholder,
}: {
  id?: string;
  value: string;
  onChange: (email: string) => void;
  onPickContact?: (match: GmailContactMatch) => void;
  /**
   * Fired when Enter is pressed (and a parent provided this). Used by the
   * add-to-list flows (supplier/company logins) to commit on Enter. When
   * omitted, Enter falls through to default behavior (e.g. form submit), so
   * lead forms keep submitting on Enter.
   */
  onEnter?: () => void;
  placeholder?: string;
}) {
  const [matches, setMatches] = useState<GmailContactMatch[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);

  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Clean up the pending debounce + in-flight request when unmounting.
  useEffect(() => {
    return () => {
      if (timer.current) clearTimeout(timer.current);
      abortRef.current?.abort();
    };
  }, []);

  function scheduleSearch(raw: string) {
    if (timer.current) clearTimeout(timer.current);
    const q = raw.trim();
    if (q.length < MIN_QUERY) {
      abortRef.current?.abort();
      setMatches(null);
      setBusy(false);
      return;
    }
    setBusy(true);
    timer.current = setTimeout(() => void runSearch(q), DEBOUNCE_MS);
  }

  async function runSearch(q: string) {
    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;
    try {
      const res = await fetch(`/api/gmail/search?q=${encodeURIComponent(q)}`, {
        signal: ac.signal,
      });
      const d = (await res.json().catch(() => ({}))) as {
        data?: GmailContactMatch[];
        error?: string;
      };
      if (ac.signal.aborted) return;
      // On error (e.g. Gmail not connected) just show nothing — the field
      // still works as a normal email input. On success, narrow the harvested
      // contacts to ones that actually match what was typed.
      setMatches(
        res.ok ? (d.data ?? []).filter((m) => matchesTyped(m, q)) : [],
      );
    } catch (e) {
      if ((e as { name?: string })?.name === "AbortError") return;
      setMatches([]);
    } finally {
      if (!ac.signal.aborted) setBusy(false);
    }
  }

  function pick(m: GmailContactMatch) {
    onChange(m.email);
    onPickContact?.(m);
    setOpen(false);
    setMatches(null);
    if (timer.current) clearTimeout(timer.current);
    abortRef.current?.abort();
  }

  const showDropdown = open && (busy || (matches?.length ?? 0) > 0);

  return (
    <div className="relative">
      <Input
        id={id}
        type="email"
        autoComplete="off"
        placeholder={placeholder}
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          setOpen(true);
          scheduleSearch(e.target.value);
        }}
        onFocus={() => {
          if ((matches?.length ?? 0) > 0) setOpen(true);
        }}
        // Delay close so a click on a suggestion still registers.
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            setOpen(false);
            return;
          }
          if (e.key === "Enter" && onEnter) {
            e.preventDefault();
            setOpen(false);
            onEnter();
          }
        }}
      />
      {showDropdown && (
        <div className="absolute z-20 mt-1 max-h-60 w-full overflow-y-auto rounded-md border border-zinc-200 bg-white py-1 shadow-lg">
          {busy && (matches?.length ?? 0) === 0 ? (
            <div className="flex items-center gap-2 px-3 py-2 text-xs text-zinc-400">
              <Loader2 className="h-3 w-3 animate-spin" /> Searching your Gmail…
            </div>
          ) : (
            matches?.map((m) => (
              <button
                key={m.email}
                type="button"
                // mousedown fires before the input's blur, so prevent default
                // to keep focus and let the click pick the suggestion.
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => pick(m)}
                className="block w-full px-3 py-1.5 text-left text-sm hover:bg-zinc-50"
              >
                <span className="font-medium text-zinc-900">{m.email}</span>
                {m.name && <span className="ml-2 text-xs text-zinc-500">{m.name}</span>}
                {m.snippet && (
                  <div className="truncate text-xs text-zinc-400">{m.snippet}</div>
                )}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
