import { ConvexError } from "convex/values";
import type { ErrorCode } from "@/convex/lib/errors";

const MESSAGES: Record<ErrorCode, string> = {
  UNAUTHENTICATED: "Please sign in to do that.",
  FORBIDDEN: "You don't have permission to do that.",
  NOT_FOUND: "That item no longer exists.",
  INVALID_INPUT: "Please check the form and try again.",
  INVALID_DATES: "Choose a start date from today onward and a loan of 30 days or less.",
  OWN_TOOL: "You can't borrow your own tool.",
  TOOL_REMOVED: "This listing has been removed.",
  TOOL_BOOKED: "Those dates overlap with another loan. Try different dates.",
  TOOL_ON_LOAN: "This tool is on loan. You can delete it once it has been returned.",
  DUPLICATE_REQUEST: "You already have an open request for this tool.",
  INVALID_TRANSITION: "This loan has already moved on. Refresh to see its latest status.",
  REQUEST_EXPIRED: "The start date has passed, so this request can only be declined.",
  CANCEL_WINDOW_CLOSED: "This loan has started, so it can only be marked as returned.",
};

const FALLBACK = "Something went wrong. Please try again.";

export function errorMessage(error: unknown): string {
  if (error instanceof ConvexError) {
    const code = (error.data as { code?: ErrorCode } | undefined)?.code;
    if (code && code in MESSAGES) return MESSAGES[code];
  }
  return FALLBACK;
}
