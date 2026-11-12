import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { mutation, query, type QueryCtx } from "./_generated/server";
import { requireLender, requireLoanParty, requireUser } from "./lib/auth";
import { LIMITS } from "./lib/constants";
import { utcToday } from "./lib/dates";
import { fail } from "./lib/errors";
import {
  assertTransition,
  assertValidRange,
  isCancelWindowOpen,
  isStartAllowed,
} from "./lib/loanState";
import {
  enqueueLoanEvent,
  hasApprovedOverlap,
  loanActivity,
  refreshActiveLoan,
  writeAudit,
} from "./lib/records";

async function getLoan(ctx: QueryCtx, loanId: Id<"loans">) {
  const loan = await ctx.db.get(loanId);
  if (!loan) fail("NOT_FOUND");
  return loan;
}

function cleanPickupNote(note: string | undefined): string | undefined {
  const text = note?.trim();
  if (!text) return undefined;
  if (text.length > LIMITS.pickupNoteMax) fail("INVALID_INPUT");
  return text;
}

async function toLoanView(
  ctx: QueryCtx,
  loan: Doc<"loans">,
  counterpartId: Id<"users">,
) {
  const [tool, counterpart, activity] = await Promise.all([
    ctx.db.get(loan.toolId),
    ctx.db.get(counterpartId),
    loanActivity(ctx, loan._id),
  ]);
  return {
    _id: loan._id,
    toolName: tool?.name ?? "Removed tool",
    status: loan.status,
    startDate: loan.startDate,
    endDate: loan.endDate,
    counterpartName: counterpart?.displayName ?? "Neighbor",
    counterpartIsTrusted: counterpart?.isTrustedLender ?? false,
    pickupNote: loan.status === "approved" ? loan.pickupNote : undefined,
    activity,
  };
}

export const request = mutation({
  args: {
    toolId: v.id("tools"),
    startDate: v.string(),
    endDate: v.string(),
  },
  handler: async (ctx, { toolId, startDate, endDate }) => {
    const user = await requireUser(ctx);
    const tool = await ctx.db.get(toolId);
    if (!tool) fail("NOT_FOUND");
    if (tool.removedAt !== undefined) fail("TOOL_REMOVED");
    if (tool.ownerId === user._id) fail("OWN_TOOL");

    const today = utcToday(Date.now());
    assertValidRange(startDate, endDate, today);
    if (await hasApprovedOverlap(ctx, toolId, startDate, endDate, today)) {
      fail("TOOL_BOOKED");
    }

    const duplicate = await ctx.db
      .query("loans")
      .withIndex("by_borrower_tool_status", (q) =>
        q
          .eq("borrowerId", user._id)
          .eq("toolId", toolId)
          .eq("status", "requested"),
      )
      .first();
    if (duplicate) fail("DUPLICATE_REQUEST");

    const loanId = await ctx.db.insert("loans", {
      toolId,
      lenderId: tool.ownerId,
      borrowerId: user._id,
      startDate,
      endDate,
      status: "requested",
    });
    await writeAudit(ctx, user._id, "loan.requested", "loan", loanId);
    await enqueueLoanEvent(ctx, loanId, "loan.requested", tool.ownerId);
    return loanId;
  },
});

export const approve = mutation({
  args: { loanId: v.id("loans"), pickupNote: v.optional(v.string()) },
  handler: async (ctx, { loanId, pickupNote }) => {
    const user = await requireUser(ctx);
    const loan = await getLoan(ctx, loanId);
    requireLender(user, loan);
    assertTransition(loan.status, "approved");

    const tool = await ctx.db.get(loan.toolId);
    if (!tool || tool.removedAt !== undefined) fail("TOOL_REMOVED");

    const today = utcToday(Date.now());
    if (!isStartAllowed(loan.startDate, today)) fail("REQUEST_EXPIRED");
    // Mutations are serializable, so two approvals racing here cannot both pass.
    if (
      await hasApprovedOverlap(
        ctx,
        loan.toolId,
        loan.startDate,
        loan.endDate,
        today,
      )
    ) {
      fail("TOOL_BOOKED");
    }

    await ctx.db.patch(loanId, {
      status: "approved",
      decidedAt: Date.now(),
      pickupNote: cleanPickupNote(pickupNote),
    });
    await refreshActiveLoan(ctx, loan.toolId);
    await writeAudit(ctx, user._id, "loan.approved", "loan", loanId);
    await enqueueLoanEvent(ctx, loanId, "loan.approved", loan.borrowerId);
  },
});

export const decline = mutation({
  args: { loanId: v.id("loans") },
  handler: async (ctx, { loanId }) => {
    const user = await requireUser(ctx);
    const loan = await getLoan(ctx, loanId);
    requireLender(user, loan);
    assertTransition(loan.status, "declined");

    await ctx.db.patch(loanId, { status: "declined", decidedAt: Date.now() });
    await writeAudit(ctx, user._id, "loan.declined", "loan", loanId);
    await enqueueLoanEvent(ctx, loanId, "loan.declined", loan.borrowerId);
  },
});

export const cancel = mutation({
  args: { loanId: v.id("loans") },
  handler: async (ctx, { loanId }) => {
    const user = await requireUser(ctx);
    const loan = await getLoan(ctx, loanId);
    requireLoanParty(user, loan);
    assertTransition(loan.status, "cancelled");

    const actorIsBorrower = loan.borrowerId === user._id;
    if (loan.status === "requested" && !actorIsBorrower) fail("FORBIDDEN");
    if (
      loan.status === "approved" &&
      !isCancelWindowOpen(loan.startDate, utcToday(Date.now()))
    ) {
      fail("CANCEL_WINDOW_CLOSED");
    }

    await ctx.db.patch(loanId, { status: "cancelled", pickupNote: undefined });
    await refreshActiveLoan(ctx, loan.toolId);
    await writeAudit(ctx, user._id, "loan.cancelled", "loan", loanId);
    await enqueueLoanEvent(
      ctx,
      loanId,
      "loan.cancelled",
      actorIsBorrower ? loan.lenderId : loan.borrowerId,
    );
  },
});

/** Lender only: a borrower who could mark their own loan returned could silence their own reminders. */
export const markReturned = mutation({
  args: { loanId: v.id("loans") },
  handler: async (ctx, { loanId }) => {
    const user = await requireUser(ctx);
    const loan = await getLoan(ctx, loanId);
    requireLender(user, loan);
    assertTransition(loan.status, "returned");

    await ctx.db.patch(loanId, {
      status: "returned",
      returnedAt: Date.now(),
      pickupNote: undefined,
    });
    await refreshActiveLoan(ctx, loan.toolId);
    await writeAudit(ctx, user._id, "loan.returned", "loan", loanId);
    await enqueueLoanEvent(ctx, loanId, "loan.returned", loan.borrowerId);
  },
});

export const myRequests = query({
  args: {},
  handler: async (ctx) => {
    const user = await requireUser(ctx);
    const loans = await ctx.db
      .query("loans")
      .withIndex("by_borrower", (q) => q.eq("borrowerId", user._id))
      .order("desc")
      .take(LIMITS.ownList);
    return Promise.all(loans.map((loan) => toLoanView(ctx, loan, loan.lenderId)));
  },
});

export const incoming = query({
  args: {},
  handler: async (ctx) => {
    const user = await requireUser(ctx);
    const loans = await ctx.db
      .query("loans")
      .withIndex("by_lender", (q) => q.eq("lenderId", user._id))
      .order("desc")
      .take(LIMITS.ownList);
    return Promise.all(
      loans.map((loan) => toLoanView(ctx, loan, loan.borrowerId)),
    );
  },
});
