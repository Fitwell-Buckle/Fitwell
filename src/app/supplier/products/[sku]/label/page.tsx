import type { Metadata } from "next";
import Image from "next/image";
import { notFound, redirect } from "next/navigation";
import { toSVG } from "bwip-js/node";
import { and, eq, inArray, isNull } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  productionPo,
  productionPoLineItem,
  productionStageAssignment,
} from "@/lib/schema";
import { getSupplierScope } from "@/lib/production/supplier-session";
import { getCatalogCached } from "@/lib/catalog/load";
import { getStageOrder } from "@/lib/production/stage-labels";
import {
  supplierOwnsStage,
  type StageAssignment,
} from "@/lib/production/stage-owners";
// Reuse the admin label's download UI verbatim — same client behaviour, same
// pixel-for-pixel capture. Route-group dirs in App Router don't affect imports.
import { DownloadButtons } from "@/app/(admin)/products/[sku]/label/download-buttons";

const LABEL_DOM_ID = "fitwell-label";

// The stage key suppliers need to own to see the packaging label. Stage labels
// are user-editable but the underlying KEY is the stable identifier — the seed
// is "packaging" and renaming it would be a deliberate admin action.
const PACKAGING_STAGE_KEY = "packaging";

export const metadata: Metadata = {
  title: "Packaging label | Fitwell Supplier Portal",
};

/**
 * Supplier-scoped mirror of the admin packaging label page. A supplier may
 * download a label only if they own the packaging stage on at least one master
 * PO that includes this SKU. Anything else 404s — we don't leak "this SKU
 * exists but not for you".
 */
export default async function SupplierLabelPage({
  params,
}: {
  params: Promise<{ sku: string }>;
}) {
  const scope = await getSupplierScope();
  if (!scope) redirect("/external/login");

  const { sku: encoded } = await params;
  const sku = decodeURIComponent(encoded);

  // Pull the candidate master POs (where line items live) that contain this
  // SKU. Sub-POs share their master's line items, so checking masters is
  // sufficient.
  const candidatePos = await db
    .selectDistinct({
      poId: productionPo.id,
      poSupplierId: productionPo.supplierId,
    })
    .from(productionPo)
    .innerJoin(
      productionPoLineItem,
      eq(productionPoLineItem.poId, productionPo.id),
    )
    .where(and(eq(productionPoLineItem.sku, sku), isNull(productionPo.parentPoId)));

  if (!candidatePos.length) notFound();

  const assignmentRows = await db
    .select({
      poId: productionStageAssignment.poId,
      stage: productionStageAssignment.stage,
      supplierId: productionStageAssignment.supplierId,
    })
    .from(productionStageAssignment)
    .where(
      inArray(
        productionStageAssignment.poId,
        candidatePos.map((p) => p.poId),
      ),
    );

  const assignmentsByPo = new Map<string, StageAssignment[]>();
  for (const r of assignmentRows) {
    const list = assignmentsByPo.get(r.poId) ?? [];
    list.push({ stage: r.stage, supplierId: r.supplierId });
    assignmentsByPo.set(r.poId, list);
  }

  const order = await getStageOrder();
  const owned = candidatePos.some((p) =>
    supplierOwnsStage(
      order,
      assignmentsByPo.get(p.poId) ?? [],
      p.poSupplierId,
      scope.supplierId,
      PACKAGING_STAGE_KEY,
    ),
  );
  if (!owned) notFound();

  // Look the SKU up in the cached catalog so the label always reflects the
  // current Shopify product title + variant title.
  const variants = await getCatalogCached();
  const variant = variants.find((v) => v.sku === sku);
  if (!variant) notFound();

  // Code 128 barcode rendered as inline SVG (vector-crisp at any print size).
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

      <div className="mx-auto w-[4in] rounded-lg border border-zinc-200 bg-white shadow-sm">
        <div id={LABEL_DOM_ID} className="w-[4in] bg-white p-[0.4in]">
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
