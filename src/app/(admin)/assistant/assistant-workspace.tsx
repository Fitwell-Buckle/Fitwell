"use client";

import { useCallback, useEffect, useState } from "react";
import { Plus, Pencil, Trash2, Check, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { AssistantChat } from "./assistant-chat";

interface ConversationSummary {
  id: string;
  title: string | null;
  model: string | null;
  updatedAt: string | null;
}

export function AssistantWorkspace() {
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);

  const refreshList = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/assistant/conversations");
      const json = await res.json();
      if (res.ok) setConversations(json.data);
    } catch {
      /* non-fatal: the chat still works without the history list */
    }
  }, []);

  useEffect(() => {
    refreshList();
  }, [refreshList]);

  async function rename(id: string, title: string) {
    await fetch(`/api/admin/assistant/conversations/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title }),
    });
    refreshList();
  }

  async function remove(id: string) {
    await fetch(`/api/admin/assistant/conversations/${id}`, { method: "DELETE" });
    if (activeId === id) setActiveId(null);
    refreshList();
  }

  return (
    <div className="flex gap-6">
      {/* History */}
      <aside className="hidden w-64 shrink-0 md:block">
        <button
          type="button"
          onClick={() => setActiveId(null)}
          className="mb-3 flex w-full items-center gap-2 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:border-gray-400"
        >
          <Plus className="h-4 w-4" /> New chat
        </button>
        <div className="space-y-1">
          {conversations.length === 0 && (
            <p className="px-2 py-1 text-xs text-gray-400">No conversations yet.</p>
          )}
          {conversations.map((c) => (
            <ConversationRow
              key={c.id}
              conversation={c}
              active={c.id === activeId}
              onSelect={() => setActiveId(c.id)}
              onRename={(title) => rename(c.id, title)}
              onDelete={() => remove(c.id)}
            />
          ))}
        </div>
      </aside>

      {/* Chat */}
      <div className="min-w-0 flex-1">
        <AssistantChat
          conversationId={activeId}
          onConversationCreated={(id) => setActiveId(id)}
          onTurnComplete={refreshList}
        />
      </div>
    </div>
  );
}

function ConversationRow({
  conversation,
  active,
  onSelect,
  onRename,
  onDelete,
}: {
  conversation: ConversationSummary;
  active: boolean;
  onSelect: () => void;
  onRename: (title: string) => void;
  onDelete: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [draft, setDraft] = useState(conversation.title ?? "");

  if (editing) {
    return (
      <div className="flex items-center gap-1 px-1">
        <input
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && draft.trim()) {
              onRename(draft.trim());
              setEditing(false);
            }
            if (e.key === "Escape") setEditing(false);
          }}
          className="min-w-0 flex-1 rounded border border-gray-300 px-2 py-1 text-sm focus:border-gray-900 focus:outline-none"
        />
        <button
          type="button"
          onClick={() => {
            if (draft.trim()) onRename(draft.trim());
            setEditing(false);
          }}
          className="text-gray-500 hover:text-gray-900"
        >
          <Check className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={() => setEditing(false)}
          className="text-gray-500 hover:text-gray-900"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "group flex items-center gap-1 rounded-lg px-2 py-1.5 text-sm",
        active ? "bg-gray-900 text-white" : "text-gray-700 hover:bg-gray-100",
      )}
    >
      <button
        type="button"
        onClick={onSelect}
        className="min-w-0 flex-1 truncate text-left"
        title={conversation.title ?? "Untitled"}
      >
        {conversation.title ?? "Untitled"}
      </button>
      {confirmDelete ? (
        <span className="flex items-center gap-1">
          <button
            type="button"
            onClick={onDelete}
            className={cn(
              "text-xs",
              active ? "text-red-300" : "text-red-600",
            )}
          >
            Delete?
          </button>
          <button
            type="button"
            onClick={() => setConfirmDelete(false)}
            className={active ? "text-gray-300" : "text-gray-500"}
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </span>
      ) : (
        <span className="hidden items-center gap-1 group-hover:flex">
          <button
            type="button"
            onClick={() => {
              setDraft(conversation.title ?? "");
              setEditing(true);
            }}
            className={active ? "text-gray-300 hover:text-white" : "text-gray-400 hover:text-gray-700"}
          >
            <Pencil className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={() => setConfirmDelete(true)}
            className={active ? "text-gray-300 hover:text-white" : "text-gray-400 hover:text-gray-700"}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </span>
      )}
    </div>
  );
}
