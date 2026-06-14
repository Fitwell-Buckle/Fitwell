/**
 * Run verdict + the RUN SUMMARY log block.
 *
 * A source-starved or news-less edition still "succeeds" — Klaviyo sends
 * whatever it's handed and the GitHub Actions workflow exits 0 — so the daily
 * run-check routine (an LLM reading the log) and a human skimming it both need
 * a deterministic signal to LEAD with, instead of inferring health from
 * scattered "source failed" / "triage kept 0 news" lines. Without it an
 * obviously-degraded issue reads as a cheerful "SENT ✓".
 */

export type RunStatus = "OK" | "DEGRADED" | "NO_BRIEF";

/**
 * Pure verdict for a run:
 *   DEGRADED  any source failed, OR an edition shipped with 0 hard-news.
 *   NO_BRIEF  nothing to send (nothing fresh / triage dropped all) AND every
 *             source fetched — a genuinely quiet day, not a fault.
 *   OK        edition shipped, every source fetched, ≥1 hard-news story.
 */
export function classifyRun(opts: {
  feedFailures: number;
  hardNews: number;
  produced: boolean;
}): { status: RunStatus; reasons: string[] } {
  const reasons: string[] = [];
  if (opts.feedFailures > 0)
    reasons.push(`${opts.feedFailures} source failure(s)`);
  if (opts.produced && opts.hardNews === 0) reasons.push("0 hard-news stories");
  const status: RunStatus = reasons.length
    ? "DEGRADED"
    : opts.produced
      ? "OK"
      : "NO_BRIEF";
  return { status, reasons };
}

/** Emit the machine-readable RUN SUMMARY block the run-check routine reads. */
export function printRunSummary(opts: {
  feedFailures: Array<{ slug: string; error: string }>;
  hardNews: number;
  releases: number;
  reviews: number;
  podcasts: number;
  produced: boolean;
}): void {
  const { feedFailures, hardNews, releases, reviews, podcasts, produced } = opts;
  const { status, reasons } = classifyRun({
    feedFailures: feedFailures.length,
    hardNews,
    produced,
  });

  console.log("=== RUN SUMMARY ===");
  console.log(
    `sources: ${feedFailures.length} failed` +
      (feedFailures.length
        ? ` — ${feedFailures.map((f) => `${f.slug} (${f.error})`).join("; ")}`
        : ""),
  );
  console.log(
    `brief: ${hardNews} hard-news + ${releases} releases + ${reviews} reviews + ${podcasts} podcasts`,
  );
  console.log(
    `STATUS: ${status}${reasons.length ? ` — ${reasons.join("; ")}` : ""}`,
  );
}
