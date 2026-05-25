// Content for the end-user "Guides" section (Docs → Guides). Data-driven so the
// guides render consistently. Each step optionally has a `shot` — a description
// of the screenshot/video to capture; the matching asset goes in
// public/docs/guides/<slug>/<stepNumber>.png (or .mp4 for `video: true`) and
// appears automatically once added (see Figure).

export interface GuideStep {
  text: string;
  /** If set, a screenshot/video slot is rendered with this caption. */
  shot?: string;
  /** Use an .mp4 instead of a .png for this step's asset. */
  video?: boolean;
}

export interface Guide {
  slug: string;
  title: string;
  summary: string;
  category: string;
  steps: GuideStep[];
}

// Display order for the index.
export const guideCategories = [
  "Getting started",
  "Production",
  "Suppliers",
  "B2B & invoicing",
] as const;

export const guides: Guide[] = [
  {
    slug: "getting-around",
    title: "Signing in & getting around",
    summary: "Log in to the admin dashboard and find your way around the sidebar.",
    category: "Getting started",
    steps: [
      {
        text: "Go to admin.fitwellbuckle.co and click “Sign in with Google”. Use your @fitwellbuckle.co account.",
        shot: "The login screen with the Sign in with Google button.",
      },
      {
        text: "You land on the Dashboard. The left sidebar is your main menu — it groups everything under Customers, Products, and Marketing, plus Data Sync, Settings, and Docs.",
        shot: "The dashboard with the left sidebar expanded.",
      },
      {
        text: "Under Customers you'll find Consumer List, B2B Brand List, B2B Orders, and Consumer Orders. Under Products you'll find the Product List, Purchase Orders, Production Summary, and Suppliers. (Incoming inventory now lives inside Production Summary.)",
        shot: "The Products group expanded in the sidebar.",
      },
    ],
  },
  {
    slug: "create-po",
    title: "Create a purchase order",
    summary: "Raise a PO to a supplier with line items, using the product search.",
    category: "Production",
    steps: [
      {
        text: "Go to Products → Purchase Orders and click “New PO”.",
        shot: "The Purchase Orders page with the New PO button.",
      },
      {
        text: "Pick the Supplier. If they're not listed, choose “Add new supplier” to create one inline. The PO number is assigned automatically (e.g. 00100).",
        shot: "The supplier dropdown showing the Add new supplier option.",
      },
      {
        text: "Set the Issued date and (optionally) an ETA, a Brand (the B2B buyer), and a Warehouse. A brand can also be added inline with “Add new brand”.",
      },
      {
        text: "Add line items: click the product field, then type to search, or narrow by Collection and the size/colour chips. Pick a product, set the quantity and unit cost.",
        shot: "The product chooser open, showing the search box, collection selector, and size/colour chips.",
        video: true,
      },
      {
        text: "Add more lines with “Add line”. Each line can override the PO's brand/warehouse. Review the total, then click “Create PO”.",
        shot: "A PO with two line items and the running total.",
      },
    ],
  },
  {
    slug: "track-production",
    title: "Track production & advance stages",
    summary: "Use the board to move batches through the production stages.",
    category: "Production",
    steps: [
      {
        text: "Go to Products → Production Summary, then use the toggle in the top-right to switch to Production Board. It shows every in-progress line item as a card, in columns for each stage (Supplier PO → … → Complete).",
        shot: "The Production Board view with cards across stage columns.",
      },
      {
        text: "Drag a card to a different column to set its stage. If the PO is set to “advance together”, all its items move as one.",
        shot: "Dragging a card from one stage column to the next.",
        video: true,
      },
      {
        text: "Use the filters above the board (supplier, status, stage, size, colour) to focus the Board and Timeline views.",
        shot: "The filter bar with a size and colour filter applied.",
      },
      {
        text: "Switch the toggle to Production Timeline to see each line item's actual stage history plus a projected finish (ETA) based on cycle-time estimates.",
        shot: "The Production Timeline view with coloured stage bars and ETA labels.",
      },
      {
        text: "To advance one PO precisely, open it from Purchase Orders → click the PO number, and use the Advance controls on its detail page.",
      },
    ],
  },
  {
    slug: "edit-stage-dates",
    title: "Correct a stage's date",
    summary: "Fix when a batch entered a production stage.",
    category: "Production",
    steps: [
      {
        text: "Open the PO (Purchase Orders → click the PO number) and find the “Stage timeline” card.",
        shot: "The Stage timeline card on the PO detail page.",
      },
      {
        text: "Click “Edit dates”. Each stage's date becomes editable.",
      },
      {
        text: "Change a date and click “Save dates”. The date can't be earlier than the previous stage or later than the next one — the system keeps the timeline in order and updates the Gantt + ETA estimates.",
        shot: "The stage timeline in edit mode with a date input open.",
      },
    ],
  },
  {
    slug: "receive",
    title: "Receive a finished PO into Shopify",
    summary: "Push completed quantities into Shopify inventory.",
    category: "Production",
    steps: [
      {
        text: "When every line item on a PO reaches Complete, open the PO. A “Receive into Shopify” panel appears.",
        shot: "The Receive into Shopify panel on a complete PO.",
      },
      {
        text: "Click “Receive into Shopify”. Each line's quantity is added to its warehouse in Shopify as an inventory adjustment, tagged with the PO number. Each line is received once, so it's safe to re-run.",
      },
      {
        text: "Lines that can't be received (no Shopify variant or no warehouse) are listed so you can fix them; the PO is marked fully received once every line lands.",
        shot: "The receive result showing received vs skipped lines.",
      },
    ],
  },
  {
    slug: "inventory",
    title: "Check incoming inventory",
    summary: "See what's in production and when it's expected.",
    category: "Production",
    steps: [
      {
        text: "Go to Products → Production Summary — it opens on the Incoming Inventory view, which lists, per SKU, how many units are in production (not yet received), broken down by stage, with the soonest projected ETA.",
        shot: "The Production Summary page on its Incoming Inventory view.",
      },
      {
        text: "The Product List page also shows an “Incoming” column per SKU, alongside units sold and revenue.",
        shot: "The Product List with the Incoming column.",
      },
    ],
  },
  {
    slug: "suppliers",
    title: "Add a supplier & invite them",
    summary: "Create a supplier and give their team portal access.",
    category: "Suppliers",
    steps: [
      {
        text: "Go to Products → Suppliers and click “Add supplier” (name, contact name/email). Save.",
        shot: "The supplier list with the Add supplier form.",
      },
      {
        text: "Click “Edit” on the supplier. In the “Authorized logins” card, add the email of anyone at the vendor who should access the portal. Add as many as you like — one email maps to one supplier.",
        shot: "The Authorized logins card with an email being added.",
      },
      {
        text: "That's it — those people can now sign in at /supplier/login with a magic link and see only that supplier's POs.",
      },
    ],
  },
  {
    slug: "supplier-portal",
    title: "What suppliers can do (portal)",
    summary: "Share this with your suppliers so they can self-serve.",
    category: "Suppliers",
    steps: [
      {
        text: "Suppliers go to /supplier/login and enter their authorized email. They receive a one-time sign-in link by email.",
        shot: "The supplier login screen.",
      },
      {
        text: "After signing in they see only their own purchase orders — no pricing, customers, or brand info.",
        shot: "The supplier portal PO list.",
      },
      {
        text: "Opening a PO, a supplier can advance its stages, add comments, and upload attachments (e.g. photos, certs). They can't edit quantities or delete anything.",
        shot: "A PO in the supplier portal with the advance + upload controls.",
      },
    ],
  },
  {
    slug: "companies",
    title: "Set up B2B brands & price tiers",
    summary: "Create brands and the discounts they get off retail.",
    category: "B2B & invoicing",
    steps: [
      {
        text: "Go to Customers → B2B Brand List. First, create a Price tier (a name + a % off retail) in the Price tiers card — e.g. “Wholesale — 30% off”.",
        shot: "The Price tiers card with a tier being added.",
      },
      {
        text: "Click “Add brand”. Enter the name, assign a price tier, and (optionally) link a Shopify customer by searching their name/email.",
        shot: "The brand form with the price-tier dropdown and customer search.",
      },
      {
        text: "The price tier you assign drives the pricing on that brand's invoices and in their B2B portal.",
      },
    ],
  },
  {
    slug: "invoicing",
    title: "Invoice a brand & take payment",
    summary: "Create or generate an invoice, send it, and get paid.",
    category: "B2B & invoicing",
    steps: [
      {
        text: "Go to Customers → B2B Orders → “New order”. Pick the brand (the tier discount applies automatically), add line items with the product search, and Create. The B2B Orders list also shows each order's due date and a Production ETA (green if production finishes on time, red if late).",
        shot: "The new invoice form with line items and the discounted total.",
      },
      {
        text: "Or generate one from production: open a PO and click “Create invoice”. It makes one invoice per bill-to brand on the PO, priced at retail minus that brand's tier.",
        shot: "The Create invoice button on a PO.",
      },
      {
        text: "On the invoice, click “Print & Send” (top right). On the preview you can add a personal message, then Send — it emails the brand a branded invoice (with a Pay online button) and, when the brand is linked to a Shopify customer, creates a Shopify payment link for Apple Pay / PayPal / card.",
        shot: "The Print & Send preview with the invoice document and message field.",
      },
      {
        text: "The same Print & Send screen prints a copy (the document includes the bank-wire details for ACH payers). Mark the invoice Paid / Void from the Status dropdown in the Actions card.",
        shot: "The printable invoice document.",
      },
      {
        text: "Need to produce what was ordered? On the invoice, click “Create PO” and pick a supplier — it drafts a production PO from the invoice's lines.",
      },
    ],
  },
  {
    slug: "company-portal",
    title: "Let a brand order themselves",
    summary: "Invite a buyer to self-serve at their pricing.",
    category: "B2B & invoicing",
    steps: [
      {
        text: "Go to Customers → B2B Brand List → Edit the brand. In the “Portal logins” card, add the buyer's email.",
        shot: "The Portal logins card on a brand.",
      },
      {
        text: "The buyer signs in at /portal/login with a magic link, then browses the catalog at their tier price, builds a cart, and checks out.",
        shot: "The B2B portal order page with the catalog search and cart.",
        video: true,
      },
      {
        text: "Checkout sends them to Shopify to pay (Apple Pay / PayPal / card) at their discount; the order also appears for you under B2B Orders. The buyer can see their own order history under Orders in the portal.",
        shot: "The portal Orders page with pay links.",
      },
    ],
  },
  {
    slug: "settings-remittance",
    title: "Set your bank-wire details",
    summary: "Show remittance info on invoices for ACH/wire payers.",
    category: "B2B & invoicing",
    steps: [
      {
        text: "Go to Settings → “Remittance / bank-wire details”.",
        shot: "The remittance details form in Settings.",
      },
      {
        text: "Fill in your bank name, account name/number, routing/ABA, SWIFT/IBAN, and any instructions, then Save. These appear on the invoice detail, the printable invoice, and the invoice email.",
      },
    ],
  },
];

export function getGuide(slug: string): Guide | undefined {
  return guides.find((g) => g.slug === slug);
}
