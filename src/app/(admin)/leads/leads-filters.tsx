"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  LEAD_SOURCE_CHANNELS,
  LEAD_STAGES,
  LEAD_STATUSES,
} from "@/lib/crm/constants";
import {
  sourceChannelLabel,
  stageLabel,
} from "@/lib/crm/display";

const SELECT_CLS =
  "h-9 rounded-md border border-zinc-200 bg-white px-2 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-950";
const INPUT_CLS =
  "h-9 w-full max-w-xs rounded-md border border-zinc-200 bg-white px-3 text-sm placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-zinc-950";

export function LeadsFilters() {
  const router = useRouter();
  const params = useSearchParams();
  const [search, setSearch] = useState(params.get("search") ?? "");

  const update = useCallback(
    (key: string, value: string) => {
      const next = new URLSearchParams(params.toString());
      if (value) next.set(key, value);
      else next.delete(key);
      router.push(`/leads?${next.toString()}`);
    },
    [params, router],
  );

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        update("search", search.trim());
      }}
      className="mt-6 flex flex-wrap items-end gap-3"
    >
      <label className="flex flex-col gap-1 text-xs text-zinc-500">
        Stage
        <select
          className={SELECT_CLS}
          value={params.get("stage") ?? ""}
          onChange={(e) => update("stage", e.target.value)}
        >
          <option value="">All</option>
          {LEAD_STAGES.map((s) => (
            <option key={s} value={s}>
              {stageLabel(s)}
            </option>
          ))}
        </select>
      </label>

      <label className="flex flex-col gap-1 text-xs text-zinc-500">
        Source
        <select
          className={SELECT_CLS}
          value={params.get("sourceChannel") ?? ""}
          onChange={(e) => update("sourceChannel", e.target.value)}
        >
          <option value="">All</option>
          {LEAD_SOURCE_CHANNELS.map((s) => (
            <option key={s} value={s}>
              {sourceChannelLabel(s)}
            </option>
          ))}
        </select>
      </label>

      <label className="flex flex-col gap-1 text-xs text-zinc-500">
        Status
        <select
          className={SELECT_CLS}
          value={params.get("status") ?? ""}
          onChange={(e) => update("status", e.target.value)}
        >
          <option value="">Active</option>
          {LEAD_STATUSES.map((s) => (
            <option key={s} value={s}>
              {s.charAt(0).toUpperCase() + s.slice(1)}
            </option>
          ))}
        </select>
      </label>

      <label className="flex flex-1 flex-col gap-1 text-xs text-zinc-500">
        Search
        <input
          type="text"
          className={INPUT_CLS}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Name, company, or email…"
        />
      </label>

      <Button type="submit" size="sm">
        Search
      </Button>
    </form>
  );
}
