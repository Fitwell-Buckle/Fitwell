import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { renderMarkdown } from "@/lib/markdown";
import { MarkdownPage } from "../markdown-page";

export const metadata: Metadata = {
  title: "Schema & Data Model | Fitwell Docs",
};

export default async function SchemaPage() {
  const session = await auth();
  if (!session) redirect("/auth/login");

  const html = await renderMarkdown("specs/current/schema.md");

  return <MarkdownPage title="Schema & Data Model" html={html} />;
}
