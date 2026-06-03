// Pure helpers for building the HTML alternative part of an outgoing email —
// used by the Gmail send path to carry an invisible open-tracking pixel. No IO,
// so it's unit-testable in isolation.

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// Render a plain-text email body as minimal HTML, preserving line breaks, with
// an optional invisible tracking pixel appended. The pixel is hidden every way
// that matters (display:none + 1px) so it never shows, even if a client ignores
// one attribute.
export function plainTextToHtml(
  body: string,
  pixelUrl?: string | null,
): string {
  const safe = escapeHtml(body).replace(/\r?\n/g, "<br>\n");
  const pixel = pixelUrl
    ? `<img src="${escapeHtml(pixelUrl)}" width="1" height="1" alt="" ` +
      `style="display:none;border:0;width:1px;height:1px;max-height:0;max-width:0;overflow:hidden;" />`
    : "";
  return (
    `<!doctype html><html><body>` +
    `<div style="white-space:normal;">${safe}</div>${pixel}` +
    `</body></html>`
  );
}
