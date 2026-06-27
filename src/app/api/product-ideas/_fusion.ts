import { isAllowedFusionUrl, resolveFusionEmbed } from "@/lib/prototypes/fusion";

type Fields = { fusionUrl?: string | null; fusionEmbedUrl?: string | null };

/**
 * Turn the raw `fusionUrl` from an idea create/update payload into the columns
 * to write. Mirrors the prototype references flow: validate it's an Autodesk
 * host, then resolve the redirect to an embeddable viewer URL (best-effort —
 * a failed resolution still stores the raw link, just no inline preview).
 *
 *  - `undefined` → no change (field wasn't in the payload)
 *  - `null` / "" → clear both columns
 *  - a valid link → { fusionUrl, fusionEmbedUrl }
 *  - a non-Autodesk link → `{ ok: false, error }` (caller returns 400)
 */
export async function resolveIdeaFusion(
  raw: string | null | undefined,
): Promise<{ ok: true; fields: Fields } | { ok: false; error: string }> {
  if (raw === undefined) return { ok: true, fields: {} };
  const url = raw?.trim();
  if (!url) return { ok: true, fields: { fusionUrl: null, fusionEmbedUrl: null } };
  if (!isAllowedFusionUrl(url)) {
    return {
      ok: false,
      error:
        "Only Autodesk Fusion share links are supported (a360.co or autodesk360.com).",
    };
  }
  const resolved = await resolveFusionEmbed(url);
  return {
    ok: true,
    fields: { fusionUrl: url, fusionEmbedUrl: resolved?.embedUrl ?? null },
  };
}
