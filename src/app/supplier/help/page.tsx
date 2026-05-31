import type { Metadata } from "next";
import { Card, CardContent } from "@/components/ui/card";
import { getGuide } from "@/app/(admin)/docs/guides/guides-data";
import { Figure } from "@/app/(admin)/docs/guides/figure";

export const metadata: Metadata = {
  title: "Help & guides | Fitwell Supplier Portal",
};

// Supplier-facing help. Renders the "supplier-portal" guide from the shared
// guides data (the same content as Docs → Guides, minus the admin-only guides).
// Middleware already gates /supplier/* to the supplier role; the guide image
// assets under public/docs/guides/* are static, so they load here too.
export default function SupplierHelpPage() {
  const guide = getGuide("supplier-portal");

  return (
    <div>
      <h1 className="text-xl font-semibold text-zinc-900">Help &amp; guides</h1>
      <p className="mt-2 text-sm text-zinc-500">
        How to use the supplier portal — sign in, work your production board,
        and hand off finished stages.
      </p>

      {guide ? (
        <Card className="mt-6">
          <CardContent className="pt-6">
            <h2 className="text-sm font-semibold text-zinc-900">{guide.title}</h2>
            <p className="mt-1 text-sm text-zinc-500">{guide.summary}</p>
            <ol className="mt-5 space-y-6">
              {guide.steps.map((step, i) => (
                <li key={i} className="flex gap-3">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-zinc-900 text-xs font-semibold text-white">
                    {i + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm leading-relaxed text-zinc-700">
                      {step.text}
                    </p>
                    {step.shot && (
                      <Figure
                        src={`/docs/guides/${guide.slug}/${i + 1}.${step.gif ? "gif" : "png"}`}
                        caption={step.shot}
                      />
                    )}
                  </div>
                </li>
              ))}
            </ol>
          </CardContent>
        </Card>
      ) : (
        <p className="mt-6 text-sm text-zinc-400">Guide content unavailable.</p>
      )}

      <p className="mt-6 text-sm text-zinc-500">
        Still stuck? Reply to any Fitwell email or reach your Fitwell contact and
        we&apos;ll help.
      </p>
    </div>
  );
}
