import type { Doc } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { fail } from "./errors";

type Ctx = QueryCtx | MutationCtx;

export async function getCurrentUser(ctx: Ctx): Promise<Doc<"users"> | null> {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) return null;
  return ctx.db
    .query("users")
    .withIndex("by_token", (q) =>
      q.eq("tokenIdentifier", identity.tokenIdentifier),
    )
    .unique();
}

export async function requireUser(ctx: Ctx): Promise<Doc<"users">> {
  const user = await getCurrentUser(ctx);
  if (!user) fail("UNAUTHENTICATED");
  return user;
}

export async function requireAdmin(ctx: Ctx): Promise<Doc<"users">> {
  const user = await requireUser(ctx);
  if (user.role !== "admin") fail("FORBIDDEN");
  return user;
}

/** Ownership is independent of role: an admin gets no owner rights over someone else's tool. */
export function requireToolOwner(
  user: Doc<"users">,
  tool: Doc<"tools">,
): void {
  if (tool.ownerId !== user._id) fail("FORBIDDEN");
}

export function requireLender(user: Doc<"users">, loan: Doc<"loans">): void {
  if (loan.lenderId !== user._id) fail("FORBIDDEN");
}

export function requireLoanParty(
  user: Doc<"users">,
  loan: Doc<"loans">,
): void {
  if (loan.lenderId !== user._id && loan.borrowerId !== user._id) {
    fail("FORBIDDEN");
  }
}
