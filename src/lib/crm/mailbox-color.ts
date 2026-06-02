// Faded, per-mailbox color palette shared by the messaging interface and the
// notifications inbox so a given teammate's inbox is always the same color.
// Full Tailwind class strings (literals) so they survive the compiler.
export const MAILBOX_COLORS = [
  { stripe: "border-l-sky-300", tag: "bg-sky-50 text-sky-700", active: "bg-sky-600 text-white" },
  { stripe: "border-l-emerald-300", tag: "bg-emerald-50 text-emerald-700", active: "bg-emerald-600 text-white" },
  { stripe: "border-l-violet-300", tag: "bg-violet-50 text-violet-700", active: "bg-violet-600 text-white" },
  { stripe: "border-l-amber-300", tag: "bg-amber-50 text-amber-800", active: "bg-amber-600 text-white" },
  { stripe: "border-l-rose-300", tag: "bg-rose-50 text-rose-700", active: "bg-rose-600 text-white" },
  { stripe: "border-l-teal-300", tag: "bg-teal-50 text-teal-700", active: "bg-teal-600 text-white" },
] as const;

export type MailboxColor = (typeof MAILBOX_COLORS)[number];

// Deterministic color for a mailbox label — same person → same color regardless
// of order.
export function mailboxColor(label: string): MailboxColor {
  let h = 0;
  for (let i = 0; i < label.length; i++) h = (h * 31 + label.charCodeAt(i)) >>> 0;
  return MAILBOX_COLORS[h % MAILBOX_COLORS.length];
}
