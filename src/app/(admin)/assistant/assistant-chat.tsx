"use client";

import { useState, useRef, useEffect } from "react";
import { cn } from "@/lib/utils";
import { ChartView, type ChartSpec } from "./chart-view";

interface Step {
  tool: string;
  input: unknown;
  ok: boolean;
  error?: string;
  sql?: string;
  columns?: string[];
  rows?: Record<string, unknown>[];
  rowCount?: number;
  truncated?: boolean;
  chart?: ChartSpec;
}

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  steps?: Step[] | null;
  stoppedAtStepLimit?: boolean;
}

type ModelKey = "sonnet" | "opus";

const EXAMPLES = [
  "What was our D2C contribution margin (incl. shipping) last month?",
  "What was our total sales for April, excluding samples?",
  "Which 5 products sold the most units last month?",
  "How many people visited but didn't buy in the last 90 days?",
  "Where are we in the most recent M1 production order?",
];

export function AssistantChat({
  conversationId,
  onConversationCreated,
  onTurnComplete,
}: {
  conversationId: string | null;
  onConversationCreated: (id: string) => void;
  onTurnComplete: () => void;
}) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [currentId, setCurrentId] = useState<string | null>(conversationId);
  const [input, setInput] = useState("");
  const [model, setModel] = useState<ModelKey>("sonnet");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  // Load a different conversation when the selection changes (but not when the
  // change is just our own newly-created id, which we already hold in state).
  useEffect(() => {
    if (conversationId === currentId) return;
    setCurrentId(conversationId);
    setError(null);
    if (!conversationId) {
      setMessages([]);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(
          `/api/admin/assistant/conversations/${conversationId}`,
        );
        const json = await res.json();
        if (!cancelled && res.ok) {
          setMessages(
            json.data.messages.map((m: ChatMessage) => ({
              role: m.role,
              content: m.content,
              steps: m.steps ?? undefined,
              stoppedAtStepLimit: m.stoppedAtStepLimit,
            })),
          );
        }
      } catch {
        if (!cancelled) setError("Couldn't load that conversation.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [conversationId, currentId]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  async function send(question: string) {
    const q = question.trim();
    if (!q || loading) return;
    setError(null);
    setInput("");
    setMessages((prev) => [...prev, { role: "user", content: q }]);
    setLoading(true);

    try {
      const res = await fetch("/api/admin/assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversationId: currentId, message: q, model }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error ?? "Request failed");

      const newId: string = json.data.conversationId;
      const wasNew = currentId === null;
      setCurrentId(newId);
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: json.data.answer,
          steps: json.data.steps,
          stoppedAtStepLimit: json.data.stoppedAtStepLimit,
        },
      ]);
      if (wasNew) onConversationCreated(newId);
      onTurnComplete();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Model toggle */}
      <div className="flex items-center gap-2 text-sm">
        <span className="text-gray-500">Model:</span>
        {(["sonnet", "opus"] as ModelKey[]).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => setModel(m)}
            className={cn(
              "rounded-full border px-3 py-1 capitalize transition",
              model === m
                ? "border-gray-900 bg-gray-900 text-white"
                : "border-gray-300 bg-white text-gray-600 hover:border-gray-400",
            )}
          >
            {m}
          </button>
        ))}
        <span className="text-xs text-gray-400">
          {model === "sonnet"
            ? "fast & cheap — good default"
            : "slower, deeper reasoning"}
        </span>
      </div>

      {/* Conversation */}
      <div className="min-h-[200px] space-y-4">
        {messages.length === 0 && !loading && (
          <div className="rounded-lg border border-dashed border-gray-200 p-4">
            <p className="text-sm font-medium text-gray-700">Try asking:</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {EXAMPLES.map((ex) => (
                <button
                  key={ex}
                  type="button"
                  onClick={() => send(ex)}
                  className="rounded-full border border-gray-200 bg-white px-3 py-1 text-sm text-gray-600 hover:border-gray-400"
                >
                  {ex}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((m, i) => (
          <MessageBubble key={i} message={m} />
        ))}

        {loading && <div className="text-sm text-gray-400">Thinking…</div>}
        {error && (
          <div className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </div>
        )}
        <div ref={endRef} />
      </div>

      {/* Input */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          send(input);
        }}
        className="flex items-end gap-2"
      >
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              send(input);
            }
          }}
          rows={2}
          placeholder="Ask about orders, customers, production, margin…"
          className="flex-1 resize-none rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-gray-900 focus:outline-none"
        />
        <button
          type="submit"
          disabled={loading || !input.trim()}
          className="rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-40"
        >
          Ask
        </button>
      </form>
    </div>
  );
}

