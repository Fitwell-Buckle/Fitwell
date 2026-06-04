import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { existsSync } from "fs";
import { join } from "path";
import { auth } from "@/lib/auth";
import { renderMarkdown } from "@/lib/markdown";
import { MarkdownPage } from "../../markdown-page";

// Only allow simple kebab-case slugs (no path traversal, no dots).
const SLUG_RE = /^[a-z0-9][a-z0-9-]*$/;

function humanize(slug: string): string {
  return slug
    .split("-")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  return { title: `${humanize(slug)} | Fitwell Strategy` };
}

export default async function StrategyDocPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const session = await auth();
  if (!session) redirect("/auth/login");

  const { slug } = await params;
  if (!SLUG_RE.test(slug)) notFound();

  const rel = `specs/strategy/${slug}.md`;
  if (!existsSync(join(process.cwd(), rel))) notFound();

  const html = await renderMarkdown(rel);
  return <MarkdownPage title={humanize(slug)} html={html} />;
}
