import { sendEmail } from "./resend";

/**
 * Deliver a supplier-portal magic sign-in link.
 *
 * In production (RESEND_API_KEY set) this emails the link. Locally, where
 * Resend isn't configured, it logs the link to the server console so the
 * magic-link flow still works in development. The signIn callback has already
 * authorized the address before this runs, so we never email a stranger.
 */
export async function sendMagicLinkEmail(to: string, url: string): Promise<void> {
  if (!process.env.RESEND_API_KEY) {
    // eslint-disable-next-line no-console
    console.log(
      `\n──────────────────────────────────────────────\n` +
        `Magic sign-in link for ${to}:\n${url}\n` +
        `(RESEND_API_KEY not set — link logged for local dev)\n` +
        `──────────────────────────────────────────────\n`,
    );
    return;
  }

  const { host } = new URL(url);
  await sendEmail({
    to,
    subject: `Sign in to ${host}`,
    html: buildHtml(url, host),
  });
}

function buildHtml(url: string, host: string): string {
  return `
  <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:480px;margin:0 auto;padding:24px;color:#18181b">
    <h1 style="font-size:18px;font-weight:600;margin:0 0 12px">Sign in to ${host}</h1>
    <p style="font-size:14px;line-height:1.5;color:#52525b;margin:0 0 20px">
      Click the button below to sign in to the supplier portal. This link expires in 1 hour and can be used once.
    </p>
    <a href="${url}"
       style="display:inline-block;background:#18181b;color:#fff;text-decoration:none;font-size:14px;font-weight:500;padding:10px 20px;border-radius:6px">
      Sign in
    </a>
    <p style="font-size:12px;line-height:1.5;color:#a1a1aa;margin:20px 0 0">
      If you didn't request this, you can safely ignore this email.
    </p>
  </div>`;
}
