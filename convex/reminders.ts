import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { internalMutation, internalQuery } from "./_generated/server";
import { LIMITS } from "./lib/constants";
import { daysBetween, utcToday } from "./lib/dates";
import { isOverdue } from "./lib/loanState";
import { firstNameOf } from "./lib/records";

const KEY_PATTERN = /^reminder:([a-z0-9]+):(\d{4}-\d{2}-\d{2})$/;

function reminderKey(loanId: Id<"loans">, date: string): string {
  return `reminder:${loanId}:${date}`;
}

export const overdueLoans = internalQuery({
  args: { today: v.string() },
  handler: async (ctx, { today }) => {
    const loans = await ctx.db
      .query("loans")
      .withIndex("by_status_endDate", (q) =>
        q.eq("status", "approved").lt("endDate", today),
      )
      .take(LIMITS.overdueBatch);

    return Promise.all(
      loans.map(async (loan) => {
        const [tool, borrower] = await Promise.all([
          ctx.db.get(loan.toolId),
          ctx.db.get(loan.borrowerId),
        ]);
        return {
          loanId: loan._id,
          reminderKey: reminderKey(loan._id, today),
          toolName: tool?.name ?? "Removed tool",
          dueDate: loan.endDate,
          daysOverdue: daysBetween(loan.endDate, today),
          recipient: {
            id: loan.borrowerId,
            firstName: firstNameOf(borrower?.displayName ?? ""),
          },
        };
      }),
    );
  },
});

/**
 * Called before each send. A `pending` or `sent` row returns false, so a retried
 * run cannot remind twice in a day. Tomorrow's key is the retry for an unknown outcome.
 */
export const claim = internalMutation({
  args: { reminderKey: v.string() },
  handler: async (ctx, { reminderKey: key }) => {
    const match = KEY_PATTERN.exec(key);
    const today = utcToday(Date.now());
    if (!match || match[2] !== today) return { claimed: false };

    const loanId = ctx.db.normalizeId("loans", match[1]);
    const loan = loanId ? await ctx.db.get(loanId) : null;
    if (!loan || !isOverdue(loan, today)) return { claimed: false };

    const existing = await ctx.db
      .query("notifications")
      .withIndex("by_key", (q) => q.eq("key", key))
      .unique();

    if (!existing) {
      await ctx.db.insert("notifications", {
        key,
        kind: "overdue_reminder",
        status: "pending",
        attempts: 1,
        updatedAt: Date.now(),
        loanId: loan._id,
        recipientUserId: loan.borrowerId,
      });
      return { claimed: true };
    }

    if (existing.status === "failed") {
      await ctx.db.patch(existing._id, {
        status: "pending",
        attempts: existing.attempts + 1,
        lastErrorCode: undefined,
        updatedAt: Date.now(),
      });
      return { claimed: true };
    }

    return { claimed: false };
  },
});

export const recordResult = internalMutation({
  args: {
    reminderKey: v.string(),
    status: v.union(v.literal("sent"), v.literal("failed")),
    errorCode: v.optional(v.string()),
  },
  handler: async (ctx, { reminderKey: key, status, errorCode }) => {
    const row = await ctx.db
      .query("notifications")
      .withIndex("by_key", (q) => q.eq("key", key))
      .unique();
    if (!row) return { found: false, status };
    if (row.status === "sent") return { found: true, status: "sent" as const };

    await ctx.db.patch(row._id, {
      status,
      lastErrorCode: status === "failed" ? errorCode?.slice(0, 60) : undefined,
      updatedAt: Date.now(),
    });
    return { found: true, status };
  },
});
