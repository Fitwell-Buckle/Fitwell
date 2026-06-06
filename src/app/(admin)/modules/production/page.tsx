import { redirect } from "next/navigation";

// The standalone Purchase Orders page was merged into Production Summary
// (now just "Production"). Master grouping reproduces the old PO list one-for-one.
export default async function ProductionPoRedirect({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  // Preserve any incoming query params (supplier, status, from/to, sku, etc.)
  // and force the master grouping so the destination opens on the PO-list view.
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (typeof v === "string") qs.set(k, v);
    else if (Array.isArray(v)) qs.set(k, v.join(","));
  }
  qs.set("group", "master");
  redirect(`/modules/production/summary?${qs.toString()}`);
}
