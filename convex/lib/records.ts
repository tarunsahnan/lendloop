import { internal } from "../_generated/api";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { LIMITS, type LoanEventType } from "./constants";
import { effectiveEnd, rangesOverlap } from "./loanState";

type AuditTarget = Doc<"auditLog">["targetType"];

export async function writeAudit(
  ctx: MutationCtx,
  actorId: Id<"users">,
  action: string,
  targetType: AuditTarget,
  targetId: string,
): Promise<void> {
  await ctx.db.insert("auditLog", {
    actorId,
    action,
    targetType,
    targetId,
    at: Date.now(),
  });
}

/**
 * Inserting the row and scheduling the first tick happen in the caller's
 * transaction, so a rolled-back mutation can never send a notification.
 */
export async function enqueueLoanEvent(
  ctx: MutationCtx,
  loanId: Id<"loans">,
  type: LoanEventType,
  recipientUserId: Id<"users">,
): Promise<void> {
  const notificationId = await ctx.db.insert("notifications", {
    key: `event:${crypto.randomUUID()}`,
    kind: "loan_event",
    status: "pending",
    attempts: 0,
    updatedAt: Date.now(),
    loanId,
    recipientUserId,
    type,
  });
  await ctx.scheduler.runAfter(0, internal.notifications.tick, {
    notificationId,
  });
}

export async function approvedLoans(
  ctx: QueryCtx,
  toolId: Id<"tools">,
): Promise<Doc<"loans">[]> {
  return ctx.db
    .query("loans")
    .withIndex("by_tool_status", (q) =>
      q.eq("toolId", toolId).eq("status", "approved"),
    )
    .collect();
}

export async function hasApprovedOverlap(
  ctx: QueryCtx,
  toolId: Id<"tools">,
  startDate: string,
  endDate: string,
  today: string,
): Promise<boolean> {
  const loans = await approvedLoans(ctx, toolId);
  return loans.some((loan) =>
    rangesOverlap(
      startDate,
      endDate,
      loan.startDate,
      effectiveEnd(loan.endDate, today),
    ),
  );
}

export async function refreshActiveLoan(
  ctx: MutationCtx,
  toolId: Id<"tools">,
): Promise<void> {
  const loans = await approvedLoans(ctx, toolId);
  const earliest = loans.sort((a, b) =>
    a.startDate.localeCompare(b.startDate),
  )[0];
  await ctx.db.patch(toolId, {
    activeLoan: earliest
      ? { startDate: earliest.startDate, endDate: earliest.endDate }
      : undefined,
  });
}

/**
 * Used when a listing goes away. Open requests and approved loans that have
 * not started are cancelled. A loan already under way carries on to "returned".
 */
export async function closeLoansForRemovedTool(
  ctx: MutationCtx,
  toolId: Id<"tools">,
  actorId: Id<"users">,
  today: string,
): Promise<void> {
  const requested = await ctx.db
    .query("loans")
    .withIndex("by_tool_status", (q) =>
      q.eq("toolId", toolId).eq("status", "requested"),
    )
    .collect();
  const approved = await approvedLoans(ctx, toolId);
  const unstarted = approved.filter((loan) => loan.startDate > today);

  for (const loan of [...requested, ...unstarted]) {
    await ctx.db.patch(loan._id, {
      status: "cancelled",
      pickupNote: undefined,
    });
    await writeAudit(ctx, actorId, "loan.cancelled", "loan", loan._id);
    await enqueueLoanEvent(ctx, loan._id, "loan.cancelled", loan.borrowerId);
  }
}

export async function loanActivity(ctx: QueryCtx, loanId: Id<"loans">) {
  const rows = await ctx.db
    .query("notifications")
    .withIndex("by_loan", (q) => q.eq("loanId", loanId))
    .order("desc")
    .take(LIMITS.activityPerLoan);
  return rows.map((row) => ({
    kind: row.kind,
    type: row.type,
    status: row.status,
    updatedAt: row.updatedAt,
    reminderDate:
      row.kind === "overdue_reminder" ? row.key.split(":")[2] : undefined,
  }));
}

export function firstNameOf(displayName: string): string {
  return displayName.trim().split(/\s+/)[0] || "Neighbor";
}
