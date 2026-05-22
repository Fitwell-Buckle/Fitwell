# Contributing

Last updated: 2026-05-22

Guidelines for adding new features and sections to the Fitwell admin platform. Follow these conventions to keep the codebase consistent and avoid architectural conflicts.

## Decisions That Require Discussion

Before implementing, discuss with Greg:

- **New database tables** — especially anything involving products, customers, or orders. These are shared entities with existing relationships. See "Schema Rules" below.
- **New external integrations** — any new API, service, or data source.
- **Structural changes** — new route groups, middleware changes, auth changes, new npm dependencies that affect the architecture.
- **Data model choices** that affect multiple sections — e.g., deciding how product state maps to order data.

When in doubt, ask. The cost of a quick discussion is much lower than untangling a wrong assumption later.

## Adding an Admin Page

All admin pages live in `src/app/(admin)/`. Each section gets its own folder.

### 1. Create the route

```
src/app/(admin)/your-section/page.tsx
```

### 2. Follow the page pattern

Every admin page follows this structure:

```tsx
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { PageHeader } from "@/components/ui/page-header";

export const metadata: Metadata = {
  title: "Your Section | Fitwell Admin",
};

export default async function YourSectionPage() {
  const session = await auth();
  if (!session) redirect("/auth/login");

  // Query data with Drizzle
  const data = await db.select()...

  return (
    <div>
      <PageHeader title="Your Section" />
      {/* Content here */}
    </div>
  );
}
```

Key conventions:
- **Server components by default** — only add `'use client'` when you need browser APIs or interactivity.
- **Auth check** — every page calls `auth()` and redirects if no session.
- **PageHeader** — use the shared `PageHeader` component for the page title.
- **Metadata** — set `title` for the browser tab, format: `"Section | Fitwell Admin"`.

### 3. Add the nav item

Edit `src/components/layout/admin-sidebar.tsx` and add to the `navItems` array:

```tsx
const navItems = [
  // ... existing items
  { href: "/your-section", label: "Your Section", icon: YourIcon },
];
```

- Pick an icon from [Lucide React](https://lucide.dev/icons/) — import it at the top of the file.
- The sidebar highlights items by matching `pathname.startsWith(item.href)`.
- Place your item in a logical position relative to existing items.

### 4. Sub-pages (detail views)

For sections with detail views (e.g., `/customers/[id]`):

```
src/app/(admin)/your-section/[id]/page.tsx
```

Follow the same auth + PageHeader pattern.

## UI Components

### Available components

| Component | Import from | Usage |
|-----------|------------|-------|
| `PageHeader` | `@/components/ui/page-header` | Page title |
| `Card`, `CardHeader`, `CardTitle`, `CardContent` | `@/components/ui/card` | Content containers |
| `Table`, `TableHeader`, `TableBody`, `TableRow`, `TableHead`, `TableCell` | `@/components/ui/table` | Data tables |
| `DataTable`, `Mono`, `Muted` | `@/components/ui/data-table` | Table wrapper with styling, monospace/muted text |
| `Badge` | `@/components/ui/badge` | Status badges and labels |
| `Button` | `@/components/ui/button` | Buttons (variants: default, destructive, outline, secondary, ghost) |
| `MetricCard` | `@/components/charts/metric-card` | KPI cards with trend indicators |
| `Input` | `@/components/ui/input` | Text inputs |

### Styling

- **Tailwind CSS** for all layout and styling.
- **`cn()` helper** from `@/lib/utils` for conditional class names — combines `clsx` + `tailwind-merge`.
- **No inline styles** — use Tailwind utility classes.
- **Consistent spacing** — pages use `mt-6` for content below the PageHeader, `space-y-5` for stacked cards.

### Formatting money

All money values are stored in **cents** (integers). Format for display:

```tsx
function fmt(cents: number) {
  return (cents / 100).toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
  });
}
```

## API Routes

Admin API routes live in `src/app/api/admin/[domain]/route.ts`.

### Pattern

```tsx
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";

export async function GET() {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const data = await db.select()...

  return NextResponse.json({ data });
}
```

- **Auth check** on every route.
- Return `{ data }` on success, `{ error }` on failure.
- Use **Zod** for validating request bodies and query params from external input.

## Schema Rules

The database schema lives in a **single file**: `src/lib/schema.ts`. All tables are defined here.

### The single-schema rule

Do not create separate schema files or duplicate existing entities. The platform has a shared data model:

- **`customer`** — synced from Shopify. If your feature involves customers, FK into this table.
- **`order`** / **`order_line_item`** — synced from Shopify. Product data currently lives here (title, SKU, variant, price).
- **`campaign`** — marketing campaigns. If your feature involves campaigns, reuse this table.

Before creating a new table, check whether the data already exists in an existing table or can be added as columns to one.

### Adding a new table

1. Define it in `src/lib/schema.ts` following existing patterns:
   - `text("id").primaryKey().$defaultFn(() => crypto.randomUUID())` for PKs
   - `timestamp("created_at", { mode: "date" }).defaultNow()` for timestamps
   - Use `text()` for IDs and enums, `integer()` for money (cents) and counts
   - Add indexes for columns you'll query by
2. Add Drizzle relations if the table FKs into existing tables
3. Run `npm run db:generate` to create the migration
4. Review the generated SQL in `drizzle/migrations/`
5. Run `npm run db:migrate` to apply locally
6. Update `specs/current/schema.md` with the new table documentation

### FK conventions

- Reference existing tables by their `id` column: `text("customer_id").references(() => customer.id)`
- Use `onDelete: "cascade"` for child records that don't make sense without their parent
- Add an index on every FK column

## Testing

- **Every feature ships with tests** — never defer to a later phase.
- Unit tests go alongside the code: `src/lib/your-module.test.ts`
- Run `npm run check` (TypeScript + Vitest) before considering anything done.
- See `specs/testing/test-cases.md` for existing test patterns.

## Git Workflow

**Never push directly to `main`.** Create a feature branch and open a pull request.

```bash
git checkout -b your-feature-name
# ... make changes, commit ...
git push -u origin your-feature-name
# then open a PR on GitHub
```

This doesn't slow you down — each developer has their own Neon database branch, so you can develop and test fully on your feature branch. PRs don't require approval gating — you can self-merge if you choose. The point is visibility: the team can see what changed and when.

## Deploying

- Merging a PR to `main` → Vercel auto-deploys (~40 seconds).
- **Database migrations** must be applied to production before deploying code that depends on them. Coordinate with Greg.
- Preview deployments are created automatically for pull requests — use them to verify your work before merging.

## File Checklist

When adding a new section, you'll typically touch:

- [ ] `src/app/(admin)/your-section/page.tsx` — the page
- [ ] `src/components/layout/admin-sidebar.tsx` — nav item
- [ ] `src/lib/schema.ts` — if adding tables (discuss with Greg first)
- [ ] `src/app/api/admin/your-section/route.ts` — if adding API routes
- [ ] `specs/current/routes.md` — document the new routes
- [ ] `specs/current/schema.md` — document any new tables
