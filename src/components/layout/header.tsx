import Image from "next/image";
import Link from "next/link";

export function Header() {
  return (
    <header className="border-b border-brand-border bg-brand">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        <Link href="/">
          <Image
            src="/images/fitwell-logo.png"
            alt="Fitwell Buckle Co."
            width={150}
            height={36}
            priority
            // Brand wordmark is black on white; invert for this dark header so
            // it renders as the expected white-on-navy.
            className="invert"
          />
        </Link>
        <nav className="hidden gap-6 md:flex">
          <Link
            href="/micro-adjust"
            className="text-sm text-zinc-400 hover:text-white"
          >
            Micro-Adjust
          </Link>
          <Link
            href="/for-brands"
            className="text-sm text-zinc-400 hover:text-white"
          >
            For Brands
          </Link>
          <Link
            href="/auth/login"
            className="text-sm text-zinc-400 hover:text-white"
          >
            Admin
          </Link>
        </nav>
      </div>
    </header>
  );
}
