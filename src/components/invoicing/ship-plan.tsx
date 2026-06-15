import type { ShipPlanGroup } from "@/lib/portal/addresses";

/**
 * Split-fulfillment "ship plan": one card per destination address, each a
 * compact Qty / SKU / Item table (instead of a run-on list) so a packer can
 * scan quantities + SKUs down aligned columns. Shared by the printable invoice
 * document and the admin invoice detail page so the two read identically.
 */
export function ShipPlanCards({ groups }: { groups: ShipPlanGroup[] }) {
  return (
    <div className="mt-3 grid gap-3 sm:grid-cols-2">
      {groups.map((g, i) => {
        const total = g.lines.reduce((sum, l) => sum + l.quantity, 0);
        return (
          <div key={i} className="break-inside-avoid rounded-md border border-zinc-200 p-3">
            <div className="flex items-start justify-between gap-2">
              <div className="text-sm font-medium text-zinc-900">
                {g.label}
                {g.isDefault && (
                  <span className="ml-2 rounded bg-zinc-100 px-1.5 py-0.5 text-[10px] font-medium text-zinc-500">
                    default
                  </span>
                )}
              </div>
              <div className="shrink-0 whitespace-nowrap text-xs tabular-nums text-zinc-400">
                {total.toLocaleString("en-US")} units
              </div>
            </div>
            <table className="mt-2 w-full text-xs">
              <thead>
                <tr className="text-left uppercase tracking-wider text-zinc-400">
                  <th className="w-10 pb-1 pr-2 text-right font-medium">Qty</th>
                  <th className="pb-1 pr-3 font-medium">SKU</th>
                  <th className="pb-1 font-medium">Item</th>
                </tr>
              </thead>
              <tbody>
                {g.lines.map((l, j) => (
                  <tr key={j} className="border-t border-zinc-100 align-top">
                    <td className="py-1 pr-2 text-right font-semibold tabular-nums text-zinc-800">
                      {l.quantity.toLocaleString("en-US")}
                    </td>
                    <td className="whitespace-nowrap py-1 pr-3 font-mono text-zinc-600">{l.sku}</td>
                    <td className="py-1 text-zinc-500">{l.title}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
      })}
    </div>
  );
}
