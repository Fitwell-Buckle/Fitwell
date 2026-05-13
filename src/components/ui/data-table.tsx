import { cn } from "@/lib/utils";

export function DataTable({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "rounded-xl border border-zinc-200/80 bg-white shadow-[0_1px_3px_0_rgb(0_0_0/0.04)]",
        className,
      )}
    >
      {children}
    </div>
  );
}

export function Mono({ children }: { children: React.ReactNode }) {
  return <span className="font-mono">{children}</span>;
}

export function Muted({ children }: { children: React.ReactNode }) {
  return (
    <span className="font-mono text-xs font-medium text-zinc-500">
      {children}
    </span>
  );
}
