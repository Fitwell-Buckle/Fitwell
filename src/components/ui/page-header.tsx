export function PageHeader({ title }: { title: string }) {
  // Wrap the h1 in a fixed-height flex row so the page-header zone is the
  // same height (36px = h-9) regardless of whether the page renders
  // action buttons alongside it. Without this, switching SectionTabs between
  // pages that have buttons (e.g. Leads) and pages that don't (e.g. Next
  // Steps) shifts everything below the header by a few px.
  return (
    <div className="flex h-9 items-center">
      <h1 className="text-xl font-semibold tracking-tight text-zinc-900">
        {title}
      </h1>
    </div>
  );
}
