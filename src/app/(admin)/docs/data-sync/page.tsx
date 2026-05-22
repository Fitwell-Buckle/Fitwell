import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { renderMarkdown } from "@/lib/markdown";
import { MarkdownPage } from "../markdown-page";

export const metadata: Metadata = {
  title: "Data Sync | Fitwell Docs",
};

export default async function DataSyncPage() {
  const session = await auth();
  if (!session) redirect("/auth/login");

  const [dataFlowsHtml, dataSyncHtml] = await Promise.all([
    renderMarkdown("specs/current/data-flows.md"),
    renderMarkdown("specs/invariants/data-sync.md"),
  ]);

  return (
    <MarkdownPage
      title="Data Sync"
      html={dataFlowsHtml + "<hr />" + dataSyncHtml}
    />
  );
}
