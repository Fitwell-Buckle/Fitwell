import { describe, it, expect } from "vitest";
import {
  buildPoTimeline,
  fmtBytes,
  type TimelineComment,
  type TimelineAttachment,
  type TimelineEvent,
} from "./timeline";

const comment = (over: Partial<TimelineComment> = {}): TimelineComment => ({
  id: "c1",
  body: "hello",
  createdAt: new Date("2026-05-01T10:00:00Z"),
  author: { name: "Greg", email: "greg@fitwellbuckle.co", role: "user" },
  ...over,
});

const attachment = (over: Partial<TimelineAttachment> = {}): TimelineAttachment => ({
  id: "a1",
  filename: "spec.pdf",
  blobUrl: "https://blob/spec.pdf",
  sizeBytes: 2048,
  uploadedAt: new Date("2026-05-01T11:00:00Z"),
  uploadedBy: { name: "Acme", email: "acme@vendor.com", role: "supplier" },
  ...over,
});

describe("buildPoTimeline", () => {
  it("merges notes and documents in chronological order", () => {
    const entries = buildPoTimeline(
      [
        comment({ id: "c1", createdAt: new Date("2026-05-01T12:00:00Z") }),
        comment({ id: "c2", createdAt: new Date("2026-05-01T09:00:00Z") }),
      ],
      [attachment({ id: "a1", uploadedAt: new Date("2026-05-01T10:30:00Z") })],
    );
    expect(entries.map((e) => e.id)).toEqual(["c2", "a1", "c1"]);
    expect(entries.map((e) => e.kind)).toEqual(["note", "document", "note"]);
  });

  it("marks supplier-authored entries with fromSupplier", () => {
    const [note, doc] = buildPoTimeline(
      [comment({ author: { name: "Greg", email: null, role: "user" } })],
      [attachment({ uploadedBy: { name: "Acme", email: null, role: "supplier" } })],
    );
    expect(note.fromSupplier).toBe(false);
    expect(doc.fromSupplier).toBe(true);
  });

  it("falls back to email then a side label for the author name", () => {
    const [adminNote, supplierNote] = buildPoTimeline(
      [
        comment({ id: "c1", author: { name: null, email: "a@b.co", role: "user" } }),
        comment({
          id: "c2",
          createdAt: new Date("2026-05-02T10:00:00Z"),
          author: { name: null, email: null, role: "supplier" },
        }),
      ],
      [],
    );
    expect(adminNote.authorName).toBe("a@b.co");
    expect(supplierNote.authorName).toBe("Supplier");
  });

  it("uses 'Fitwell' for a missing internal author", () => {
    const [note] = buildPoTimeline([comment({ author: null })], []);
    expect(note.authorName).toBe("Fitwell");
    expect(note.fromSupplier).toBe(false);
  });

  it("carries authorUserId and an editedAt on notes (for author-only editing)", () => {
    const [fresh] = buildPoTimeline(
      [comment({ authorUserId: "u1", updatedAt: null })],
      [],
    );
    if (fresh.kind !== "note") throw new Error("expected a note");
    expect(fresh.authorUserId).toBe("u1");
    expect(fresh.editedAt).toBeNull();

    const [edited] = buildPoTimeline(
      [
        comment({
          authorUserId: "u1",
          updatedAt: new Date("2026-05-02T08:00:00Z"),
        }),
      ],
      [],
    );
    if (edited.kind !== "note") throw new Error("expected a note");
    expect(edited.editedAt).toBe("2026-05-02T08:00:00.000Z");
  });

  it("defaults note authorUserId to null when the column is absent", () => {
    const [note] = buildPoTimeline([comment()], []);
    if (note.kind !== "note") throw new Error("expected a note");
    expect(note.authorUserId).toBeNull();
    expect(note.editedAt).toBeNull();
  });

  it("formats document size and carries the url/filename", () => {
    const [doc] = buildPoTimeline([], [attachment({ sizeBytes: 2048 })]);
    if (doc.kind !== "document") throw new Error("expected a document");
    expect(doc.size).toBe("2 KB");
    expect(doc.url).toBe("https://blob/spec.pdf");
    expect(doc.filename).toBe("spec.pdf");
  });

  it("merges edit-history events with notes + documents in chronological order", () => {
    const events: TimelineEvent[] = [
      {
        id: "e1",
        title: "EPower updated PO 00104-A",
        body: "Set expected completion to 2026-05-15",
        type: "update_for_admin",
        createdAt: new Date("2026-05-01T11:30:00Z"),
      },
      {
        id: "e2",
        title: "Greg Hartwell (Fitwell) updated PO 00104-A",
        body: "Advanced PO to Polishing",
        type: "update_for_supplier",
        createdAt: new Date("2026-05-02T09:00:00Z"),
      },
    ];
    const entries = buildPoTimeline(
      [comment({ id: "c1", createdAt: new Date("2026-05-01T10:00:00Z") })],
      [attachment({ id: "a1", uploadedAt: new Date("2026-05-01T11:00:00Z") })],
      events,
    );
    expect(entries.map((e) => e.id)).toEqual(["c1", "a1", "e1", "e2"]);
    expect(entries.map((e) => e.kind)).toEqual([
      "note",
      "document",
      "event",
      "event",
    ]);
  });

  it("derives the actor name from the event title and the side from type", () => {
    const events: TimelineEvent[] = [
      {
        id: "s1",
        title: "EPower updated PO 00104-A",
        body: "Set expected completion to 2026-05-15",
        type: "update_for_admin", // supplier-side action
        createdAt: new Date("2026-05-01T11:00:00Z"),
      },
      {
        id: "a1",
        title: "Greg Hartwell (Fitwell) updated PO 00104-A",
        body: "Advanced PO to Polishing",
        type: "update_for_supplier", // admin-side action
        createdAt: new Date("2026-05-02T11:00:00Z"),
      },
    ];
    const [supplierEvt, adminEvt] = buildPoTimeline([], [], events);
    expect(supplierEvt.kind).toBe("event");
    expect(supplierEvt.fromSupplier).toBe(true);
    expect(supplierEvt.authorName).toBe("EPower");
    expect(adminEvt.fromSupplier).toBe(false);
    // "(Fitwell)" stripped from the actor name.
    expect(adminEvt.authorName).toBe("Greg Hartwell");
  });

  it("falls back to a side label when the event title doesn't parse", () => {
    const events: TimelineEvent[] = [
      {
        id: "x",
        title: "Notification with no parsable actor",
        body: "Something changed",
        type: "update_for_supplier",
        createdAt: new Date("2026-05-01T11:00:00Z"),
      },
    ];
    const [evt] = buildPoTimeline([], [], events);
    expect(evt.authorName).toBe("Fitwell");
  });
});

describe("fmtBytes", () => {
  it("formats byte sizes", () => {
    expect(fmtBytes(null)).toBe("");
    expect(fmtBytes(0)).toBe("");
    expect(fmtBytes(512)).toBe("512 B");
    expect(fmtBytes(2048)).toBe("2 KB");
    expect(fmtBytes(5 * 1024 * 1024)).toBe("5.0 MB");
  });
});
