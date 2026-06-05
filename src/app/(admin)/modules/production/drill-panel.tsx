"use client";

import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";

/**
 * sessionStorage key written by each clickable row/card/track just before it
 * calls router.push(). The DrillPanel reads this on mount to know where the
 * user clicked and animates from that Y origin — so the panel appears to expand
 * out of the row they tapped, like a directional reveal.
 *
 * Value: the absolute Y of the clicked element's top, in page coordinates
 * (`element.getBoundingClientRect().top + window.scrollY`).
 */
export const DRILL_ORIGIN_KEY = "drillOriginY";

/**
 * Animated wrapper for the per-PO drill-down panel. On mount it reads the
 * stored click position and plays a directional entrance animation: the panel
 * slides UP from where the clicked row was and blurs in, so it's visually clear
 * the content is "expanding out" of that row. Similar to the macOS genie effect
 * but without the twist — purely a directional translate + blur reveal.
 *
 * Mount with key={selectedPoNumber} so clicking a different PO re-triggers the
 * animation.
 */
export function DrillPanel({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    // Read and immediately clear the stored click origin.
    const stored = sessionStorage.getItem(DRILL_ORIGIN_KEY);
    sessionStorage.removeItem(DRILL_ORIGIN_KEY);

    // Calculate the translateY start: distance from the clicked row to this
    // panel's top edge (page-absolute). The panel slides up from there.
    let originY = 48; // fallback when no stored position
    if (stored) {
      const rect = el.getBoundingClientRect();
      const panelAbsTop = rect.top + window.scrollY;
      const clickAbsY = parseFloat(stored);
      // Clamp: at least 16px of travel (even if click was very close to the
      // panel top), at most 500px so very far-down clicks don't look odd.
      originY = Math.min(Math.max(16, clickAbsY - panelAbsTop), 500);
    }

    // 1. Imperatively set the INITIAL hidden state (no React re-render needed).
    el.style.opacity = "0";
    el.style.transform = `translateY(${originY}px) scale(0.93)`;
    el.style.filter = "blur(10px)";
    el.style.willChange = "opacity, transform, filter";

    // 2. Let the browser paint the initial state, then wire up the transition
    //    and flip to the final values in the following frame.
    let r1: number, r2: number;
    r1 = requestAnimationFrame(() => {
      el.style.transitionProperty = "opacity, transform, filter";
      el.style.transitionDuration = "520ms";
      el.style.transitionTimingFunction = "cubic-bezier(0.16, 1, 0.3, 1)";

      r2 = requestAnimationFrame(() => {
        el.style.opacity = "1";
        el.style.transform = "translateY(0px) scale(1)";
        el.style.filter = "blur(0px)";
      });
    });

    return () => {
      cancelAnimationFrame(r1);
      cancelAnimationFrame(r2!);
    };
  }, []);

  return (
    // opacity-0 keeps the element invisible until useEffect fires (prevents a
    // flash of the un-animated content on SSR/hydration).
    <div ref={ref} className={cn("opacity-0", className)}>
      {children}
    </div>
  );
}
