// Builds the "Request for Quote" email sent to a candidate vendor for a
// prototype. Pure (returns an HTML string) so it's unit-testable; the route
// sends it via the shared PO email path (`sendEmail`/Resend), reply-to the
// requesting admin so quotes come straight back to them.

export interface RfqEmailInput {
  vendorName: string;
  prototypeName: string;
  proposedSku: string | null;
  description: string | null;
  // Optional free-text note from the requester (terms, target volume, etc.).
  message: string | null;
  // Autodesk Fusion share links attached to the prototype (CAD references).
  fusionLinks: { url: string; title: string | null }[];
}

function esc(s: string): string {
  return s.replace(/[&<>"]/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c] as string,
  );
}

export function buildRfqEmailHtml(input: RfqEmailInput): string {
  const cell = "padding:2px 16px 2px 0;color:#888;font-size:13px;";
  const rows: string[] = [
    `<tr><td style="${cell}">Vendor</td><td style="font-size:13px;">${esc(input.vendorName)}</td></tr>`,
    `<tr><td style="${cell}">Prototype</td><td style="font-size:13px;">${esc(input.prototypeName)}</td></tr>`,
  ];
  if (input.proposedSku) {
    rows.push(
      `<tr><td style="${cell}">Proposed SKU</td><td style="font-size:13px;font-family:monospace;">${esc(input.proposedSku)}</td></tr>`,
    );
  }

  const specHtml = input.description
    ? `<h3 style="margin:20px 0 6px;font-size:14px;">Spec</h3>
       <p style="margin:0;white-space:pre-line;font-size:13px;color:#333;">${esc(input.description)}</p>`
    : "";

  const linksHtml =
    input.fusionLinks.length > 0
      ? `<h3 style="margin:20px 0 6px;font-size:14px;">CAD reference${input.fusionLinks.length > 1 ? "s" : ""}</h3>
         <ul style="margin:0;padding-left:18px;font-size:13px;">${input.fusionLinks
           .map(
             (l) =>
               `<li><a href="${esc(l.url)}" style="color:#2563eb;">${esc(l.title || "Fusion design")}</a></li>`,
           )
           .join("")}</ul>`
      : "";

  const messageHtml = input.message
    ? `<p style="margin:0 0 16px;white-space:pre-line;font-size:14px;color:#111;">${esc(input.message)}</p>`
    : "";

  return `<div style="font-family:Arial,Helvetica,sans-serif;color:#111;max-width:680px;">
    <h2 style="margin:0 0 4px;">Request for Quote</h2>
    <p style="margin:0 0 16px;color:#666;font-size:13px;">Fitwell Buckle Co.</p>
    ${messageHtml}
    <p style="margin:0 0 16px;font-size:14px;color:#111;">
      Hi ${esc(input.vendorName)}, we'd like a quote for the prototype below.
    </p>
    <table style="margin-bottom:8px;">${rows.join("")}</table>
    ${specHtml}
    ${linksHtml}
    <h3 style="margin:20px 0 6px;font-size:14px;">Please quote</h3>
    <ul style="margin:0;padding-left:18px;font-size:13px;color:#333;">
      <li>Unit price</li>
      <li>Lead time</li>
      <li>Minimum order quantity (MOQ)</li>
      <li>Tooling / sample cost (if any)</li>
    </ul>
    <p style="margin:20px 0 0;font-size:13px;color:#444;">
      Just reply to this email with your quote. Thank you!
    </p>
  </div>`;
}
