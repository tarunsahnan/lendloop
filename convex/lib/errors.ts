import { ConvexError } from "convex/values";

export type ErrorCode =
  | "UNAUTHENTICATED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "INVALID_INPUT"
  | "INVALID_DATES"
  | "OWN_TOOL"
  | "TOOL_REMOVED"
  | "TOOL_BOOKED"
  | "TOOL_ON_LOAN"
  | "DUPLICATE_REQUEST"
  | "INVALID_TRANSITION"
  | "REQUEST_EXPIRED"
  | "CANCEL_WINDOW_CLOSED";

/** Clients receive only a stable code, never internal detail. */
export function fail(code: ErrorCode): never {
  throw new ConvexError({ code });
}
