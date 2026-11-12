"use client";

import { SignInButton, useAuth } from "@clerk/nextjs";
import { usePreloadedQuery, type Preloaded } from "convex/react";
import Link from "next/link";
import { Logo } from "@/components/Logo";
import { Button } from "@/components/ui";
import type { api } from "@/convex/_generated/api";
import { CATEGORY_LABELS } from "@/lib/display";

const FACTS = [
  {
    title: "Free between neighbors",
    body: "No fees, no deposits. You sort out the handover yourselves, and the owner can leave a pickup note.",
  },
  {
    title: "Up to 30 days",
    body: "Pick your dates and send a request. The owner approves or declines, and you hear back either way.",
  },
  {
    title: "A nudge when it's late",
    body: "If a loan runs past its end date, the borrower gets one reminder a day until it's back.",
  },
  {
    title: "Only your name is shown",
    body: "Neighbors see the name on your account. Your email stays private.",
  },
];

export function PublicBoard({
  preloadedTools,
}: {
  preloadedTools: Preloaded<typeof api.tools.listPublic>;
}) {
  const tools = usePreloadedQuery(preloadedTools);
  const { isSignedIn } = useAuth();

  const linkButton =
    "inline-flex items-center justify-center rounded-lg bg-brand font-semibold text-ink transition-colors hover:bg-brand-deep";

  return (
    <div className="mx-auto w-full max-w-5xl flex-1 px-5 sm:px-8">
      <header className="flex items-center justify-between py-5">
        <Logo />
        {isSignedIn ? (
          <Link href="/tools" className="text-sm font-medium text-ink underline-offset-4 hover:underline">
            Go to the board
          </Link>
        ) : (
          <SignInButton mode="modal" forceRedirectUrl="/tools">
            <Button variant="secondary">Sign in</Button>
          </SignInButton>
        )}
      </header>

      <main className="pb-16 pt-10 md:pt-16">
        <div className="grid items-start gap-12 md:grid-cols-[1.15fr_1fr] md:gap-14">
          <section>
            <h1 className="text-[2.75rem] font-bold leading-[1.02] tracking-tight sm:text-6xl">
              Borrow what you need.{" "}
              <span className="marker">Lend what you don&rsquo;t.</span>
            </h1>
            <p className="mt-6 max-w-md text-lg leading-relaxed text-ink-soft">
              A shared shelf for your street. List the ladder you use twice a
              year, borrow a tile saw for the weekend, and bring it back when
              you said you would.
            </p>
            <div className="mt-8">
              {isSignedIn ? (
                <Link href="/tools" className={`${linkButton} px-5 py-3`}>
                  Open the board
                </Link>
              ) : (
                <SignInButton mode="modal" forceRedirectUrl="/tools">
                  <Button className="px-5 py-3 text-base">Sign in to lend or borrow</Button>
                </SignInButton>
              )}
            </div>
          </section>

          <section
            aria-labelledby="board-heading"
            className="rounded-lg border border-line bg-card"
          >
            <div className="flex items-baseline justify-between border-b border-line px-5 py-3.5">
              <h2 id="board-heading" className="font-semibold">
                Available now
              </h2>
              <span className="text-sm text-ink-soft">
                {tools.length} {tools.length === 1 ? "tool" : "tools"}
              </span>
            </div>
            {tools.length === 0 ? (
              <p className="px-5 py-6 text-ink-soft">
                Nothing is listed yet. Sign in and be the first.
              </p>
            ) : (
              <ul className="divide-y divide-line">
                {tools.map((tool, index) => (
                  <li
                    key={`${tool.name}-${index}`}
                    className="flex items-center justify-between gap-4 px-5 py-2.5"
                  >
                    <span className="font-medium">{tool.name}</span>
                    <span className="shrink-0 text-sm text-ink-soft">
                      {CATEGORY_LABELS[tool.category]}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>

        <section aria-labelledby="how-heading" className="mt-20">
          <h2 id="how-heading" className="text-2xl font-bold tracking-tight">
            How it works
          </h2>
          <dl className="mt-6 grid gap-x-10 gap-y-6 sm:grid-cols-2">
            {FACTS.map((fact) => (
              <div key={fact.title} className="border-l-2 border-brand pl-4">
                <dt className="font-semibold">{fact.title}</dt>
                <dd className="mt-1 text-ink-soft">{fact.body}</dd>
              </div>
            ))}
          </dl>
        </section>
      </main>
    </div>
  );
}
