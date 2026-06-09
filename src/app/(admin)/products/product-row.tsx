"use client";

import { useRouter } from "next/navigation";
import { TableRow } from "@/components/ui/table";

/**
 * A clickable table row that navigates to `href`. Used for the products list
 * so the whole row, not just the SKU/title cells, takes you to the product
 * detail page. Buttons or links inside the row should call
 * `stopPropagation` on their click handlers — e.g. the "Label" action that
 * opens in a new tab — so they don't double-trigger this navigation.
 */
export function ProductRow({
  href,
  children,
}: {
  href: string;
  children: React.ReactNode;
}) {
  const router = useRouter();
  function go() {
    router.push(href);
  }
  return (
    <TableRow
      role="link"
      tabIndex={0}
      onClick={go}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          go();
        }
      }}
      className="cursor-pointer"
    >
      {children}
    </TableRow>
  );
}
