// Pure helpers (no db / network) for turning a Gmail thread into a compact
// text transcript to feed the AI draft prompts. Unit-tested.

export function decodeB64Url(data: string): string {
  try {
    return Buffer.from(data, "base64url").toString("utf8");
  } catch {
    return "";
  }
}

export interface GmailPayload {
  mimeType?: string;
  body?: { data?: string };
  parts?: GmailPayload[];
}

// Walk a Gmail message payload for the best plain-text body (prefer text/plain,
// recurse into multipart). Returns "" when none found.
export function extractPlainText(payload?: GmailPayload): string {
  if (!payload) return "";
  if (payload.mimeType === "text/plain" && payload.body?.data) {
    return decodeB64Url(payload.body.data);
  }
  if (payload.parts?.length) {
    for (const p of payload.parts) {
      if (p.mimeType === "text/plain" && p.body?.data) {
        return decodeB64Url(p.body.data);
      }
    }
    for (const p of payload.parts) {
      const t = extractPlainText(p);
      if (t) return t;
    }
  }
  return "";
}

export interface TranscriptEntry {
  from: string;
  dateMs: number;
  text: string;
}

// Strip quoted reply chains + signatures noise: drop ">"-quoted lines and
// "On <date> … wrote:" attribution lines, collapse blank runs.
function cleanBody(text: string): string {
  const lines = text.replace(/\r/g, "").split("\n");
  const kept: string[] = [];
  for (const line of lines) {
    const t = line.trimStart();
    if (t.startsWith(">")) continue;
    if (/^On .+wrote:$/.test(t.trim())) break; // start of quoted history
    kept.push(line);
  }
  return kept.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

// Build an oldest→newest transcript, each message labelled with sender + date,
// trimmed to the most recent `maxChars` so the prompt stays bounded.
export function formatTranscript(
  entries: TranscriptEntry[],
  maxChars = 4000,
): string {
  const blocks = entries
    .slice()
    .sort((a, b) => a.dateMs - b.dateMs)
    .map((e) => {
      const date = e.dateMs
        ? new Date(e.dateMs).toISOString().slice(0, 10)
        : "";
      const body = cleanBody(e.text) || "(no text)";
      return `[${date}] ${e.from}:\n${body}`;
    });
  let out = blocks.join("\n\n---\n\n");
  if (out.length > maxChars) out = "…\n\n" + out.slice(out.length - maxChars);
  return out;
}
