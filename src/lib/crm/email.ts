// Email-domain helpers used to link leads to companies.
//
// "Free" providers (gmail.com, yahoo.com, etc.) are explicitly excluded from
// company-matching: otherwise everyone with a gmail.com address would collide
// into one phantom "company." If a contact actually uses a free email, the
// user can still link them to a company manually from the lead detail page.

const FREE_EMAIL_DOMAINS = new Set([
  "gmail.com",
  "googlemail.com",
  "yahoo.com",
  "yahoo.co.uk",
  "yahoo.fr",
  "ymail.com",
  "hotmail.com",
  "hotmail.co.uk",
  "hotmail.fr",
  "outlook.com",
  "live.com",
  "msn.com",
  "icloud.com",
  "me.com",
  "mac.com",
  "aol.com",
  "proton.me",
  "protonmail.com",
  "pm.me",
  "gmx.com",
  "gmx.de",
  "fastmail.com",
  "fastmail.fm",
  "zoho.com",
  "yandex.com",
  "yandex.ru",
  "mail.com",
  "mail.ru",
  "qq.com",
  "163.com",
  "126.com",
]);

// Returns the lowercase domain portion of an email address, or null if the
// input isn't a recognizable email.
export function extractEmailDomain(email: string | null | undefined): string | null {
  if (!email) return null;
  const trimmed = email.trim().toLowerCase();
  const at = trimmed.lastIndexOf("@");
  if (at <= 0 || at === trimmed.length - 1) return null;
  const domain = trimmed.slice(at + 1);
  if (!domain.includes(".")) return null;
  if (/\s/.test(domain)) return null;
  return domain;
}

// Returns true when a domain belongs to a public/free email provider and
// shouldn't anchor a company match.
export function isFreeEmailDomain(domain: string | null | undefined): boolean {
  if (!domain) return false;
  return FREE_EMAIL_DOMAINS.has(domain.toLowerCase());
}

// Convenience: returns the domain only if it's a "company-shaped" domain.
// Use when deciding whether to look for a matching company.
export function companyEmailDomain(
  email: string | null | undefined,
): string | null {
  const d = extractEmailDomain(email);
  if (!d || isFreeEmailDomain(d)) return null;
  return d;
}
