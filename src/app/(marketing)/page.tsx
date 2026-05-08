import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function HomePage() {
  return (
    <section className="mx-auto max-w-4xl px-4 py-24 text-center sm:px-6 lg:px-8">
      <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">
        Precision Watch Buckle Analytics
      </h1>
      <p className="mx-auto mt-6 max-w-2xl text-lg text-zinc-600">
        The Fitwell digital platform — analytics, attribution, and customer
        intelligence for precision micro-adjust watch buckles.
      </p>
      <div className="mt-10 flex justify-center gap-4">
        <Button asChild>
          <Link href="/auth/login">Admin Login</Link>
        </Button>
        <Button variant="outline" asChild>
          <Link href="/micro-adjust">Learn More</Link>
        </Button>
      </div>
    </section>
  );
}
