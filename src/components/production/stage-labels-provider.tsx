"use client";

import { createContext, useContext } from "react";
import { STAGE_LABELS, type ProductionStage } from "@/lib/production/stages";

type StageLabels = Record<ProductionStage, string>;

const StageLabelsContext = createContext<StageLabels>(STAGE_LABELS);

export function StageLabelsProvider({
  value,
  children,
}: {
  value: StageLabels;
  children: React.ReactNode;
}) {
  return (
    <StageLabelsContext.Provider value={value}>{children}</StageLabelsContext.Provider>
  );
}

/** Effective stage labels for client components (defaults + admin overrides). */
export function useStageLabels(): StageLabels {
  return useContext(StageLabelsContext);
}
