"use client";

export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-6 py-24 text-center">
      <h1 className="text-3xl font-bold tracking-tight">Something went wrong</h1>
      <p className="mt-3 text-ink-soft">
        The board could not be loaded. Please try again in a moment.
      </p>
      <button
        onClick={reset}
        className="mt-6 self-center rounded-lg bg-brand px-4 py-2 font-semibold text-ink hover:bg-brand-deep"
      >
        Try again
      </button>
    </main>
  );
}
