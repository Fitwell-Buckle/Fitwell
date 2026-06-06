"use client";

import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { TableRow } from "./table";

/**
 * Drop-in replacement for `<TableRow>` that navigates to `href` on click. Used
 * for tables where the entire row should feel like a tappable card — wrapping
 * `<tr>` in an `<a>` is invalid HTML, and React Router/Next don't render
 * `<tr role="link">` either, so we click-route via `useRouter`.
 *
 * Anchor elements (incl. nested `<Link>`s) inside the row are skipped — they
 * keep their own click behaviour so users can still cmd/ctrl-click them, and
 * the row's navigation doesn't fire on top.
 */
export function ClickableRow({
  href,
  className,
  children,
}: {
  href: string;
  className?: string;
  children: React.ReactNode;
}) {
  const router = useRouter();
  return (
    <TableRow
      onClick={(e) => {
        // Let nested links/buttons handle their own clicks.
        if ((e.target as HTMLElement).closest("a, button")) return;
        router.push(href);
      }}
      className={cn(
        "cursor-pointer hover:bg-zinc-50/80 active:bg-zinc-100/80",
        className,
      )}
    >
      {children}
    </TableRow>
  );
}
