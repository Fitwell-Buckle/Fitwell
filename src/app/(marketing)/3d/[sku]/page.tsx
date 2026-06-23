import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getPublishedModelForSku } from "@/lib/cad/products";
import { ModelViewer } from "@/components/marketing/model-viewer";

export const metadata: Metadata = {
  title: "3D model | Fitwell Buckle Co.",
  description: "Spin the buckle in 3D.",
};

// Public, no auth (not under an admin prefix). Shows the SKU's published CAD
// model as a clean, chrome-free, auto-spinning 3D viewer.
export default async function ProductModelPage({
  params,
}: {
  params: Promise<{ sku: string }>;
}) {
  const { sku: encoded } = await params;
  const sku = decodeURIComponent(encoded);
  const model = await getPublishedModelForSku(sku);
  if (!model) notFound();

  return (
    <div className="mx-auto max-w-4xl px-4 py-16 sm:px-6 lg:px-8">
      <h1 className="text-3xl font-bold tracking-tight text-zinc-900">
        See it in 3D
      </h1>
      <p className="mt-3 max-w-xl text-zinc-600">
        Drag to spin {model.name} and look at it from any angle.
      </p>

      <div className="mt-8 aspect-[4/3] w-full overflow-hidden rounded-2xl border border-zinc-200 bg-gradient-to-b from-zinc-50 to-zinc-100">
        <ModelViewer
          src={model.glbUrl}
          alt={`${model.name}, 3D model`}
          cameraOrbit="-45deg 55deg auto"
        />
      </div>
    </div>
  );
}
