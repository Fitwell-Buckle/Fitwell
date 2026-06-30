/**
 * Judge.me ETL — pulls all published reviews via the REST API and
 * upserts them into the `review` table on (source, external_id).
 * Called by /api/cron/extract-judgeme.
 *
 * Idempotent: re-runs and backfills overwrite the same rows, so it's
 * safe to trigger manually after the API key lands or to re-run for a
 * spot-check. We always overwrite the existing row's content fields
 * (rating, title, body, etc.) because Judge.me reviewers can edit
 * their reviews after posting.
 *
 * Phase 5 of specs/work-plans/todo/funnel-strategy-next-iteration.md.
 */
import { db } from "@/lib/db";
import { review } from "@/lib/schema";
import { sql } from "drizzle-orm";
import { fetchAllReviews, judgemeConfigFromEnv } from "./client";

export interface ExtractJudgemeSummary {
  reviewsSeen: number;
  reviewsUpserted: number;
  pagesProcessed: number;
  reviewersWithEmail: number;
}

export async function extractJudgeme(): Promise<ExtractJudgemeSummary> {
  const config = judgemeConfigFromEnv();

  let reviewsSeen = 0;
  let reviewsUpserted = 0;
  let pagesProcessed = 0;
  let reviewersWithEmail = 0;

  for await (const batch of fetchAllReviews(config)) {
    if (batch.length === 0) continue;
    pagesProcessed += 1;
    reviewsSeen += batch.length;
    reviewersWithEmail += batch.filter((r) => r.reviewerEmail !== null).length;

    // Upsert the batch in a single statement. Drizzle's insert + onConflictDoUpdate
    // is the idiomatic Postgres UPSERT here — the unique (source, external_id)
    // index from migration 0048 carries the conflict target.
    await db
      .insert(review)
      .values(
        batch.map((r) => ({
          externalId: r.externalId,
          source: r.source,
          reviewerEmail: r.reviewerEmail,
          reviewerName: r.reviewerName,
          rating: r.rating,
          title: r.title,
          body: r.body,
          verified: r.verified,
          productId: r.productId,
          productHandle: r.productHandle,
          location: r.location,
          imageUrls: r.imageUrls,
          reviewDate: r.reviewDate,
          // capturedAt is set on first insert via DEFAULT now(); updatedAt is
          // refreshed below on every upsert so we can see when a row was
          // last touched.
          updatedAt: new Date(),
        })),
      )
      .onConflictDoUpdate({
        target: [review.source, review.externalId],
        set: {
          reviewerEmail: sql`excluded.reviewer_email`,
          reviewerName: sql`excluded.reviewer_name`,
          rating: sql`excluded.rating`,
          title: sql`excluded.title`,
          body: sql`excluded.body`,
          verified: sql`excluded.verified`,
          productId: sql`excluded.product_id`,
          productHandle: sql`excluded.product_handle`,
          location: sql`excluded.location`,
          imageUrls: sql`excluded.image_urls`,
          reviewDate: sql`excluded.review_date`,
          updatedAt: sql`now()`,
        },
      });
    reviewsUpserted += batch.length;
  }

  return {
    reviewsSeen,
    reviewsUpserted,
    pagesProcessed,
    reviewersWithEmail,
  };
}
