/**
 * Chart spec the agent emits via the `render_chart` tool, plus pure validation/
 * normalization. The model provides the data inline (from its query results);
 * we coerce series values to numbers (SQL often returns counts as strings) so
 * Recharts renders them, and cap the point count.
 */

export type ChartType = "line" | "bar" | "area" | "pie";

export interface ChartSeries {
  key: string;
  label?: string;
}

export interface ChartSpec {
  type: ChartType;
  title?: string;
  data: Record<string, unknown>[];
  xKey: string;
  series: ChartSeries[];
}

const CHART_TYPES: ChartType[] = ["line", "bar", "area", "pie"];
const MAX_POINTS = 100;

export function validateChartSpec(
  input: unknown,
):
  | { ok: true; spec: ChartSpec }
  | { ok: false; error: string } {
  const o =
    input && typeof input === "object"
      ? (input as Record<string, unknown>)
      : {};

  const type = String(o.type) as ChartType;
  if (!CHART_TYPES.includes(type)) {
    return { ok: false, error: `Invalid chart type '${String(o.type)}'.` };
  }
  if (!Array.isArray(o.data) || o.data.length === 0) {
    return { ok: false, error: "Chart `data` must be a non-empty array." };
  }
  const xKey = typeof o.xKey === "string" ? o.xKey : "";
  if (!xKey) {
    return { ok: false, error: "Chart `xKey` is required." };
  }

  const series: ChartSeries[] = (Array.isArray(o.series) ? o.series : [])
    .map((s) => {
      const so = (s && typeof s === "object" ? s : {}) as Record<string, unknown>;
      return {
        key: String(so.key ?? ""),
        label: typeof so.label === "string" ? so.label : undefined,
      };
    })
    .filter((s) => s.key);
  if (series.length === 0) {
    return { ok: false, error: "Chart needs at least one `series`." };
  }

  // Keep the x value as-is (label/time); coerce each series value to a number.
  const data = (o.data as unknown[]).slice(0, MAX_POINTS).map((row) => {
    const r =
      row && typeof row === "object" ? (row as Record<string, unknown>) : {};
    const out: Record<string, unknown> = { [xKey]: r[xKey] };
    for (const s of series) {
      const n = Number(r[s.key]);
      out[s.key] = Number.isFinite(n) ? n : 0;
    }
    return out;
  });

  if (!data.every((r) => r[xKey] !== undefined && r[xKey] !== null)) {
    return { ok: false, error: `Every data row must include the xKey '${xKey}'.` };
  }

  return {
    ok: true,
    spec: {
      type,
      title: typeof o.title === "string" ? o.title : undefined,
      data,
      xKey,
      series,
    },
  };
}
