"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

/**
 * Animated wrapper for the per-PO drill-down panel. On mount it plays a
 * spring-like enter animation (opacity + translateY + scale) so the user has
 * clear visual feedback that the view just expanded to show more detail.
 *
 * Mount this with key={selectedPoNumber} so clicking a *different* PO
 * re-triggers the animation from scratch.
 */
export function DrillPanel({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  const [ready, setReady] = useState(false);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    // Double-RAF: let the browser paint the initial (hidden) state before
    // starting the transition, otherwise it snaps directly to the final state.
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = requestAnimationFrame(() => setReady(true));
    });
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  return (
    <div
      style={{
        transitionProperty: "opacity, transform",
        transitionDuration: "320ms",
        // Spring-like easing: fast out, gentle settle
        transitionTimingFunction: "cubic-bezier(0.16, 1, 0.3, 1)",
        willChange: "opacity, transform",
      }}
      className={cn(
        ready
          ? "opacity-100 translate-y-0 scale-100"
          : "opacity-0 translate-y-5 scale-[0.98]",
        className,
      )}
    >
      {children}
    </div>
  );
}
