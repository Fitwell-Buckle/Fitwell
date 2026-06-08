import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { toSVG } from "bwip-js/node";
import { auth } from "@/lib/auth";
import { getCatalogCached } from "@/lib/catalog/load";
import { Button } from "@/components/ui/button";
import { DownloadButtons } from "./download-buttons";

const LABEL_DOM_ID = "fitwell-label";

export const metadata: Metadata = {
  title: "Packaging label | Fitwell Admin",
};

export default async function PackagingLabelPage({
  params,
}: {
  params: Promise<{ sku: string }>;
}) {
  const session = await auth();
  if (!session) redirect("/auth/login");

  const { sku: encoded } = await params;
  const sku = decodeURIComponent(encoded);

  // Look the SKU up in the cached catalog so the label always reflects the
  // current Shopify product title + variant title.
  const variants = await getCatalogCached();
  const variant = variants.find((v) => v.sku === sku);
  if (!variant) notFound();

  // Code 128 barcode. bwip-js auto-picks the subset (A/B/C) based on the
  // input string — for our SKU pattern of uppercase + digits + hyphen the
  // result is the same on any scanner. Heights/widths are in "modules"; the
  // generated SVG scales cleanly when printed.
  const barcodeSvg = toSVG({
    bcid: "code128",
    text: sku,
    scale: 3,
    height: 18,
    includetext: false,
    paddingwidth: 0,
    paddingheight: 0,
    backgroundcolor: "FFFFFF",
  });

  return (
    <div>
      {/* Screen-only chrome — never captured in the download because the
          capture target is the inner #fitwell-label node only. */}
      <div className="mb-6 flex items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-zinc-900">
            Packaging label
          </h1>
          <p className="mt-1 text-sm text-zinc-500">
            Sized for a 4 × 5 inch label. Download as PNG, JPEG, or PDF — the
            file matches this preview exactly.
          </p>
        </div>
        <DownloadButtons sku={variant.sku} targetId={LABEL_DOM_ID} />
      </div>

      {/* The label artwork itself. The inner #fitwell-label div is what gets
          captured for downloads — keep the outer card chrome out of it. */}
      <div className="mx-auto w-[4in] rounded-lg border border-zinc-200 shadow-sm">
        <div
          id={LABEL_DOM_ID}
          className="w-[4in] bg-white p-[0.4in]"
        >
          <Label
            sku={variant.sku}
            title={variant.title}
            variantTitle={variant.variantTitle ?? null}
            barcodeSvg={barcodeSvg}
          />
        </div>
      </div>
    </div>
  );
}

function Label({
  sku,
  title,
  variantTitle,
  barcodeSvg,
}: {
  sku: string;
  title: string;
  variantTitle: string | null;
  barcodeSvg: string;
}) {
  return (
    <div className="flex h-full flex-col items-center text-black">
      {/* Wordmark. Using the existing brand PNG; renders sharp when scaled
          since the source is high-DPI. */}
      <Image
        src="/images/fitwell-logo.png"
        alt="Fitwell"
        width={400}
        height={96}
        priority
        className="mb-6 w-[2.6in] max-w-full"
      />

      <div className="text-center text-[18pt] font-semibold leading-tight">
        {title}
      </div>
      {variantTitle && (
        <div className="mt-1 text-center text-[14pt] leading-tight text-black/85">
          {variantTitle}
        </div>
      )}

      <div className="mt-8 text-center font-mono text-[22pt] font-bold tracking-tight">
        {sku}
      </div>

      {/* Barcode — drop the raw SVG straight in so it scales as a vector when
          printed. The width is constrained by the card; the SVG keeps its
          aspect ratio. aria-hidden because the SKU text above already conveys
          the same information. */}
      <div
        className="mt-3 w-full [&_svg]:mx-auto [&_svg]:block [&_svg]:h-auto [&_svg]:max-w-full"
        aria-hidden
        dangerouslySetInnerHTML={{ __html: barcodeSvg }}
      />

      <div className="mt-auto pt-8 text-center text-[8pt] leading-relaxed text-black/70">
        <div className="font-mono">Designed in Santa Cruz, California</div>
        <div className="mt-2 font-mono">Made in China</div>
      </div>
    </div>
  );
}
