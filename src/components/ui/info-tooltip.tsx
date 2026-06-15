"use client";

import * as React from "react";
import { Info } from "lucide-react";
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
  TooltipProvider,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

/**
 * Small "ⓘ" trigger that reveals explanatory / methodology copy on hover or
 * focus. Used to move metric instructions off the page surface and into a
 * tooltip, keeping cards uncluttered while the "how is this calculated"
 * detail stays one hover away. Self-contained (bundles its own
 * TooltipProvider) so it can be dropped next to any heading.
 */
export function InfoTooltip({
  children,
  label = "How this is calculated",
  className,
  contentClassName,
}: {
  children: React.ReactNode;
  label?: string;
  className?: string;
  contentClassName?: string;
}) {
  return (
    <TooltipProvider delayDuration={150}>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            aria-label={label}
            className={cn(
              "inline-flex shrink-0 items-center justify-center rounded text-zinc-400 transition-colors hover:text-zinc-600 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-zinc-300",
              className,
            )}
          >
            <Info className="h-3.5 w-3.5" />
          </button>
        </TooltipTrigger>
        <TooltipContent
          className={cn(
            "max-w-sm whitespace-normal text-left font-normal normal-case leading-relaxed tracking-normal text-zinc-600",
            contentClassName,
          )}
        >
          {children}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
