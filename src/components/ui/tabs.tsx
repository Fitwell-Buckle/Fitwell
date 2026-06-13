"use client";

import * as React from "react";
import * as TabsPrimitive from "@radix-ui/react-tabs";
import { cn } from "@/lib/utils";

const Tabs = TabsPrimitive.Root;

// State-swap tabs (Radix) use the admin's standard underline tab style (shared
// with the route-level SectionTabs): an underline under the active tab. Used by
// DetailTabs (PO / invoice / lead / customer detail) and the customer sub-tabs.
const TabsList = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.List>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.List>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.List
    ref={ref}
    className={cn("inline-flex items-center gap-1 border-b border-zinc-200", className)}
    {...props}
  />
));
TabsList.displayName = "TabsList";

const TabsTrigger = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Trigger>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.Trigger
    ref={ref}
    className={cn(
      "relative -mb-px cursor-pointer rounded-sm px-3 py-2 text-sm font-medium text-zinc-500 transition-colors hover:text-zinc-700",
      "data-[state=active]:text-zinc-900",
      "after:absolute after:inset-x-0 after:bottom-0 after:h-0.5 after:bg-transparent data-[state=active]:after:bg-brand",
      "focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400",
      className,
    )}
    {...props}
  />
));
TabsTrigger.displayName = "TabsTrigger";

const TabsContent = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Content>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.Content
    ref={ref}
    className={cn("mt-4 focus:outline-none", className)}
    {...props}
  />
));
TabsContent.displayName = "TabsContent";

export { Tabs, TabsList, TabsTrigger, TabsContent };
