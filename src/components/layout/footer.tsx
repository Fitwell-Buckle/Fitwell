import Image from "next/image";
import Link from "next/link";

export function Footer() {
  return (
    <footer className="border-t border-brand-border bg-brand">
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="flex flex-col items-center justify-between gap-4 sm:flex-row">
          <div className="flex items-center gap-4">
            <Image
              src="/images/fitwell-logo.png"
              alt="Fitwell Buckle Co."
              width={100}
              height={24}
              // Brand wordmark is black on white; invert for this dark footer.
              className="invert"
            />
            <p className="text-sm text-zinc-500">
              &copy; {new Date().getFullYear()} All rights reserved.
            </p>
          </div>
          <nav className="flex gap-4">
            <Link
              href="/privacy"
              className="text-sm text-zinc-500 hover:text-white"
            >
              Privacy
            </Link>
            <Link
              href="/terms"
              className="text-sm text-zinc-500 hover:text-white"
            >
              Terms
            </Link>
          </nav>
        </div>
      </div>
    </footer>
  );
}
