import { paginationOptsValidator } from "convex/server";
import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { mutation, query, type QueryCtx } from "./_generated/server";
import { requireToolOwner, requireUser } from "./lib/auth";
import {
  categoryValidator,
  conditionValidator,
  LIMITS,
} from "./lib/constants";
import { utcToday } from "./lib/dates";
import { fail } from "./lib/errors";
import { closeLoansForRemovedTool, writeAudit } from "./lib/records";

const toolFields = {
  name: v.string(),
  category: categoryValidator,
  condition: conditionValidator,
  description: v.string(),
};

function cleanText(value: string, min: number, max: number): string {
  const text = value.trim();
  if (text.length < min || text.length > max) fail("INVALID_INPUT");
  return text;
}

function cleanTool(input: { name: string; description: string }) {
  return {
    name: cleanText(input.name, LIMITS.nameMin, LIMITS.nameMax),
    description: cleanText(
      input.description,
      LIMITS.descriptionMin,
      LIMITS.descriptionMax,
    ),
  };
}

async function toMemberTool(
  ctx: QueryCtx,
  tool: Doc<"tools">,
  viewerId: Id<"users">,
) {
  const owner = await ctx.db.get(tool.ownerId);
  return {
    _id: tool._id,
    name: tool.name,
    category: tool.category,
    condition: tool.condition,
    description: tool.description,
    activeLoan: tool.activeLoan,
    isMine: tool.ownerId === viewerId,
    ownerName: owner?.displayName ?? "Neighbor",
    ownerIsTrusted: owner?.isTrustedLender ?? false,
  };
}

/** The anonymous surface: only name and category leave the backend, and the validator rejects anything more. */
export const listPublic = query({
  args: {},
  returns: v.array(v.object({ name: v.string(), category: categoryValidator })),
  handler: async (ctx) => {
    const tools = await ctx.db
      .query("tools")
      .withIndex("by_public_listing", (q) =>
        q.eq("removedAt", undefined).eq("activeLoan", undefined),
      )
      .order("desc")
      .take(LIMITS.publicList);
    return tools.map((tool) => ({ name: tool.name, category: tool.category }));
  },
});

export const listForMembers = query({
  args: {
    category: v.optional(categoryValidator),
    paginationOpts: paginationOptsValidator,
  },
  handler: async (ctx, { category, paginationOpts }) => {
    const user = await requireUser(ctx);
    const source = category
      ? ctx.db
          .query("tools")
          .withIndex("by_category_removed", (q) =>
            q.eq("category", category).eq("removedAt", undefined),
          )
      : ctx.db
          .query("tools")
          .withIndex("by_removed", (q) => q.eq("removedAt", undefined));
    const result = await source.order("desc").paginate(paginationOpts);
    return {
      ...result,
      page: await Promise.all(
        result.page.map((tool) => toMemberTool(ctx, tool, user._id)),
      ),
    };
  },
});

export const listMine = query({
  args: {},
  handler: async (ctx) => {
    const user = await requireUser(ctx);
    const tools = await ctx.db
      .query("tools")
      .withIndex("by_owner_removed", (q) =>
        q.eq("ownerId", user._id).eq("removedAt", undefined),
      )
      .order("desc")
      .take(LIMITS.ownList);
    return Promise.all(tools.map((tool) => toMemberTool(ctx, tool, user._id)));
  },
});

export const create = mutation({
  args: toolFields,
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const toolId = await ctx.db.insert("tools", {
      ownerId: user._id,
      category: args.category,
      condition: args.condition,
      ...cleanTool(args),
    });
    await writeAudit(ctx, user._id, "tool.created", "tool", toolId);
    return toolId;
  },
});

export const update = mutation({
  args: { toolId: v.id("tools"), ...toolFields },
  handler: async (ctx, { toolId, ...fields }) => {
    const user = await requireUser(ctx);
    const tool = await ctx.db.get(toolId);
    if (!tool || tool.removedAt !== undefined) fail("NOT_FOUND");
    requireToolOwner(user, tool);
    await ctx.db.patch(toolId, {
      category: fields.category,
      condition: fields.condition,
      ...cleanTool(fields),
    });
    await writeAudit(ctx, user._id, "tool.updated", "tool", toolId);
  },
});

/** Soft delete, so loan history keeps pointing at a real listing. */
export const remove = mutation({
  args: { toolId: v.id("tools") },
  handler: async (ctx, { toolId }) => {
    const user = await requireUser(ctx);
    const tool = await ctx.db.get(toolId);
    if (!tool || tool.removedAt !== undefined) fail("NOT_FOUND");
    requireToolOwner(user, tool);
    if (tool.activeLoan) fail("TOOL_ON_LOAN");

    await closeLoansForRemovedTool(ctx, toolId, user._id, utcToday(Date.now()));
    await ctx.db.patch(toolId, { removedAt: Date.now(), removedBy: user._id });
    await writeAudit(ctx, user._id, "tool.removed", "tool", toolId);
  },
});
