import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { listCadModels } from "@/lib/cad/service";
import { PageHeader } from "@/components/ui/page-header";
import { SectionTabs } from "@/components/ui/section-tabs";
import { PRODUCTS_TABS } from "@/lib/nav-tabs";
import { CadModelManager } from "./cad-model-manager";

export const metadata: Metadata = {
  title: "CAD Models | Fitwell Admin",
};

export default async function CadModelsPage() {
  const session = await auth();
  if (!session) redirect("/auth/login");

  const models = await listCadModels();

  return (
    <div>
      <PageHeader title="Products" />
      <SectionTabs tabs={PRODUCTS_TABS} />
      <p className="mt-4 max-w-2xl text-sm text-zinc-500">
        Your reusable CAD library. Upload an STL once per design — it converts to
        a 3D web model automatically. Many SKUs (color variants) can share one
        model, so you only upload each geometry once.
      </p>

      <CadModelManager
        models={models.map((m) => ({
          id: m.id,
          name: m.name,
          fusionUrl: m.fusionUrl,
          glbUrl: m.glbUrl,
          status: m.status,
          errorMessage: m.errorMessage,
          sourceFilename: m.sourceFilename,
          triangleCount: m.triangleCount,
        }))}
      />
    </div>
  );
}
