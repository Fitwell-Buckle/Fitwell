import { NextResponse } from "next/server";
import { ilike, inArray, or } from "drizzle-orm";
import { db } from "@/lib/db";
import { creator, creatorPlatform } from "@/lib/schema";

// Middleware gates /api/admin/* to signed-in non-portal users.
// Lightweight typeahead for the "reassign platform" picker on the detail
// page — match by creator name or any platform handle.

export async function GET(req: Request) {
  const q = new URL(req.url).searchParams.get("q")?.trim() ?? "";
  const exclude = new URL(req.url).searchParams.get("exclude") ?? "";
  if (q.length < 2) return NextResponse.json({ data: [] });

  const pattern = `%${q}%`;
  const handleMatches = await db
    .select({ creatorId: creatorPlatform.creatorId })
    .from(creatorPlatform)
    .where(ilike(creatorPlatform.handle, pattern))
    .limit(50);
  const handleCreatorIds = handleMatches.map((m) => m.creatorId);

  const rows = await db.query.creator.findMany({
    where: (c) =>
      handleCreatorIds.length
        ? or(ilike(c.name, pattern), inArray(c.id, handleCreatorIds))
        : ilike(c.name, pattern),
    columns: { id: true, name: true, primaryPlatform: true },
    with: { platforms: { columns: { platform: true, handle: true } } },
    limit: 12,
  });

  const data = rows
    .filter((r) => r.id !== exclude)
    .map((r) => ({
      id: r.id,
      name: r.name,
      primaryPlatform: r.primaryPlatform,
      platforms: r.platforms.map((p) => `${p.platform}:@${p.handle}`),
    }));
  return NextResponse.json({ data });
}
