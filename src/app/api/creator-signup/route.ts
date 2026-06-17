import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { creator, creatorEmail, creatorPlatform } from "@/lib/schema";
import { classifyEmailKind } from "@/lib/creators/scoring";
import {
  creatorSignupSchema,
  normalizeSignupProfiles,
} from "@/lib/creators/signup";

// PUBLIC endpoint — intentionally no auth. Influencers POST here from the
// /creator-signup page (outside the middleware matcher, so it stays open).
// Records land as unreviewed prospects in the /creators vetting queue.
export async function POST(req: Request) {
  const parsed = creatorSignupSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid submission." },
      { status: 400 },
    );
  }

  // Honeypot tripped → almost certainly a bot. Pretend success, write nothing,
  // so it can't tell it was caught.
  if (parsed.data.website) {
    return NextResponse.json({ data: { ok: true } }, { status: 201 });
  }

  const profiles = normalizeSignupProfiles(parsed.data.profiles);
  if (profiles.length === 0) {
    return NextResponse.json(
      { error: "Add at least one social profile." },
      { status: 400 },
    );
  }

  try {
    const [row] = await db
      .insert(creator)
      .values({
        name: parsed.data.name.trim(),
        primaryPlatform: profiles[0].platform,
        status: "prospect",
        vettingStatus: "unreviewed",
        source: "self_registration",
        notes: parsed.data.notes?.trim() || null,
      })
      .returning({ id: creator.id });

    // Handles already tracked are skipped (unique platform+handle index) so a
    // collision can't 500 the public form or hijack an existing record — the
    // new creator just sits in the vetting queue for a human to merge/reject.
    await db
      .insert(creatorPlatform)
      .values(
        profiles.map((p) => ({
          creatorId: row.id,
          platform: p.platform,
          handle: p.handle,
          profileUrl: p.profileUrl,
          dataSource: "self_registration",
        })),
      )
      .onConflictDoNothing({
        target: [creatorPlatform.platform, creatorPlatform.handle],
      });

    const email = parsed.data.email?.trim().toLowerCase();
    if (email) {
      await db
        .insert(creatorEmail)
        .values({
          creatorId: row.id,
          email,
          kind: classifyEmailKind(email),
          source: "self_registration",
        })
        .onConflictDoNothing();
    }

    return NextResponse.json({ data: { id: row.id } }, { status: 201 });
  } catch (err) {
    console.error("Creator signup failed:", err);
    return NextResponse.json(
      { error: "Something went wrong — please try again." },
      { status: 500 },
    );
  }
}
