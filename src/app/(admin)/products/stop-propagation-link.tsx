"use client";

import Link from "next/link";

/**
 * A `<Link>` that swallows the click event before it bubbles up — used inside
 * a clickable `<ProductRow>` so the row's own onClick doesn't fire when the
 * user clicks an inner link (e.g. the per-row "Label" action that opens in
 * a new tab).
 */
export function StopPropagationLink({
  href,
  className,
  target,
  rel,
  title,
  children,
}: {
  href: string;
  className?: string;
  target?: string;
  rel?: string;
  title?: string;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className={className}
      target={target}
      rel={rel}
      title={title}
      onClick={(e) => e.stopPropagation()}
    >
      {children}
    </Link>
  );
}
