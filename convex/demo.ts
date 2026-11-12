import { internalAction, internalMutation, type MutationCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import type { Category, Condition, LoanStatus } from "./lib/constants";
import { addDays, utcToday } from "./lib/dates";
import { signatureHeaders } from "./lib/hmac";
import { refreshActiveLoan } from "./lib/records";

const DEMO_TOKEN_PREFIX = "demo|";
const YOUR_DEMO_TOOLS = ["Socket set", "Wheelbarrow"];
const DAY_MS = 86_400_000;

/** Everything here is internal, so there is no client path. The flag also keeps it off a production deployment. */
function assertDemoEnabled(): void {
  if (process.env.LENDLOOP_ALLOW_DEMO !== "true") {
    throw new Error("Demo tooling is disabled on this deployment.");
  }
}

async function clearDemoData(ctx: MutationCtx): Promise<void> {
  const users = await ctx.db.query("users").collect();
  const demoIds = new Set(
    users
      .filter((user) => user.tokenIdentifier.startsWith(DEMO_TOKEN_PREFIX))
      .map((user) => user._id as string),
  );
  if (demoIds.size === 0) return;

  for (const loan of await ctx.db.query("loans").collect()) {
    if (!demoIds.has(loan.lenderId) && !demoIds.has(loan.borrowerId)) continue;
    const rows = await ctx.db
      .query("notifications")
      .withIndex("by_loan", (q) => q.eq("loanId", loan._id))
      .collect();
    for (const row of rows) await ctx.db.delete(row._id);
    await ctx.db.delete(loan._id);
  }
  for (const tool of await ctx.db.query("tools").collect()) {
    if (demoIds.has(tool.ownerId) || YOUR_DEMO_TOOLS.includes(tool.name)) {
      await ctx.db.delete(tool._id);
    }
  }
  for (const id of demoIds) await ctx.db.delete(id as Id<"users">);
}

export const seed = internalMutation({
  args: {},
  handler: async (ctx) => {
    assertDemoEnabled();
    await clearDemoData(ctx);

    const today = utcToday(Date.now());
    const day = (offset: number) => addDays(today, offset);

    const addUser = (name: string, slug: string, trusted = false) =>
      ctx.db.insert("users", {
        tokenIdentifier: `${DEMO_TOKEN_PREFIX}${slug}`,
        displayName: name,
        role: "user",
        isTrustedLender: trusted,
      });
    const addTool = (
      ownerId: Id<"users">,
      name: string,
      category: Category,
      condition: Condition,
      description: string,
    ) => ctx.db.insert("tools", { ownerId, name, category, condition, description });
    const addLoan = async (
      tool: Id<"tools">,
      lenderId: Id<"users">,
      borrowerId: Id<"users">,
      start: number,
      end: number,
      status: LoanStatus,
      pickupNote?: string,
    ): Promise<Doc<"loans">["_id"]> => {
      const loanId = await ctx.db.insert("loans", {
        toolId: tool,
        lenderId,
        borrowerId,
        startDate: day(start),
        endDate: day(end),
        status,
        pickupNote,
        decidedAt: status === "approved" ? Date.now() : undefined,
      });
      await refreshActiveLoan(ctx, tool);
      return loanId;
    };

    const priya = await addUser("Priya Raman", "priya", true);
    const marcus = await addUser("Marcus Hale", "marcus");
    // The mock notifier rejects this first name, the way a provider's bounce simulator address would.
    const bounce = await addUser("Bounce Tester", "bounce");

    const washer = await addTool(priya, "Pressure washer", "cleaning", "good", "2000 PSI, hose and two nozzles included.");
    const trimmer = await addTool(marcus, "Hedge trimmer", "garden", "fair", "Corded, 22 inch blade. Bring an extension lead.");
    const mixer = await addTool(priya, "Stand mixer", "kitchen", "like_new", "5 quart bowl with dough hook and whisk.");
    const tent = await addTool(marcus, "Four-person tent", "camping", "good", "Sets up in ten minutes. Rain fly included.");
    const stove = await addTool(priya, "Camp stove", "camping", "good", "Two burners. Fuel not included.");
    await addTool(priya, "Cordless drill", "power_tools", "good", "18V with two batteries and a bit set.");
    await addTool(marcus, "Circular saw", "power_tools", "fair", "7 inch blade, fresh this spring.");
    await addTool(marcus, "Extension ladder", "other", "worn", "Reaches 20 feet. Scuffed but solid.");
    await addTool(priya, "Garden fork", "garden", "good", "Ash handle, four tines.");

    const overdue = await addLoan(washer, priya, marcus, -9, -3, "approved");
    await addLoan(trimmer, marcus, bounce, -7, -2, "approved");
    await addLoan(stove, priya, marcus, 5, 7, "approved");

    await ctx.db.insert("notifications", {
      key: `reminder:${overdue}:${day(-2)}`,
      kind: "overdue_reminder",
      status: "sent",
      attempts: 1,
      updatedAt: Date.now() - 2 * DAY_MS,
      loanId: overdue,
      recipientUserId: marcus,
    });

    const people = await ctx.db.query("users").order("desc").collect();
    const you = people.find(
      (user) => !user.tokenIdentifier.startsWith(DEMO_TOKEN_PREFIX),
    );
    if (!you) return { seeded: true, signedInUser: null };

    await ctx.db.patch(you._id, { role: "admin" });
    await addLoan(mixer, priya, you._id, -5, -1, "approved");
    await addLoan(tent, marcus, you._id, 3, 6, "requested");

    const socketSet = await addTool(you._id, "Socket set", "hand_tools", "good", "Metric and imperial, 72 pieces.");
    const wheelbarrow = await addTool(you._id, "Wheelbarrow", "garden", "fair", "Single wheel, tyre holds air.");
    await addLoan(socketSet, you._id, marcus, 2, 4, "requested");
    await addLoan(wheelbarrow, you._id, priya, -1, 3, "approved", "Side gate, code is on the note I texted you.");

    return { seeded: true, signedInUser: you.displayName };
  },
});

export const triggerOverdueRun = internalAction({
  args: {},
  handler: async () => {
    assertDemoEnabled();
    const url = process.env.N8N_OVERDUE_RUN_URL;
    const secret = process.env.CONVEX_TO_N8N_SECRET;
    if (!url || !secret) throw new Error("n8n settings are missing.");

    const body = JSON.stringify({ requestedAt: Date.now() });
    const headers = await signatureHeaders(
      secret,
      { method: "POST", path: new URL(url).pathname, body },
      Date.now(),
    );
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...headers },
      body,
    });
    return { status: response.status };
  },
});
