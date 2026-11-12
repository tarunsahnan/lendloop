import { LIMITS, type LoanStatus } from "./constants";
import { addDays, daysBetween, isIsoDate } from "./dates";
import { fail } from "./errors";

const TRANSITIONS: Record<LoanStatus, readonly LoanStatus[]> = {
  requested: ["approved", "declined", "cancelled"],
  approved: ["returned", "cancelled"],
  declined: [],
  cancelled: [],
  returned: [],
};

/** Dates are UTC. One day of grace keeps a user west of UTC from being rejected for picking their local today. */
const START_GRACE_DAYS = 1;
const OPEN_ENDED = "9999-12-31";

export function canTransition(from: LoanStatus, to: LoanStatus): boolean {
  return TRANSITIONS[from].includes(to);
}

export function assertTransition(from: LoanStatus, to: LoanStatus): void {
  if (!canTransition(from, to)) fail("INVALID_TRANSITION");
}

export function isStartAllowed(startDate: string, today: string): boolean {
  return startDate >= addDays(today, -START_GRACE_DAYS);
}

export function assertValidRange(
  startDate: string,
  endDate: string,
  today: string,
): void {
  if (!isIsoDate(startDate) || !isIsoDate(endDate)) fail("INVALID_DATES");
  if (endDate < startDate) fail("INVALID_DATES");
  if (daysBetween(startDate, endDate) >= LIMITS.loanMaxDays) {
    fail("INVALID_DATES");
  }
  if (!isStartAllowed(startDate, today)) fail("INVALID_DATES");
}

/** A loan that is past due and unreturned blocks the tool until someone marks it returned. */
export function effectiveEnd(endDate: string, today: string): string {
  return endDate < today ? OPEN_ENDED : endDate;
}

export function rangesOverlap(
  startA: string,
  endA: string,
  startB: string,
  endB: string,
): boolean {
  return startA <= endB && startB <= endA;
}

export function isOverdue(
  loan: { status: LoanStatus; endDate: string },
  today: string,
): boolean {
  return loan.status === "approved" && loan.endDate < today;
}

/** Once a loan has started the only exit is "returned", so a borrower cannot cancel their way out of a reminder. */
export function isCancelWindowOpen(startDate: string, today: string): boolean {
  return today <= startDate;
}
