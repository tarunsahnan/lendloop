import { paginationOptsValidator } from "convex/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import { mutation, query } from "./_generated/server";
import { requireAdmin } from "./lib/auth";
import { LIMITS } from "./lib/constants";
import { utcToday } from "./lib/dates";
import { fail } from "./lib/errors";
import {
  closeLoansForRemovedTool,
  loanActivity,
  refreshActiveLoan,
  writeAudit,
} from "./lib/records";

/** Deliberately omits pickupNote: an address shared between two neighbors is not admin data. */
export const allLoans = query({
  args: { paginationOpts: paginationOptsValidator },
  handler: async (ctx, { paginationOpts }) => {
    await requireAdmin(ctx);
    const result = await ctx.db
      .query("loans")
      .order("desc")
      .paginate(paginationOpts);
    return {
      ...result,
      page: await Promise.all(
        result.page.map(async (loan) => {
          const [tool, lender, borrower, activity] = await Promise.all([
            ctx.db.get(loan.toolId),
            ctx.db.get(loan.lenderId),
            ctx.db.get(loan.borrowerId),
            loanActivity(ctx, loan._id),
          ]);
          return {
            _id: loan._id,
            toolName: tool?.name ?? "Removed tool",
            status: loan.status,
            startDate: loan.startDate,
            endDate: loan.endDate,
            lenderName: lender?.displayName ?? "Neighbor",
            borrowerName: borrower?.displayName ?? "Neighbor",
            activity,
          };
        }),
      ),
    };
  },
});

export const allListings = query({
  args: { paginationOpts: paginationOptsValidator },
  handler: async (ctx, { paginationOpts }) => {
    await requireAdmin(ctx);
    const result = await ctx.db
      .query("tools")
      .order("desc")
      .paginate(paginationOpts);
    return {
      ...result,
      page: await Promise.all(
        result.page.map(async (tool) => {
          const owner = await ctx.db.get(tool.ownerId);
          return {
            _id: tool._id,
            name: tool.name,
            category: tool.category,
            activeLoan: tool.activeLoan,
            removedAt: tool.removedAt,
            ownerName: owner?.displayName ?? "Neighbor",
          };
        }),
      ),
    };
  },
});

export const allUsers = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    const users = await ctx.db.query("users").order("desc").take(LIMITS.adminList);
    return users.map((user) => ({
      _id: user._id,
      displayName: user.displayName,
      role: user.role,
      isTrustedLender: user.isTrustedLender,
    }));
  },
});

export const automationFailures = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    const rows = await ctx.db
      .query("notifications")
      .withIndex("by_status", (q) => q.eq("status", "failed"))
      .order("desc")
      .take(LIMITS.failureList);
    return rows.map((row) => ({
      _id: row._id,
      kind: row.kind,
      type: row.type,
      attempts: row.attempts,
      lastErrorCode: row.lastErrorCode,
      workflowName: row.workflowName,
      failedNode: row.failedNode,
      updatedAt: row.updatedAt,
    }));
  },
});

export const removeListing = mutation({
  args: { toolId: v.id("tools") },
  handler: async (ctx, { toolId }) => {
    const admin = await requireAdmin(ctx);
    const tool = await ctx.db.get(toolId);
    if (!tool || tool.removedAt !== undefined) fail("NOT_FOUND");

    await closeLoansForRemovedTool(ctx, toolId, admin._id, utcToday(Date.now()));
    await ctx.db.patch(toolId, { removedAt: Date.now(), removedBy: admin._id });
    await refreshActiveLoan(ctx, toolId);
    await writeAudit(ctx, admin._id, "admin.listing_removed", "tool", toolId);
  },
});

export const setTrustedLender = mutation({
  args: { userId: v.id("users"), trusted: v.boolean() },
  handler: async (ctx, { userId, trusted }) => {
    const admin = await requireAdmin(ctx);
    const user = await ctx.db.get(userId);
    if (!user) fail("NOT_FOUND");
    await ctx.db.patch(userId, { isTrustedLender: trusted });
    await writeAudit(
      ctx,
      admin._id,
      trusted ? "admin.trusted_granted" : "admin.trusted_revoked",
      "user",
      userId,
    );
  },
});

export const redeliver = mutation({
  args: { notificationId: v.id("notifications") },
  handler: async (ctx, { notificationId }) => {
    const admin = await requireAdmin(ctx);
    const row = await ctx.db.get(notificationId);
    if (!row) fail("NOT_FOUND");
    if (row.kind !== "loan_event" || row.status !== "failed") {
      fail("INVALID_TRANSITION");
    }
    await ctx.db.patch(notificationId, {
      status: "pending",
      attempts: 0,
      lastErrorCode: undefined,
      updatedAt: Date.now(),
    });
    await ctx.scheduler.runAfter(0, internal.notifications.tick, {
      notificationId,
    });
    await writeAudit(
      ctx,
      admin._id,
      "admin.redelivered",
      "notification",
      notificationId,
    );
  },
});
