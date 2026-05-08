import Link from "next/link";

export function Footer() {
  return (
    <footer className="border-t bg-white">
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="flex flex-col items-center justify-between gap-4 sm:flex-row">
          <p className="text-sm text-zinc-500">
            &copy; {new Date().getFullYear()} Fitwell Buckle Co. All rights
            reserved.
          </p>
          <nav className="flex gap-4">
            <Link
              href="/privacy"
              className="text-sm text-zinc-500 hover:text-zinc-900"
            >
              Privacy
            </Link>
            <Link
              href="/terms"
              className="text-sm text-zinc-500 hover:text-zinc-900"
            >
              Terms
            </Link>
          </nav>
        </div>
      </div>
    </footer>
  );
}
