/**
 * One-off country backfill for YT creators: channels.list snippet.country
 * per handle (1 quota unit each — the nightly refresh maintains it after
 * this). IG has no public country; those stay null (= in-market) until
 * manually set on the detail page.
 *
 * Usage:
 *   dotenv -e .env.local -- tsx scripts/backfill-creator-country.ts
 */
import { eq, isNull, sql } from "drizzle-orm";

const { db } = await import("@/lib/db");
const { creator, creatorPlatform } = await import("@/lib/schema");

if (!process.env.YOUTUBE_API_KEY) {
  console.error("YOUTUBE_API_KEY not set");
  process.exit(1);
}

const platforms = await db
  .select({
    id: creatorPlatform.id,
    creatorId: creatorPlatform.creatorId,
    handle: creatorPlatform.handle,
  })
  .from(creatorPlatform)
  .where(
    sql`${creatorPlatform.platform} = 'yt' and ${isNull(creatorPlatform.country)}`,
  );

console.log(`${platforms.length} YT platforms without country`);
let set = 0;
let missing = 0;

for (const p of platforms) {
  try {
    const qs = new URLSearchParams({
      part: "snippet",
      forHandle: `@${p.handle}`,
      key: process.env.YOUTUBE_API_KEY!,
    });
    const res = await fetch(`https://www.googleapis.com/youtube/v3/channels?${qs}`);
    if (!res.ok) throw new Error(`${res.status}`);
    const json = (await res.json()) as {
      items?: { snippet?: { country?: string } }[];
    };
    const country = json.items?.[0]?.snippet?.country?.toUpperCase() ?? null;
    if (!country) {
      missing++;
      continue;
    }
    await db
      .update(creatorPlatform)
      .set({ country })
      .where(eq(creatorPlatform.id, p.id));
    // Roll up only while unset — manual edits win.
    await db
      .update(creator)
      .set({ country })
      .where(sql`${creator.id} = ${p.creatorId} and ${creator.country} is null`);
    set++;
  } catch (e) {
    console.error(`country lookup failed for @${p.handle}:`, e);
  }
}

console.log(`Done. set=${set} no-country-on-channel=${missing}`);
process.exit(0);
