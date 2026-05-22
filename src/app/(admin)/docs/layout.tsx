import { DocsNav } from "./docs-nav";

export default function DocsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div>
      <DocsNav />
      <div className="mt-6">{children}</div>
    </div>
  );
}
