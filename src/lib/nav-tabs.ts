import type { SectionTab } from "@/components/ui/section-tabs";

// Shared tab sets that present paired admin routes as one tabbed section.
// Imported by both pages in each pair so labels/links never drift.

export const LEADS_TABS: SectionTab[] = [
  { href: "/leads", label: "Leads" },
  { href: "/messages", label: "Next Steps" },
];

export const CUSTOMERS_TABS: SectionTab[] = [
  { href: "/customers/brands", label: "B2B" },
  { href: "/customers", label: "Consumer" },
];

export const ORDERS_TABS: SectionTab[] = [
  { href: "/invoices", label: "B2B" },
  { href: "/orders", label: "Consumer" },
];

export const PRODUCTS_TABS: SectionTab[] = [
  { href: "/products", label: "Products" },
  { href: "/products/cad-models", label: "CAD Models" },
];
