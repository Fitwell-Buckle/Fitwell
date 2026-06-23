import "server-only";
import { getGoogleAccount, ensureFreshAccessToken } from "@/lib/gmail/token";

// Server-side automation of the Autodesk Fusion STL export. The "Email me when
// complete" share action is a plain GET to /shares/download — no cookies/CSRF —
// so a server can trigger it. Autodesk emails a signed download link; we then
// read it back out of the requester's Gmail (the app already has read access
// for the CRM inbound feature) and download the STL. No new mailbox/MX needed.

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36";

// Resolve a Fusion share link (a360.co/… or a full autodesk360 URL) to the
// hub host + share id used by the download endpoint.
export async function resolveFusionShare(
  url: string,
): Promise<{ host: string; shareId: string; docName: string | null } | null> {
  try {
    const res = await fetch(url, {
      redirect: "follow",
      headers: { "User-Agent": UA },
    });
    const finalUrl = res.url || url;
    const u = new URL(finalUrl);
    if (!u.hostname.endsWith(".autodesk360.com")) return null;
    const m = finalUrl.match(/(SH[A-Za-z0-9]+)/);
    if (!m) return null;
    // The doc name (from the share page <title>, "<name> - AUTODESK FUSION")
    // becomes the expected STL filename, which disambiguates the export email.
    let docName: string | null = null;
    const html = await res.text().catch(() => "");
    const t = html.match(/<title>([^<]*)<\/title>/i)?.[1];
    if (t) docName = t.replace(/\s*-\s*AUTODESK FUSION\s*$/i, "").trim() || null;
    return { host: u.hostname, shareId: m[1], docName };
  } catch {
    return null;
  }
}

// Kick off the STL export; Autodesk emails the link to `email`. Returns the
// job id from the success response.
export async function triggerStlExport(
  host: string,
  shareId: string,
  email: string,
): Promise<{ jobId: string }> {
  const url = `https://${host}/shares/download/${shareId}/?toFormat=stl&email=${encodeURIComponent(email)}`;
  const res = await fetch(url, { headers: { "User-Agent": UA } });
  const json = (await res.json().catch(() => null)) as {
    response?: { status?: string; jobId?: number | string };
  } | null;
  if (json?.response?.status !== "success") {
    throw new Error("Autodesk did not accept the export request.");
  }
  return { jobId: String(json.response.jobId) };
}

// The direct signed-resource CDN link Autodesk puts in the export email.
const SIGNED_LINK_RE =
  /https:\/\/cdn\.[a-z0-9.-]*autodesk\.com\/oss\/v2\/signedresources\/[^\s"'<>)]+/i;

function decodeB64Url(data: string): string {
  return Buffer.from(data.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString(
    "utf8",
  );
}

interface GmailPart {
  mimeType?: string;
  body?: { data?: string };
  parts?: GmailPart[];
}

function collectBody(part: GmailPart | undefined): string {
  if (!part) return "";
  let out = "";
  if (part.body?.data) out += decodeB64Url(part.body.data);
  for (const p of part.parts ?? []) out += collectBody(p);
  return out;
}

// Search the requester's inbox for the Autodesk "Download file" export email and
// extract the signed STL download link. `expectedFilename` (the Fusion doc
// name, e.g. "18MM M4 Extension (Assembly).stl") disambiguates when several
// exports are in flight; pass null to take the newest export email.
export async function findStlExportLink(
  userId: string,
  opts: { sinceMs?: number } = {},
): Promise<string | null> {
  const acc = await getGoogleAccount(userId);
  if (!acc?.access_token) return null;
  const token = await ensureFreshAccessToken(acc);
  if (!token) return null;

  const q = 'from:noreply@autodesk.com subject:"Download file" newer_than:2d';
  const listRes = await fetch(
    `https://gmail.googleapis.com/gmail/v1/users/me/messages?q=${encodeURIComponent(q)}&maxResults=15`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  if (!listRes.ok) return null;
  const list = (await listRes.json()) as { messages?: { id: string }[] };
  const refs = list.messages ?? [];

  for (const ref of refs) {
    const msgRes = await fetch(
      `https://gmail.googleapis.com/gmail/v1/users/me/messages/${ref.id}?format=full`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    if (!msgRes.ok) continue;
    const msg = (await msgRes.json()) as {
      internalDate?: string;
      payload?: GmailPart;
      snippet?: string;
    };
    if (opts.sinceMs && Number(msg.internalDate ?? 0) < opts.sinceMs) continue;
    const body = collectBody(msg.payload) + (msg.snippet ?? "");
    const link = body.match(SIGNED_LINK_RE)?.[0];
    if (link) return link;
  }
  return null;
}
