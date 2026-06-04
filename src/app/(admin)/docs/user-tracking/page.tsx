import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { renderMarkdown } from "@/lib/markdown";
import { MarkdownPage } from "../markdown-page";

export const metadata: Metadata = {
  title: "User Tracking | Fitwell Docs",
};

export default async function UserTrackingPage() {
  const session = await auth();
  if (!session) redirect("/auth/login");

  const html = await renderMarkdown("specs/strategy/event-taxonomy.md");

  return <MarkdownPage title="User Tracking" html={html} />;
}
