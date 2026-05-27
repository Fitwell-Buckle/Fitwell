// Merges PO notes (comments) and documents (attachments) into one chronological
// feed for the PO timeline. Pure + serialization-ready so both the admin and
// supplier PO pages can build identical timelines. `fromSupplier` drives the
// side label ("Supplier" vs "Fitwell") and is derived from the author's role.

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

export function buildPoTimeline(
  comments: TimelineComment[],
  attachments: TimelineAttachment[],
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

  // ISO UTC strings sort lexicographically in chronological order.
  return [...notes, ...docs].sort((x, y) =>
    x.at < y.at ? -1 : x.at > y.at ? 1 : 0,
  );
}
