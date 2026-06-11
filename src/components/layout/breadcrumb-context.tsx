"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import type { BreadcrumbOverride } from "./breadcrumb-nav";

interface Ctx {
  override: BreadcrumbOverride | null;
  setOverride: (o: BreadcrumbOverride | null) => void;
}

const BreadcrumbContext = createContext<Ctx>({
  override: null,
  setOverride: () => {},
});

/**
 * Holds a per-page breadcrumb override. Wraps the admin layout's `<Breadcrumbs>`
 * AND its children, so a page can relabel/extend the trail via `<SetBreadcrumb>`.
 */
export function BreadcrumbProvider({ children }: { children: ReactNode }) {
  const [override, setOverride] = useState<BreadcrumbOverride | null>(null);
  return (
    <BreadcrumbContext.Provider value={{ override, setOverride }}>
      {children}
    </BreadcrumbContext.Provider>
  );
}

export function useBreadcrumbOverride(): BreadcrumbOverride | null {
  return useContext(BreadcrumbContext).override;
}

/**
 * Drop into a page to override its auto-derived breadcrumb trail — relabel the
 * current crumb (`label`) and/or insert ancestor crumbs before it (`trail`).
 * Clears itself on unmount. Props are plain serializable values, so a server
 * component can render it directly.
 */
export function SetBreadcrumb({ label, trail }: BreadcrumbOverride) {
  const { setOverride } = useContext(BreadcrumbContext);
  // Stable dep for the trail array (recreated each render of the parent).
  const trailKey = JSON.stringify(trail ?? null);
  useEffect(() => {
    setOverride({ label, trail });
    return () => setOverride(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [label, trailKey, setOverride]);
  return null;
}
