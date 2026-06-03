import Link from "next/link";
import { Card } from "@/components/ui/card";
import { isTerminal, type ProductionStage } from "@/lib/production/stages";
import { STAGE_BAR, fmtDate, skuSize } from "@/lib/production/display";
import { projectEta } from "@/lib/production/cycle-time";
import { formatPoNumber } from "@/lib/production/sub-po";

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const isoDay = (d: Date) => d.toISOString().slice(0, 10);
const utcMidnight = (iso: string) => Date.parse(`${iso}T00:00:00Z`);

interface Segment {
  stage: ProductionStage;
  startMs: number;
  endMs: number;
  projected: boolean;
}

export interface TimelinePo {
  id: string;
  shopifyPoNumber: string;
  supplier: { name: string } | null;
  lineItems: {
    id: string;
    sku: string;
    title: string;
    currentStage: ProductionStage;
    // Per-line owning supplier + sub-PO number (the supplier responsible for the
    // line's current stage); falls back to the PO's primary supplier/number.
    supplierName?: string;
    poNumber?: string;
    stageEvents: {
      id: string;
      stage: ProductionStage;
      enteredAt: Date;
      exitedAt: Date | null;
    }[];
  }[];
}

/**
 * Per-line-item production Gantt: solid segments from actual stage history plus
 * a faded segment projected to ETA. Data (the filtered POs + cycle-time
 * estimates) is supplied by the Production Summary page.
 */
export function ProductionTimeline({
  pos,
  estimates,
  stageLabels,
  order,
}: {
  pos: TimelinePo[];
  estimates: Record<ProductionStage, number>;
  stageLabels: Record<ProductionStage, string>;
  order: readonly string[];
}) {
  const todayIso = isoDay(new Date());
  const todayMs = utcMidnight(todayIso);

  const tracks = pos
    .flatMap((po) =>
      po.lineItems
        .filter((li) => li.stageEvents.length > 0)
        .map((li) => {
          const segs: Segment[] = li.stageEvents.map((ev) => {
            const startMs = ev.enteredAt.getTime();
            const endMs = ev.exitedAt ? ev.exitedAt.getTime() : todayMs;
            return {
              stage: ev.stage,
              startMs,
              endMs: Math.max(endMs, startMs + MS_PER_DAY / 4),
              projected: false,
            };
          });

          let etaMs: number | null = null;
          if (!isTerminal(order, li.currentStage)) {
            etaMs = utcMidnight(projectEta(order, li.currentStage, todayIso, estimates));
            if (etaMs > todayMs) {
              segs.push({
                stage: li.currentStage,
                startMs: todayMs,
                endMs: etaMs,
                projected: true,
              });
            }
          }

          return {
            key: li.id,
            poId: po.id,
            poNumber: li.poNumber ?? formatPoNumber(po.shopifyPoNumber),
            supplier: li.supplierName ?? po.supplier?.name ?? "—",
            sku: li.sku,
            title: li.title,
            currentStage: li.currentStage,
            segs,
            startMs: segs[0].startMs,
            endMs: Math.max(...segs.map((s) => s.endMs)),
            etaMs,
          };
        }),
    )
    .sort((a, b) => skuSize(a.sku) - skuSize(b.sku) || a.startMs - b.startMs);

  const minMs = tracks.length ? Math.min(...tracks.map((t) => t.startMs), todayMs) : todayMs;
  const maxMs = tracks.length ? Math.max(...tracks.map((t) => t.endMs), todayMs) : todayMs;
  const range = Math.max(maxMs - minMs, MS_PER_DAY);
  const pct = (ms: number) => ((ms - minMs) / range) * 100;
  const todayPct = pct(todayMs);

  return (
    <div className="mt-8">
      <h2 className="text-sm font-semibold text-zinc-900">Production timeline</h2>
      <p className="mt-1 text-xs text-zinc-500">
        Each row is a line item across its stages. Solid = actual (from stage
        history); faded = projected to ETA using cycle-time estimates.
      </p>

      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-2">
        {order.map((s) => (
          <span key={s} className="flex items-center gap-1.5 text-xs text-zinc-500">
            <span className={`inline-block h-3 w-3 rounded-sm ${STAGE_BAR[s] ?? "bg-zinc-300"}`} />
            {stageLabels[s]}
          </span>
        ))}
      </div>

      {tracks.length === 0 ? (
        <Card className="mt-4 p-8 text-center text-sm text-zinc-400">
          No open line items to chart.
        </Card>
      ) : (
        <Card className="mt-4 overflow-hidden p-0">
          <div className="divide-y divide-zinc-100">
            {tracks.map((t) => (
              <div key={t.key} className="flex items-center gap-3 px-4 py-2.5">
                <div className="w-48 shrink-0">
                  <Link
                    href={`/modules/production/po/${t.poId}`}
                    className="block truncate font-mono text-xs text-zinc-900 hover:underline"
                    title={`${t.sku} — ${t.title}`}
                  >
                    {t.sku}
                  </Link>
                  <div className="truncate text-[11px] text-zinc-400">
                    {t.poNumber} · {t.supplier}
                  </div>
                </div>

                <div className="relative h-6 flex-1 rounded bg-zinc-50">
                  <div
                    className="absolute top-0 z-10 h-full w-px bg-zinc-300"
                    style={{ left: `${todayPct}%` }}
                  />
                  {t.segs.map((s, i) => (
                    <div
                      key={i}
                      className={`absolute top-1 h-4 rounded-sm ${STAGE_BAR[s.stage] ?? "bg-zinc-300"} ${
                        s.projected ? "opacity-30" : ""
                      }`}
                      style={{
                        left: `${pct(s.startMs)}%`,
                        width: `${Math.max(pct(s.endMs) - pct(s.startMs), 0.5)}%`,
                      }}
                      title={`${stageLabels[s.stage]}${s.projected ? " (projected)" : ""}`}
                    />
                  ))}
                </div>

                <div className="w-24 shrink-0 text-right text-xs text-zinc-500">
                  {isTerminal(order, t.currentStage)
                    ? stageLabels[t.currentStage]
                    : t.etaMs
                      ? `ETA ${fmtDate(isoDay(new Date(t.etaMs)))}`
                      : "—"}
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}
