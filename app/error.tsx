"use client";

export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-6 py-24 text-center">
      <h1 className="font-display text-3xl font-semibold">Something went wrong</h1>
      <p className="mt-3 text-ink-soft">
        The board could not be loaded. Please try again in a moment.
      </p>
      <button
        onClick={reset}
        className="mt-6 self-center rounded-lg bg-moss px-4 py-2 font-medium text-card hover:bg-moss-deep"
      >
        Try again
      </button>
    </main>
  );
}
