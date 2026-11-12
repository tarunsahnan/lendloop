"use client";

import { SignInButton, useAuth } from "@clerk/nextjs";
import { usePreloadedQuery, type Preloaded } from "convex/react";
import Link from "next/link";
import { Logo } from "@/components/Logo";
import { Button } from "@/components/ui";
import type { api } from "@/convex/_generated/api";
import { CATEGORY_LABELS } from "@/lib/display";

const STEPS = [
  {
    title: "List what you can spare",
    body: "Add a tool with its category, condition and a short note on what comes with it.",
  },
  {
    title: "Request the days you need",
    body: "Pick a date range. The owner hears about it right away, and you get a notice when they decide.",
  },
  {
    title: "Bring it back on time",
    body: "The owner marks it returned. A late loan gets a friendly reminder each day until then.",
  },
];

export function PublicBoard({
  preloadedTools,
}: {
  preloadedTools: Preloaded<typeof api.tools.listPublic>;
}) {
  const tools = usePreloadedQuery(preloadedTools);
  const { isSignedIn } = useAuth();

  const cta = isSignedIn ? (
    <Link
      href="/tools"
      className="inline-flex items-center justify-center rounded-lg bg-moss px-4 py-2.5 font-medium text-card transition-colors hover:bg-moss-deep"
    >
      Open the board
    </Link>
  ) : (
    <SignInButton mode="modal" forceRedirectUrl="/tools">
      <Button className="px-4 py-2.5 text-base">Sign in to lend or borrow</Button>
    </SignInButton>
  );

  return (
    <div className="mx-auto w-full max-w-5xl flex-1 px-5 py-6 sm:px-8">
      <header className="flex items-center justify-between">
        <Logo />
      </header>

      <main className="py-14 md:py-20">
        <div className="grid gap-12 md:grid-cols-[1.1fr_1fr] md:gap-16">
          <section>
            <h1 className="font-display text-5xl font-semibold leading-[1.05] tracking-tight sm:text-6xl">
              Borrow what you need.
              <br />
              <span className="text-moss">Lend what you don&rsquo;t.</span>
            </h1>
            <p className="mt-6 max-w-md text-lg text-ink-soft">
              The drill in your garage gets used for thirteen minutes a year.
              LendLoop lets the neighbors share it the rest of the time.
            </p>
            <div className="mt-8">{cta}</div>
          </section>

          <section aria-labelledby="board-heading">
            <div className="rounded-2xl border border-line bg-card p-6">
              <h2
                id="board-heading"
                className="font-mono text-xs uppercase tracking-wider text-ink-soft"
              >
                On the board now
              </h2>
              {tools.length === 0 ? (
                <p className="mt-5 text-ink-soft">
                  Nothing is listed yet. Sign in and be the first.
                </p>
              ) : (
                <ul className="mt-4">
                  {tools.map((tool, index) => (
                    <li
                      key={`${tool.name}-${index}`}
                      className="flex items-baseline gap-2 py-1.5"
                    >
                      <span className="font-medium">{tool.name}</span>
                      <span aria-hidden className="leader" />
                      <span className="text-sm text-ink-soft">
                        {CATEGORY_LABELS[tool.category]}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </section>
        </div>

        <section
          aria-labelledby="how-heading"
          className="mt-16 border-t border-line pt-12 md:mt-24"
        >
          <h2
            id="how-heading"
            className="font-display text-2xl font-semibold tracking-tight"
          >
            How LendLoop works
          </h2>
          <ol className="mt-6 grid gap-6 sm:grid-cols-3 sm:gap-8">
            {STEPS.map((step, index) => (
              <li key={step.title}>
                <span aria-hidden className="font-mono text-xs text-moss">
                  {String(index + 1).padStart(2, "0")}
                </span>
                <h3 className="mt-2 font-medium">{step.title}</h3>
                <p className="mt-1 text-sm text-ink-soft">{step.body}</p>
              </li>
            ))}
          </ol>
        </section>
      </main>
    </div>
  );
}
