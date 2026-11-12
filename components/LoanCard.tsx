import type { ReactNode } from "react";
import { Badge } from "@/components/ui";
import type { LoanStatus } from "@/convex/lib/constants";
import {
  describeActivity,
  formatRange,
  loanBadge,
  type ActivityEntry,
} from "@/lib/display";

export type LoanCardData = {
  toolName: string;
  status: LoanStatus;
  startDate: string;
  endDate: string;
  counterpartName: string;
  counterpartIsTrusted: boolean;
  pickupNote?: string;
  activity: ActivityEntry[];
};

export function LoanCard({
  loan,
  counterpartLabel,
  actions,
}: {
  loan: LoanCardData;
  counterpartLabel: string;
  actions?: ReactNode;
}) {
  const badge = loanBadge(loan);
  const latest = loan.activity[0] ? describeActivity(loan.activity[0]) : null;

  return (
    <article className="rounded-xl border border-line bg-card p-5">
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
        <div>
          <h2 className="font-display text-lg font-semibold leading-snug">
            {loan.toolName}
          </h2>
          <p className="mt-0.5 text-sm text-ink-soft">
            <span className="font-mono text-[13px]">
              {formatRange(loan.startDate, loan.endDate)}
            </span>
            <span aria-hidden className="mx-1.5">
              ·
            </span>
            {counterpartLabel} {loan.counterpartName}
            {loan.counterpartIsTrusted && (
              <span className="ml-1.5 font-medium text-moss">Trusted Lender</span>
            )}
          </p>
        </div>
        <Badge tone={badge.tone}>{badge.label}</Badge>
      </div>

      {loan.pickupNote && (
        <p className="mt-3 rounded-lg bg-moss-soft px-3 py-2 text-sm text-moss-deep">
          <span className="font-medium">Pickup: </span>
          {loan.pickupNote}
        </p>
      )}

      {(latest || actions) && (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
          <p
            className={`font-mono text-xs ${
              latest?.isProblem ? "text-rust" : "text-ink-soft"
            }`}
          >
            {latest?.text}
          </p>
          {actions && <div className="flex gap-2">{actions}</div>}
        </div>
      )}
    </article>
  );
}
