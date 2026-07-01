import { db } from "@/lib/db";
import { review } from "@/lib/schema";
import { sql } from "drizzle-orm";

export interface ReviewSummary {
  /** Average star rating, rounded to 1 decimal place (0 when no reviews). */
  rating: number;
  /** Total number of rated reviews. */
  count: number;
}

/**
 * Round a Postgres AVG() result to 1 decimal place. Postgres returns
 * avg() as a numeric *string*, so coerce first; guard null / NaN -> 0.
 * Pure and exported for unit testing.
 */
export function roundRating(avg: number | string | null | undefined): number {
  const n = Number(avg);
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 10) / 10;
}

/**
 * Shop-wide review rating + count, computed from the `review` table
 * (kept fresh by the daily Judge.me extract). Powers the storefront
 * review pill via /api/review-summary.
 */
export async function getReviewSummary(): Promise<ReviewSummary> {
  const [row] = await db
    .select({
      count: sql<number>`count(*)`,
      avg: sql<string | null>`avg(${review.rating})`,
    })
    .from(review)
    .where(sql`${review.rating} is not null`);
  return { rating: roundRating(row?.avg), count: Number(row?.count ?? 0) };
}
