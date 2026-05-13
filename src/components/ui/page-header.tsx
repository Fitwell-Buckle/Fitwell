export function PageHeader({ title }: { title: string }) {
  return (
    <h1 className="text-xl font-semibold tracking-tight text-zinc-900">
      {title}
    </h1>
  );
}
