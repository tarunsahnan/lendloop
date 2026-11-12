import { v } from "convex/values";
import { internal } from "./_generated/api";
import {
  internalAction,
  internalMutation,
  internalQuery,
} from "./_generated/server";
import { signatureHeaders } from "./lib/hmac";
import { firstNameOf } from "./lib/records";

const RETRY_DELAYS_MS = [60_000, 180_000, 600_000];
const MAX_ATTEMPTS = RETRY_DELAYS_MS.length;
const FETCH_TIMEOUT_MS = 10_000;
// Stays above the fetch timeout, so two attempts for one row never overlap.
const MIN_RETRY_DELAY_MS = 15_000;

function retryDelay(attempt: number): number {
  const scale = Number(process.env.NOTIFICATION_BACKOFF_SCALE ?? "1");
  const base = RETRY_DELAYS_MS[attempt - 1] * (scale > 0 ? scale : 1);
  return Math.max(MIN_RETRY_DELAY_MS, base);
}

/**
 * Convex runs scheduled mutations exactly once but actions at most once, so
 * retry state lives here: if deliver dies, the next tick still runs.
 */
export const tick = internalMutation({
  args: { notificationId: v.id("notifications") },
  handler: async (ctx, { notificationId }) => {
    const row = await ctx.db.get(notificationId);
    if (!row || row.status !== "pending") return;

    if (row.attempts >= MAX_ATTEMPTS) {
      await ctx.db.patch(notificationId, {
        status: "failed",
        lastErrorCode: row.lastErrorCode ?? "NO_RESPONSE",
        updatedAt: Date.now(),
      });
      return;
    }

    const attempt = row.attempts + 1;
    await ctx.db.patch(notificationId, { attempts: attempt, updatedAt: Date.now() });
    await ctx.scheduler.runAfter(0, internal.notifications.deliver, {
      notificationId,
      attempt,
    });
    await ctx.scheduler.runAfter(retryDelay(attempt), internal.notifications.tick, {
      notificationId,
    });
  },
});

/** The full field allowlist for what leaves Convex towards n8n. */
export const buildPayload = internalQuery({
  args: { notificationId: v.id("notifications"), attempt: v.number() },
  handler: async (ctx, { notificationId, attempt }) => {
    const row = await ctx.db.get(notificationId);
    if (!row || row.status !== "pending" || !row.loanId || !row.recipientUserId) {
      return null;
    }
    const loan = await ctx.db.get(row.loanId);
    const recipient = await ctx.db.get(row.recipientUserId);
    if (!loan || !recipient) return null;
    const tool = await ctx.db.get(loan.toolId);

    return {
      eventId: row.key.replace("event:", ""),
      attempt,
      type: row.type,
      loanId: loan._id,
      toolName: tool?.name ?? "Removed tool",
      startDate: loan.startDate,
      endDate: loan.endDate,
      recipient: {
        id: recipient._id,
        firstName: firstNameOf(recipient.displayName),
      },
    };
  },
});

export const markSent = internalMutation({
  args: { notificationId: v.id("notifications") },
  handler: async (ctx, { notificationId }) => {
    const row = await ctx.db.get(notificationId);
    if (!row || row.status !== "pending") return;
    await ctx.db.patch(notificationId, {
      status: "sent",
      lastErrorCode: undefined,
      updatedAt: Date.now(),
    });
  },
});

export const recordAttemptError = internalMutation({
  args: { notificationId: v.id("notifications"), code: v.string() },
  handler: async (ctx, { notificationId, code }) => {
    const row = await ctx.db.get(notificationId);
    if (!row || row.status !== "pending") return;
    await ctx.db.patch(notificationId, {
      lastErrorCode: code,
      updatedAt: Date.now(),
    });
  },
});

/** Signs at send time, so each attempt carries a fresh timestamp. */
export const deliver = internalAction({
  args: { notificationId: v.id("notifications"), attempt: v.number() },
  handler: async (ctx, { notificationId, attempt }) => {
    const payload = await ctx.runQuery(internal.notifications.buildPayload, {
      notificationId,
      attempt,
    });
    if (!payload) return;

    const url = process.env.N8N_LOAN_EVENT_URL;
    const secret = process.env.CONVEX_TO_N8N_SECRET;
    if (!url || !secret) {
      await ctx.runMutation(internal.notifications.recordAttemptError, {
        notificationId,
        code: "NOT_CONFIGURED",
      });
      return;
    }

    const body = JSON.stringify(payload);
    const headers = await signatureHeaders(
      secret,
      { method: "POST", path: new URL(url).pathname, body },
      Date.now(),
    );

    let code: string | null;
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...headers },
        body,
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      });
      code = response.ok ? null : `HTTP_${response.status}`;
    } catch {
      code = "NETWORK";
    }

    if (code) {
      await ctx.runMutation(internal.notifications.recordAttemptError, {
        notificationId,
        code,
      });
    } else {
      await ctx.runMutation(internal.notifications.markSent, { notificationId });
    }
  },
});

/** Idempotent per n8n execution, so the error workflow can be retried safely. */
export const recordWorkflowFailure = internalMutation({
  args: {
    executionId: v.optional(v.string()),
    workflowName: v.string(),
    failedNode: v.string(),
  },
  handler: async (ctx, { executionId, workflowName, failedNode }) => {
    const now = Date.now();
    const key = executionId
      ? `n8n:${executionId}`
      : `n8n:${workflowName}:${Math.floor(now / 60_000)}`;
    const existing = await ctx.db
      .query("notifications")
      .withIndex("by_key", (q) => q.eq("key", key))
      .unique();
    if (existing) return;
    await ctx.db.insert("notifications", {
      key,
      kind: "workflow_failure",
      status: "failed",
      attempts: 0,
      updatedAt: now,
      workflowName: workflowName.slice(0, 120),
      failedNode: failedNode.slice(0, 120),
    });
  },
});
