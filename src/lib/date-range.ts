export interface DateRange {
  from: Date;
  to: Date;
  label: string;
}

export function parseDateRange(
  params: Record<string, string | string[] | undefined>,
): DateRange {
  const now = new Date();
  const to = typeof params.to === "string" ? new Date(params.to) : now;

  if (typeof params.from === "string") {
    return {
      from: new Date(params.from),
      to,
      label: "Custom",
    };
  }

  const from = new Date();
  from.setDate(from.getDate() - 30);
  return { from, to: now, label: "Last 30 days" };
}
