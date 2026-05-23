"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

interface Comment {
  id: string;
  body: string;
  author: string;
  when: string;
}

export function PoComments({
  poId,
  comments,
}: {
  poId: string;
  comments: Comment[];
}) {
  const router = useRouter();
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function post() {
    const text = body.trim();
    if (!text) return;
    setError(null);
    setBusy(true);
    try {
      const res = await fetch(`/api/production/po/${poId}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: text }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error || "Failed to post comment.");
      } else {
        setBody("");
        router.refresh();
      }
    } catch {
      setError("Network error — please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="mt-5 p-6">
      <h2 className="text-sm font-semibold text-zinc-900">Comments</h2>

      <div className="mt-4 space-y-4">
        {comments.length === 0 ? (
          <p className="text-sm text-zinc-400">No comments yet.</p>
        ) : (
          comments.map((c) => (
            <div key={c.id} className="text-sm">
              <div className="flex items-baseline gap-2">
                <span className="font-medium text-zinc-900">{c.author}</span>
                <span className="text-xs text-zinc-400">{c.when}</span>
              </div>
              <p className="mt-0.5 whitespace-pre-wrap text-zinc-700">{c.body}</p>
            </div>
          ))
        )}
      </div>

      <div className="mt-4 border-t border-zinc-100 pt-4">
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={2}
          placeholder="Add a comment…"
          className="flex w-full rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-950 focus-visible:ring-offset-2"
        />
        {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
        <div className="mt-2 flex justify-end">
          <Button size="sm" onClick={post} disabled={busy || !body.trim()}>
            {busy ? "Posting…" : "Post"}
          </Button>
        </div>
      </div>
    </Card>
  );
}
