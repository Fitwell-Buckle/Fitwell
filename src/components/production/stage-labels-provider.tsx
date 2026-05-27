"use client";

import { createContext, useContext } from "react";
import { STAGES, STAGE_LABELS } from "@/lib/production/stages";

interface StageContext {
  /** key → label, including soft-deleted stages so history still renders. */
  labels: Record<string, string>;
  /** Active stage keys in pipeline order. */
  order: string[];
}

const StageContext = createContext<StageContext>({
  labels: STAGE_LABELS,
  order: [...STAGES],
});

export function StageLabelsProvider({
  labels,
  order,
  children,
}: {
  labels: Record<string, string>;
  order: string[];
  children: React.ReactNode;
}) {
  return (
    <StageContext.Provider value={{ labels, order }}>{children}</StageContext.Provider>
  );
}

/** key → effective label (defaults + admin overrides), for client components. */
export function useStageLabels(): Record<string, string> {
  return useContext(StageContext).labels;
}

/** Active stage keys in pipeline order, for client components. */
export function useStageOrder(): string[] {
  return useContext(StageContext).order;
}
