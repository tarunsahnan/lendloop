import type { UserIdentity } from "convex/server";
import { v } from "convex/values";
import type { Doc } from "./_generated/dataModel";
import { internalMutation, mutation, query } from "./_generated/server";
import { getCurrentUser } from "./lib/auth";
import { LIMITS } from "./lib/constants";
import { fail } from "./lib/errors";
import { writeAudit } from "./lib/records";

function displayNameFrom(identity: UserIdentity): string {
  const name =
    identity.name?.trim() ||
    identity.givenName?.trim() ||
    identity.nickname?.trim() ||
    "Neighbor";
  return name.slice(0, LIMITS.nameMax);
}

function toSelf(user: Doc<"users">) {
  return {
    _id: user._id,
    displayName: user.displayName,
    role: user.role,
    isTrustedLender: user.isTrustedLender,
  };
}

/** Takes no arguments: every field comes from the verified token, and a new user is always role "user". */
export const ensureUser = mutation({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) fail("UNAUTHENTICATED");

    const displayName = displayNameFrom(identity);
    const existing = await getCurrentUser(ctx);
    if (existing) {
      if (existing.displayName !== displayName) {
        await ctx.db.patch(existing._id, { displayName });
      }
      return toSelf({ ...existing, displayName });
    }

    const userId = await ctx.db.insert("users", {
      tokenIdentifier: identity.tokenIdentifier,
      displayName,
      role: "user",
      isTrustedLender: false,
    });
    const created = await ctx.db.get(userId);
    return toSelf(created!);
  },
});

export const me = query({
  args: {},
  handler: async (ctx) => {
    const user = await getCurrentUser(ctx);
    return user ? toSelf(user) : null;
  },
});

/** Bootstrap for the first admin. Internal, so it is reachable only with deployment credentials. */
export const promoteToAdmin = internalMutation({
  args: { displayName: v.optional(v.string()) },
  handler: async (ctx, { displayName }) => {
    const users = await ctx.db.query("users").order("desc").take(LIMITS.adminList);
    const real = users.filter((u) => !u.tokenIdentifier.startsWith("demo|"));
    const target = displayName
      ? real.find((u) => u.displayName === displayName)
      : real[0];
    if (!target) return { promoted: null };
    await ctx.db.patch(target._id, { role: "admin" });
    await writeAudit(ctx, target._id, "user.promoted", "user", target._id);
    return { promoted: target.displayName };
  },
});
