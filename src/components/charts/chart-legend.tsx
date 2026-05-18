"use client";

import { useCallback, useState } from "react";

export interface LegendItem {
  key: string;
  label: string;
  color: string;
  dashed?: boolean;
}

export function useLegendToggle(keys: string[], defaultHidden: string[] = []) {
  const [hidden, setHidden] = useState<Set<string>>(new Set(defaultHidden));

  const toggle = useCallback(
    (key: string) => {
      setHidden((prev) => {
        const next = new Set(prev);
        if (next.has(key)) {
          next.delete(key);
        } else {
          next.add(key);
        }
        return next;
      });
    },
    [],
  );

  const isolate = useCallback(
    (key: string) => {
      setHidden((prev) => {
        const allOthersHidden = keys
          .filter((k) => k !== key)
          .every((k) => prev.has(k));
        if (allOthersHidden) {
          return new Set();
        }
        return new Set(keys.filter((k) => k !== key));
      });
    },
    [keys],
  );

  const isHidden = useCallback((key: string) => hidden.has(key), [hidden]);

  return { isHidden, toggle, isolate };
}

export function ChartLegend({
  items,
  isHidden,
  onToggle,
  onIsolate,
}: {
  items: LegendItem[];
  isHidden: (key: string) => boolean;
  onToggle: (key: string) => void;
  onIsolate: (key: string) => void;
}) {
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1 px-1 pb-2">
      {items.map((item) => {
        const hidden = isHidden(item.key);
        return (
          <button
            key={item.key}
            className={`flex cursor-pointer items-center gap-1.5 text-[11px] transition-opacity ${
              hidden ? "opacity-30" : "opacity-100"
            }`}
            onClick={() => onToggle(item.key)}
            onDoubleClick={() => onIsolate(item.key)}
            title="Click to toggle, double-click to isolate"
          >
            {item.dashed ? (
              <svg width="12" height="2" className="shrink-0">
                <line
                  x1="0"
                  y1="1"
                  x2="12"
                  y2="1"
                  stroke={item.color}
                  strokeWidth="2"
                  strokeDasharray="3 2"
                />
              </svg>
            ) : (
              <span
                className="h-2 w-2 shrink-0 rounded-full"
                style={{ backgroundColor: item.color }}
              />
            )}
            <span className="text-zinc-600">{item.label}</span>
          </button>
        );
      })}
    </div>
  );
}
