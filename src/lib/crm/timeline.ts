// Merges a lead's manual comments and its drafted/sent follow-up emails into a
// single timeline for the History tab. Pure + unit-tested.

export interface CommentInput {
  id: string;
  createdAt: Date;
  body: string;
  author?: string | null;
}

export interface MessageInput {
  id: string;
  createdAt: Date;
  sequenceStep: number;
  subject: string | null;
  status: string;
  sentAt: Date | null;
}

export interface TimelineComment {
  kind: "comment";
  id: string;
  createdAt: Date;
  body: string;
  author: string | null;
}

export interface TimelineMessage {
  kind: "message";
  id: string;
  createdAt: Date;
  sequenceStep: number;
  subject: string | null;
  status: string;
  sentAt: Date | null;
}

export type TimelineItem = TimelineComment | TimelineMessage;

// Combine comments + messages into one list, newest first. A stable kind-based
// tiebreak (comment before message) keeps ordering deterministic when two
// items share a timestamp.
export function buildLeadTimeline(
  comments: CommentInput[],
  messages: MessageInput[],
): TimelineItem[] {
  const items: TimelineItem[] = [
    ...comments.map(
      (c): TimelineComment => ({
        kind: "comment",
        id: c.id,
        createdAt: c.createdAt,
        body: c.body,
        author: c.author ?? null,
      }),
    ),
    ...messages.map(
      (m): TimelineMessage => ({
        kind: "message",
        id: m.id,
        createdAt: m.createdAt,
        sequenceStep: m.sequenceStep,
        subject: m.subject,
        status: m.status,
        sentAt: m.sentAt,
      }),
    ),
  ];
  return items.sort((a, b) => {
    const diff = b.createdAt.getTime() - a.createdAt.getTime();
    if (diff !== 0) return diff;
    if (a.kind === b.kind) return 0;
    return a.kind === "comment" ? -1 : 1;
  });
}
