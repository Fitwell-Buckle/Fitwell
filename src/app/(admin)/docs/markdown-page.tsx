import { PageHeader } from "@/components/ui/page-header";
import { Card, CardContent } from "@/components/ui/card";

export function MarkdownPage({
  title,
  html,
}: {
  title: string;
  html: string;
}) {
  return (
    <div>
      <PageHeader title={title} />
      <Card className="mt-6">
        <CardContent className="pt-6">
          <div
            className="prose prose-sm prose-zinc max-w-none
              [&_code]:rounded [&_code]:bg-zinc-100 [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:text-xs [&_code]:font-mono
              [&_h1]:text-lg [&_h1]:font-semibold [&_h1]:tracking-tight
              [&_h2]:mt-8 [&_h2]:text-base [&_h2]:font-semibold [&_h2]:tracking-tight
              [&_h3]:mt-4 [&_h3]:text-sm [&_h3]:font-semibold
              [&_li]:my-0.5 [&_ol]:pl-4 [&_ul]:pl-4
              [&_p]:text-sm [&_p]:leading-relaxed [&_p]:text-zinc-600
              [&_table]:w-full [&_table]:text-sm
              [&_td]:border [&_td]:border-zinc-200 [&_td]:px-3 [&_td]:py-1.5
              [&_th]:border [&_th]:border-zinc-200 [&_th]:bg-zinc-50 [&_th]:px-3 [&_th]:py-1.5 [&_th]:text-left [&_th]:font-medium
              [&_pre]:overflow-x-auto [&_pre]:rounded-lg [&_pre]:bg-zinc-50 [&_pre]:p-4 [&_pre]:text-xs
              [&_a]:text-blue-600 [&_a]:underline [&_a]:underline-offset-2
              [&_hr]:my-6 [&_hr]:border-zinc-200"
            dangerouslySetInnerHTML={{ __html: html }}
          />
        </CardContent>
      </Card>
    </div>
  );
}
