import type { Metadata } from "next";
import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { auth } from "@/lib/auth";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { getGuide, guides } from "../guides-data";
import { Figure } from "../figure";

export function generateStaticParams() {
  return guides.map((g) => ({ slug: g.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const guide = getGuide(slug);
  return { title: guide ? `${guide.title} | Fitwell Guides` : "Guide | Fitwell" };
}

export default async function GuidePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const session = await auth();
  if (!session) redirect("/auth/login");

  const { slug } = await params;
  const guide = getGuide(slug);
  if (!guide) notFound();

  return (
    <div>
      <div className="flex items-center justify-between">
        <PageHeader title={guide.title} />
        <Button variant="ghost" size="sm" asChild>
          <Link href="/docs/guides">All guides</Link>
        </Button>
      </div>
      <p className="mt-2 text-sm text-zinc-500">{guide.summary}</p>

      <Card className="mt-6">
        <CardContent className="pt-6">
          <ol className="space-y-6">
            {guide.steps.map((step, i) => (
              <li key={i} className="flex gap-3">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-zinc-900 text-xs font-semibold text-white">
                  {i + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm leading-relaxed text-zinc-700">{step.text}</p>
                  {step.shot && (
                    <Figure
                      src={`/docs/guides/${guide.slug}/${i + 1}.${step.video ? "mp4" : "png"}`}
                      caption={step.shot}
                      video={step.video}
                    />
                  )}
                </div>
              </li>
            ))}
          </ol>
        </CardContent>
      </Card>
    </div>
  );
}
