import type { SectionTab } from "@/components/ui/section-tabs";

// Shared tab sets that present paired admin routes as one tabbed section.
// Imported by both pages in each pair so labels/links never drift.

export const LEADS_TABS: SectionTab[] = [
  { href: "/leads", label: "B2B Leads" },
  { href: "/messages", label: "Messages to Send" },
];

export const CUSTOMERS_TABS: SectionTab[] = [
  { href: "/customers", label: "Consumer" },
  { href: "/customers/brands", label: "B2B" },
];

export const ORDERS_TABS: SectionTab[] = [
  { href: "/orders", label: "Consumer" },
  { href: "/invoices", label: "B2B" },
];
