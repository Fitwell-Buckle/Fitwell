import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { renderMarkdown } from "@/lib/markdown";
import { MarkdownPage } from "../markdown-page";

export const metadata: Metadata = {
  title: "Architecture | Fitwell Docs",
};

export default async function ArchitecturePage() {
  const session = await auth();
  if (!session) redirect("/auth/login");

  const html = await renderMarkdown("specs/current/architecture.md");

  return <MarkdownPage title="Architecture" html={html} />;
}
