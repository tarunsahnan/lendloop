import type { Metadata } from "next";
import Link from "next/link";
import { Logo } from "@/components/Logo";

export const metadata: Metadata = { title: "Page not found" };

export default function NotFound() {
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col items-center justify-center px-6 py-24 text-center">
      <Link href="/" aria-label="LendLoop home">
        <Logo />
      </Link>
      <h1 className="mt-10 font-display text-3xl font-semibold">Page not found</h1>
      <p className="mt-3 text-ink-soft">
        That page isn&rsquo;t on the board. The link may be old or mistyped.
      </p>
      <Link
        href="/"
        className="mt-6 rounded-lg bg-moss px-4 py-2 font-medium text-card transition-colors hover:bg-moss-deep"
      >
        Back to LendLoop
      </Link>
    </main>
  );
}
