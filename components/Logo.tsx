export function Logo() {
  return (
    <span className="inline-flex items-center gap-2 text-xl font-bold tracking-tight">
      <svg aria-hidden viewBox="0 0 32 32" className="h-7 w-7">
        <rect width="32" height="32" rx="7" fill="var(--color-brand)" />
        <path
          d="M11 11.5a6.5 6.5 0 1 0 0 9h10a6.5 6.5 0 1 0 0-9H11z"
          fill="none"
          stroke="var(--color-ink)"
          strokeWidth="2.6"
          strokeLinejoin="round"
        />
      </svg>
      LendLoop
    </span>
  );
}
