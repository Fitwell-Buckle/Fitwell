// Content for the end-user "Guides" section (Docs → Guides). Data-driven so the
// guides render consistently. Each step optionally has a `shot` — a description
// of the screenshot/video to capture; the matching asset goes in
// public/docs/guides/<slug>/<stepNumber>.png (or .mp4 for `video: true`) and
// appears automatically once added (see Figure).

export interface GuideStep {
  text: string;
  /** If set, a screenshot slot is rendered with this caption. */
  shot?: string;
  /** Render this step's asset as an animated .gif instead of a .png. */
  gif?: boolean;
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
        text: "Go to portal.fitwellbuckle.co and click “Sign in with Google”. Use your @fitwellbuckle.co account.",
        shot: "The login screen with the Sign in with Google button.",
      },
      {
        text: "You land on the Dashboard. The left sidebar is your main menu — it groups everything under Customers, Products, and Marketing, plus Data Sync, Settings, and Docs.",
        shot: "The dashboard with the left sidebar expanded.",
      },
      {
        text: "Under Customers you'll find Consumer List, B2B Customer List, B2B Orders, and Consumer Orders. Under Products you'll find the Product List, POs & Production, and Supplier List. (Incoming inventory and the standalone Purchase Orders list have both folded into POs & Production.)",
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
        text: "Go to Products → Supplier POs and click “New PO”.",
        shot: "The Supplier POs page with the New PO button.",
      },
      {
        text: "Pick the Supplier. If they're not listed, choose “Add new supplier” to create one inline. The PO number is assigned automatically (e.g. 00100).",
        shot: "The supplier dropdown showing the Add new supplier option.",
      },
      {
        text: "Set the Issued date and (optionally) an ETA, a Customer (the B2B buyer), and a Warehouse. A customer can also be added inline with “Add new customer”. In the Stage owners section you can assign each production stage to a different supplier (leave one as “PO supplier” to keep the default) — each supplier then sees only their stages in their portal.",
      },
      {
        text: "Add line items: click the product field, then type to search, or narrow by Collection and the size/colour chips. Pick a product, set the quantity and unit cost.",
        shot: "The product chooser open, showing the search box, collection selector, and size/colour chips.",
        gif: true,
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
        text: "Go to Products → POs & Production, then use the toggle in the top-right to switch to Production Board. It shows every in-progress line item as a card, in columns for each stage (Supplier PO → … → Complete).",
        shot: "The Production Board view with cards across stage columns.",
      },
      {
        text: "Drag a card to a different column to set its stage. If the PO is set to “advance together”, all its items move as one.",
        shot: "Dragging a card from one stage column to the next.",
        gif: true,
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
        text: "To advance one PO precisely, open it from Supplier POs → click the PO number, and use the Advance controls on its detail page. The detail page groups its reference content into tabs at the bottom — Items (cost breakdown on a master), Progress (the stage timeline), and Activity (notes + uploaded documents). The Advance controls and any sub-PO list stay above the tabs so they're always visible.",
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
        text: "Open the PO (Supplier POs → click the PO number). The stage history lives in the Progress tab at the bottom of the page — click it.",
        shot: "The Progress tab on the PO detail page.",
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
        text: "Go to Products → POs & Production — it opens on the Incoming Inventory view, which lists, per PO, how many units are in production (not yet received), broken down by stage, with the soonest projected ETA.",
        shot: "The POs & Production page on its Incoming Inventory view.",
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
        text: "Go to Products → Supplier List and click “Add supplier” (name, contact name/email). Save.",
        shot: "The supplier list with the Add supplier form.",
      },
      {
        text: "Don't remember the exact email? Use “Find this supplier in your Gmail” at the top of the form — type the company name, domain, or contact name, and pick from the matching results to fill the contact email (and contact name if it's still blank). It only searches your own mailbox, server-side, and only when you click Search.",
        shot: "The Find this supplier in your Gmail block with a search query and a results list.",
      },
      {
        text: "The supplier's Contact email is granted access automatically as soon as you save the supplier — they can sign in to the portal right away. To add teammates from the same vendor, click “Edit” on the supplier and use the “Additional supplier logins” card. Add as many as you like — one email maps to one supplier. The same Gmail search is available here too if you don't have the address handy.",
        shot: "The Additional supplier logins card with an email being added.",
      },
      {
        text: "That's it — those people can now sign in at /external/login with a magic link and see only that supplier's POs.",
      },
    ],
  },
  {
    slug: "supplier-portal",
    title: "What you can do",
    summary: "Everything you can do in your supplier portal.",
    category: "Suppliers",
    steps: [
      {
        text: "Go to /external/login and enter your authorized email — the one your Fitwell contact added for you. You'll get a one-time sign-in link by email; click it to sign in.",
        shot: "Your sign-in screen.",
      },
      {
        text: "After signing in you land on your production board — a kanban that shows only the stages you own (assigned per PO), with your line items in those stages, above your list of POs. You won't see pricing, customers, or other suppliers' work.",
        shot: "Your production board — your assigned stages only.",
      },
      {
        text: "When you finish your stage, drag the card into the next team's column to hand it off. That advances the line and notifies Fitwell automatically (an in-app alert plus an email) — no need to message anyone.",
      },
      {
        text: "Open any PO to advance its stages, add comments, and upload attachments (photos, certs, and the like). You can't change quantities or delete anything — reach out to your Fitwell contact if something needs to change.",
        shot: "A PO in your portal with the advance + upload controls.",
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
        text: "Go to Customers → B2B Customer List. First, create a Price tier (a name + a % off retail) in the Price tiers card — e.g. “Wholesale — 30% off”.",
        shot: "The Price tiers card with a tier being added.",
      },
      {
        text: "Click “Add brand”. Enter the name, assign a price tier, and (optionally) link a Shopify customer by searching their name/email. You can also set a default deposit % here — that's the share of every invoice we collect up front; the remainder bills on fulfillment. Leave it at 0 to default to single-payment invoices for this brand.",
        shot: "The brand form with the price-tier dropdown, customer search, and deposit % field.",
      },
      {
        text: "Once a brand is linked to a Shopify customer, its detail page shows a “Shopify addresses” card listing every saved address from Shopify, default first. That data syncs in automatically going forward; for brands linked before 2026-05-28, the addresses appear after the one-time Shopify address backfill runs.",
        shot: "The Shopify addresses card on a brand's detail page.",
      },
      {
        text: "The price tier you assign drives the pricing on that brand's invoices and in their B2B portal. The deposit % drives whether invoices to this brand are split into a deposit + balance — you can also override it on an individual invoice (see the invoicing guide).",
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
        text: "The form has a Deposit % (optional override) field next to Issued / Due. Leave it blank to follow the brand's default at send time, type 0 to waive the deposit on this invoice only, or set a different number to override just for this one — useful for a returning customer you're skipping the deposit for, or a new one you want to be stricter with.",
        shot: "The Deposit % override field on the invoice form, with the placeholder showing the brand's current default.",
      },
      {
        text: "While the invoice is a draft, the “Payment preview” card on its detail page shows what the customer will be billed when sent — the deposit due up front and the balance billed on fulfillment, or a single payment if no deposit applies. Once you Send, that card becomes “Collect Payment” with the deposit/balance rows and Mark-paid buttons.",
        shot: "The Payment preview card on a draft invoice.",
      },
      {
        text: "Click “Print & Send” (top right). On the preview you can edit the To address and add a personal message, then Send — it emails the brand a branded invoice (with a Pay online button) and, when the brand is linked to a Shopify customer, creates a Shopify payment link for Apple Pay / PayPal / card. If a deposit applies, the link bills only the deposit; the balance link is created later, when you mark the order fulfilled.",
        shot: "The Print & Send preview with the invoice document and message field.",
      },
      {
        text: "The printable invoice document spells out the deposit terms for the customer (e.g. “A 50% deposit is due now via the payment link. The remaining balance will be billed when your order is fulfilled.”) and includes your bank-wire details for ACH payers. It's identical on both the Print and Send pages.",
        shot: "The printable invoice document showing the deposit terms paragraph.",
      },
      {
        text: "Reference content on the invoice detail page lives in three tabs at the bottom: Attachments (upload the customer's own PDF PO or any other doc), Linked POs (the production PO this invoice came from, or a form to create one), and History (the timeline of when it was sent / deposit paid / fulfilled / balance paid). Payment terms, line items, and the Collect Payment / Payment preview card stay above the tabs.",
        shot: "The invoice detail page with the Attachments / Linked POs / History tabs.",
      },
      {
        text: "Mark the invoice Paid / Void from the Status dropdown in the header. For finer-grained tracking, use the “Mark deposit paid” and “Mark balance paid” buttons inside the Collect Payment card — they stamp the deposit/balance dates separately on the History timeline.",
      },
      {
        text: "Need to delete a mistaken invoice? The “Delete” button is in the top-right of the invoice detail page. A confirmation modal warns that the invoice's line items and attachments go with it, and that any linked Shopify draft order (the customer's pay link) is NOT auto-revoked — handle that in Shopify Admin if it matters.",
        shot: "The Delete confirmation modal for an invoice.",
      },
      {
        text: "Need to produce what was ordered? On the invoice's Linked POs tab, click “Create Linked PO” and pick a supplier — it drafts a production PO from the invoice's lines.",
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
        text: "The brand's contact email is granted access automatically the moment you save the brand. To add additional buyers from the same brand, go to Customers → B2B Customer List → Edit the brand and use the “Additional B2B portal logins” card.",
        shot: "The Additional B2B portal logins card on a brand.",
      },
      {
        text: "The buyer signs in at /portal/login with a magic link, then browses the catalog at their tier price, builds a cart, and checks out.",
        shot: "The B2B portal order page with the catalog search and cart.",
        gif: true,
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
    summary: "Show wire info on invoices for ACH/wire payers.",
    category: "B2B & invoicing",
    steps: [
      {
        text: "Go to Customers → B2B Orders and click “Setup”.",
        shot: "The Wire info Setup button on the B2B Orders page.",
      },
      {
        text: "Enter your bank-wire / ACH details as free text (line breaks and bold are preserved), then Save. They appear on the invoice detail, the printable invoice, and the invoice email.",
      },
    ],
  },
];

export function getGuide(slug: string): Guide | undefined {
  return guides.find((g) => g.slug === slug);
}