function MessageBubble({ message }: { message: ChatMessage }) {
  if (message.role === "user") {
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%] rounded-lg bg-gray-900 px-4 py-2 text-sm text-white">
          {message.content}
        </div>
      </div>
    );
  }

  const charts = (message.steps ?? []).filter(
    (s): s is Step & { chart: ChartSpec } => !!s.chart,
  );

  return (
    <div className="flex flex-col gap-2">
      <div className="max-w-[95%] whitespace-pre-wrap rounded-lg bg-gray-100 px-4 py-3 text-sm text-gray-900">
        {message.content || "(no answer)"}
      </div>
      {charts.map((s, i) => (
        <ChartView key={i} spec={s.chart} />
      ))}
      {message.stoppedAtStepLimit && (
        <p className="text-xs text-amber-600">
          Stopped at the query limit — answer may be partial.
        </p>
      )}
      {message.steps && message.steps.length > 0 && (
        <QueriesPanel steps={message.steps} />
      )}
    </div>
  );
}

function QueriesPanel({ steps }: { steps: Step[] }) {
  // render_chart is shown as an actual chart in the answer, not as a "work" step.
  const shown = steps.filter((s) => s.tool !== "render_chart");
  const queries = shown.filter(
    (s) => s.tool === "query_database" || s.tool === "query_posthog",
  );
  if (shown.length === 0) return null;
  return (
    <details className="rounded-lg border border-gray-200 bg-white">
      <summary className="cursor-pointer select-none px-3 py-2 text-xs font-medium text-gray-600">
        Show work — {shown.length} step{shown.length === 1 ? "" : "s"}
        {queries.length > 0 && ` (${queries.length} quer${queries.length === 1 ? "y" : "ies"})`}
      </summary>
      <div className="space-y-3 border-t border-gray-100 px-3 py-3">
        {shown.map((s, i) => (
          <div key={i} className="text-xs">
            <div className="mb-1 flex items-center gap-2">
              <span className="rounded bg-gray-100 px-1.5 py-0.5 font-mono text-gray-700">
                {s.tool}
              </span>
              {!s.ok && <span className="text-red-600">error</span>}
            </div>
            {s.sql && (
              <pre className="overflow-x-auto rounded bg-gray-900 px-3 py-2 font-mono text-[11px] leading-relaxed text-gray-100">
                {s.sql}
              </pre>
            )}
            {s.error && <div className="mt-1 text-red-600">{s.error}</div>}
            {s.rows && s.rows.length > 0 && (
              <RowsTable columns={s.columns ?? []} rows={s.rows} truncated={s.truncated} />
            )}
            {s.rows && s.rows.length === 0 && s.ok && (
              <div className="mt-1 text-gray-400">No rows.</div>
            )}
          </div>
        ))}
      </div>
    </details>
  );
}

function RowsTable({
  columns,
  rows,
  truncated,
}: {
  columns: string[];
  rows: Record<string, unknown>[];
  truncated?: boolean;
}) {
  const cols = columns.length > 0 ? columns : Object.keys(rows[0] ?? {});
  const shown = rows.slice(0, 20);
  return (
    <div className="mt-1 overflow-x-auto">
      <table className="w-full border-collapse text-[11px]">
        <thead>
          <tr>
            {cols.map((c) => (
              <th
                key={c}
                className="border-b border-gray-200 px-2 py-1 text-left font-medium text-gray-500"
              >
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {shown.map((r, i) => (
            <tr key={i}>
              {cols.map((c) => (
                <td key={c} className="border-b border-gray-100 px-2 py-1 text-gray-700">
                  {formatCell(r[c])}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {(rows.length > shown.length || truncated) && (
        <div className="mt-1 text-gray-400">
          Showing {shown.length} of {rows.length}
          {truncated ? "+ (capped)" : ""} rows.
        </div>
      )}
    </div>
  );
}

function formatCell(v: unknown): string {
  if (v === null || v === undefined) return "—";
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}
