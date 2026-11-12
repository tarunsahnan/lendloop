import type { Category, Condition, LoanStatus } from "@/convex/lib/constants";
import { daysBetween, utcToday } from "@/convex/lib/dates";

export type Tone = "moss" | "amber" | "rust" | "slate" | "neutral";

export const CATEGORY_LABELS: Record<Category, string> = {
  power_tools: "Power tools",
  hand_tools: "Hand tools",
  garden: "Garden",
  kitchen: "Kitchen",
  camping: "Camping",
  cleaning: "Cleaning",
  other: "Other",
};

export const CATEGORIES = Object.keys(CATEGORY_LABELS) as Category[];

export const CONDITION_LABELS: Record<Condition, string> = {
  like_new: "Like new",
  good: "Good",
  fair: "Fair",
  worn: "Well used",
};

export const CONDITIONS = Object.keys(CONDITION_LABELS) as Condition[];

export function today(): string {
  return utcToday(Date.now());
}

/** The picker offers the user's own calendar day. The backend allows for the difference from UTC. */
export function localToday(): string {
  return new Date().toLocaleDateString("en-CA");
}

export function formatDate(date: string): string {
  return new Date(`${date}T00:00:00Z`).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

export function formatRange(start: string, end: string): string {
  return start === end
    ? formatDate(start)
    : `${formatDate(start)} to ${formatDate(end)}`;
}

export function timeAgo(at: number): string {
  const minutes = Math.floor((Date.now() - at) / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hr ago`;
  const days = Math.floor(hours / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
}

export type Availability = { label: string; tone: Tone; canRequest: boolean };

export function availabilityOf(
  activeLoan: { startDate: string; endDate: string } | undefined,
): Availability {
  if (!activeLoan) return { label: "Available", tone: "moss", canRequest: true };
  const now = today();
  if (activeLoan.endDate < now) {
    const days = daysBetween(activeLoan.endDate, now);
    return {
      label: `Overdue by ${days} day${days === 1 ? "" : "s"}`,
      tone: "rust",
      canRequest: false,
    };
  }
  if (activeLoan.startDate > now) {
    return {
      label: `Booked from ${formatDate(activeLoan.startDate)}`,
      tone: "amber",
      canRequest: true,
    };
  }
  return {
    label: `On loan until ${formatDate(activeLoan.endDate)}`,
    tone: "slate",
    canRequest: true,
  };
}

export function loanBadge(loan: {
  status: LoanStatus;
  startDate: string;
  endDate: string;
}): { label: string; tone: Tone } {
  switch (loan.status) {
    case "requested":
      return { label: "Awaiting reply", tone: "amber" };
    case "approved":
      return availabilityOf(loan);
    case "declined":
      return { label: "Declined", tone: "neutral" };
    case "cancelled":
      return { label: "Cancelled", tone: "neutral" };
    case "returned":
      return { label: "Returned", tone: "moss" };
  }
}

export type ActivityEntry = {
  kind: "loan_event" | "overdue_reminder" | "workflow_failure";
  type?: string;
  status: "pending" | "sent" | "failed";
  updatedAt: number;
  reminderDate?: string;
};

const EVENT_NAMES: Record<string, string> = {
  "loan.requested": "Request",
  "loan.approved": "Approval",
  "loan.declined": "Decline",
  "loan.cancelled": "Cancellation",
  "loan.returned": "Return",
};

export function describeActivity(entry: ActivityEntry): {
  text: string;
  isProblem: boolean;
} {
  if (entry.kind === "overdue_reminder") {
    if (entry.status === "sent") {
      return { text: `Reminder sent ${timeAgo(entry.updatedAt)}`, isProblem: false };
    }
    if (entry.status === "failed") {
      return { text: `Reminder failed ${timeAgo(entry.updatedAt)}`, isProblem: true };
    }
    return entry.reminderDate && entry.reminderDate < today()
      ? { text: "Reminder outcome unknown", isProblem: true }
      : { text: "Reminder sending", isProblem: false };
  }

  const name = EVENT_NAMES[entry.type ?? ""] ?? "Update";
  if (entry.status === "sent") {
    return {
      text: `${name} notice sent ${timeAgo(entry.updatedAt)}`,
      isProblem: false,
    };
  }
  if (entry.status === "failed") {
    return { text: `${name} notice could not be delivered`, isProblem: true };
  }
  return { text: `${name} notice queued`, isProblem: false };
}
