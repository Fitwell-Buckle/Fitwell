// Merges PO notes (comments), documents (attachments), and edit-history
// events (PO update notifications) into one chronological feed for the PO
// activity tab. Pure + serialization-ready so both the admin and supplier
// PO pages can build identical timelines. `fromSupplier` drives the side
// label ("Supplier" vs "Fitwell") and is derived from the author's role —
// or, for events, from the notification type (`update_for_admin` = the
// supplier wrote, `update_for_supplier` = an admin wrote).

export interface TimelinePerson {
  name: string | null;
  email: string | null;
  role: string | null;
}

export interface TimelineComment {
  id: string;
  body: string;
  createdAt: Date;
  author: TimelinePerson | null;
}

export interface TimelineAttachment {
  id: string;
  filename: string;
  blobUrl: string;
  sizeBytes: number | null;
  uploadedAt: Date;
  uploadedBy: TimelinePerson | null;
}

/** A PO update audit row (from `admin_notification`). One row per change
 *  that fired a notifyPoUpdate — ETA edits, stage advances, line costs,
 *  status flips, etc. The `type` distinguishes the writing side:
 *  `update_for_admin` = supplier wrote, `update_for_supplier` = admin wrote. */
export interface TimelineEvent {
  id: string;
  /** `body` field on the notification — human-readable summary like
   *  "Set expected completion to 2026-07-15 on line abc12345". */
  body: string;
  /** Notification `title` — typically "<author> updated PO 00104-A".
   *  We display the body but use the title to derive the actor name. */
  title: string;
  type: string;
  createdAt: Date;
}

export type PoTimelineEntry =
  | {
      id: string;
      kind: "note";
      at: string; // ISO
      authorName: string;
      fromSupplier: boolean;
      body: string;
    }
  | {
      id: string;
      kind: "document";
      at: string; // ISO
      authorName: string;
      fromSupplier: boolean;
      filename: string;
      url: string;
      size: string; // formatted
    }
  | {
      id: string;
      kind: "event";
      at: string; // ISO
      authorName: string;
      fromSupplier: boolean;
      body: string;
    };

export function fmtBytes(n: number | null): string {
  if (!n) return "";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

function personName(p: TimelinePerson | null, fromSupplier: boolean): string {
  return p?.name || p?.email || (fromSupplier ? "Supplier" : "Fitwell");
}

/** Extract the actor name from a notification title. Examples:
 *  - "EPower updated PO 00104-A" → "EPower"
 *  - "Greg Hartwell (Fitwell) updated PO 00104-A" → "Greg Hartwell"
 *  Falls back to a side-derived generic when the title doesn't match. */
function actorFromTitle(title: string, fromSupplier: boolean): string {
  // The most reliable signal: split at " updated " — the actor is everything
  // before it, with any trailing " (Fitwell)" stripped.
  const idx = title.indexOf(" updated ");
  if (idx > 0) {
    return title.slice(0, idx).replace(/\s*\(Fitwell\)\s*$/, "").trim();
  }
  return fromSupplier ? "Supplier" : "Fitwell";
}

export function buildPoTimeline(
  comments: TimelineComment[],
  attachments: TimelineAttachment[],
  events: TimelineEvent[] = [],
): PoTimelineEntry[] {
  const notes: PoTimelineEntry[] = comments.map((c) => {
    const fromSupplier = c.author?.role === "supplier";
    return {
      id: c.id,
      kind: "note",
      at: c.createdAt.toISOString(),
      authorName: personName(c.author, fromSupplier),
      fromSupplier,
      body: c.body,
    };
  });

  const docs: PoTimelineEntry[] = attachments.map((a) => {
    const fromSupplier = a.uploadedBy?.role === "supplier";
    return {
      id: a.id,
      kind: "document",
      at: a.uploadedAt.toISOString(),
      authorName: personName(a.uploadedBy, fromSupplier),
      fromSupplier,
      filename: a.filename,
      url: a.blobUrl,
      size: fmtBytes(a.sizeBytes),
    };
  });

  const evts: PoTimelineEntry[] = events.map((e) => {
    // `update_for_admin` rows are written when a supplier mutates the PO;
    // `update_for_supplier` rows are admin-side actions.
    const fromSupplier = e.type === "update_for_admin";
    return {
      id: e.id,
      kind: "event",
      at: e.createdAt.toISOString(),
      authorName: actorFromTitle(e.title, fromSupplier),
      fromSupplier,
      body: e.body,
    };
  });

  // ISO UTC strings sort lexicographically in chronological order.
  return [...notes, ...docs, ...evts].sort((x, y) =>
    x.at < y.at ? -1 : x.at > y.at ? 1 : 0,
  );
}
