import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import {
  categoryValidator,
  conditionValidator,
  loanEventTypeValidator,
  loanStatusValidator,
  notificationKindValidator,
  notificationStatusValidator,
} from "./lib/constants";

export default defineSchema({
  users: defineTable({
    tokenIdentifier: v.string(),
    displayName: v.string(),
    role: v.union(v.literal("admin"), v.literal("user")),
    isTrustedLender: v.boolean(),
  }).index("by_token", ["tokenIdentifier"]),

  tools: defineTable({
    ownerId: v.id("users"),
    name: v.string(),
    category: categoryValidator,
    condition: conditionValidator,
    description: v.string(),
    removedAt: v.optional(v.number()),
    removedBy: v.optional(v.id("users")),
    // Earliest approved, unreturned loan. Stored so queries never depend on the clock.
    activeLoan: v.optional(
      v.object({ startDate: v.string(), endDate: v.string() }),
    ),
  })
    .index("by_owner_removed", ["ownerId", "removedAt"])
    .index("by_removed", ["removedAt"])
    .index("by_category_removed", ["category", "removedAt"])
    .index("by_public_listing", ["removedAt", "activeLoan"]),

  loans: defineTable({
    toolId: v.id("tools"),
    lenderId: v.id("users"),
    borrowerId: v.id("users"),
    startDate: v.string(),
    endDate: v.string(),
    status: loanStatusValidator,
    decidedAt: v.optional(v.number()),
    returnedAt: v.optional(v.number()),
    pickupNote: v.optional(v.string()),
  })
    .index("by_tool_status", ["toolId", "status"])
    .index("by_borrower", ["borrowerId"])
    .index("by_borrower_tool_status", ["borrowerId", "toolId", "status"])
    .index("by_lender", ["lenderId"])
    .index("by_status_endDate", ["status", "endDate"]),

  notifications: defineTable({
    key: v.string(),
    kind: notificationKindValidator,
    status: notificationStatusValidator,
    attempts: v.number(),
    updatedAt: v.number(),
    loanId: v.optional(v.id("loans")),
    recipientUserId: v.optional(v.id("users")),
    type: v.optional(loanEventTypeValidator),
    lastErrorCode: v.optional(v.string()),
    workflowName: v.optional(v.string()),
    failedNode: v.optional(v.string()),
  })
    .index("by_key", ["key"])
    .index("by_loan", ["loanId"])
    .index("by_status", ["status"]),

  auditLog: defineTable({
    actorId: v.id("users"),
    action: v.string(),
    targetType: v.union(
      v.literal("tool"),
      v.literal("loan"),
      v.literal("user"),
      v.literal("notification"),
    ),
    targetId: v.string(),
    at: v.number(),
  }).index("by_target", ["targetType", "targetId"]),
});
