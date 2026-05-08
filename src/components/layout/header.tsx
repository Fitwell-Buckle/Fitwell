import Link from "next/link";

export function Header() {
  return (
    <header className="border-b bg-white">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        <Link href="/" className="text-xl font-bold tracking-tight">
          Fitwell Buckle Co.
        </Link>
        <nav className="hidden gap-6 md:flex">
          <Link
            href="/micro-adjust"
            className="text-sm text-zinc-600 hover:text-zinc-900"
          >
            Micro-Adjust
          </Link>
          <Link
            href="/for-brands"
            className="text-sm text-zinc-600 hover:text-zinc-900"
          >
            For Brands
          </Link>
          <Link
            href="/auth/login"
            className="text-sm text-zinc-600 hover:text-zinc-900"
          >
            Admin
          </Link>
        </nav>
      </div>
    </header>
  );
}
