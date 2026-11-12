import { afterEach, describe, expect, it, vi } from "vitest";
import { api } from "../convex/_generated/api";
import type { Id } from "../convex/_generated/dataModel";
import { canTransition } from "../convex/lib/loanState";
import { setup, TODAY, type Harness } from "./helpers";

afterEach(() => {
  vi.useRealTimers();
});

async function withTool(h: Harness) {
  const toolId = await h.addTool(h.alice.id);
  return toolId;
}

const statusOf = (h: Harness, id: Id<"loans">) =>
  h.t.run(async (ctx) => (await ctx.db.get(id))?.status);

describe("state machine", () => {
  it("allows only the documented transitions", () => {
    expect(canTransition("requested", "approved")).toBe(true);
    expect(canTransition("requested", "declined")).toBe(true);
    expect(canTransition("requested", "cancelled")).toBe(true);
    expect(canTransition("approved", "returned")).toBe(true);
    expect(canTransition("approved", "cancelled")).toBe(true);
    expect(canTransition("requested", "returned")).toBe(false);
    expect(canTransition("approved", "declined")).toBe(false);
    expect(canTransition("returned", "approved")).toBe(false);
    expect(canTransition("declined", "approved")).toBe(false);
  });

  it("refuses to approve twice", async () => {
    const h = await setup();
    const toolId = await withTool(h);
    const loanId = await h.addLoan(toolId, h.alice.id, h.bob.id, TODAY, TODAY);
    await h.alice.as.mutation(api.loans.approve, { loanId });
    await expect(h.alice.as.mutation(api.loans.approve, { loanId })).rejects.toThrow(/INVALID_TRANSITION/);
  });
});

describe("requesting", () => {
  it("rejects bad date ranges", async () => {
    const h = await setup();
    const toolId = await withTool(h);
    const attempt = (startDate: string, endDate: string) =>
      h.bob.as.mutation(api.loans.request, { toolId, startDate, endDate });

    await expect(attempt("2026-06-20", "2026-06-19")).rejects.toThrow(/INVALID_DATES/);
    await expect(attempt("2026-06-10", "2026-06-12")).rejects.toThrow(/INVALID_DATES/);
    await expect(attempt("2026-06-20", "2026-07-30")).rejects.toThrow(/INVALID_DATES/);
    await expect(attempt("not-a-date", "2026-06-20")).rejects.toThrow(/INVALID_DATES/);
    await expect(attempt("2026-02-30", "2026-03-01")).rejects.toThrow(/INVALID_DATES/);
  });

  it("gives a day of grace for time zones west of UTC", async () => {
    const h = await setup();
    const toolId = await withTool(h);
    await h.bob.as.mutation(api.loans.request, {
      toolId,
      startDate: "2026-06-14",
      endDate: "2026-06-16",
    });
    expect(await h.bob.as.query(api.loans.myRequests, {})).toHaveLength(1);
  });

  it("rejects borrowing your own tool", async () => {
    const h = await setup();
    const toolId = await withTool(h);
    await expect(
      h.alice.as.mutation(api.loans.request, { toolId, startDate: TODAY, endDate: TODAY }),
    ).rejects.toThrow(/OWN_TOOL/);
  });

  it("rejects a removed tool", async () => {
    const h = await setup();
    const toolId = await withTool(h);
    await h.t.run((ctx) => ctx.db.patch(toolId, { removedAt: 1 }));
    await expect(
      h.bob.as.mutation(api.loans.request, { toolId, startDate: TODAY, endDate: TODAY }),
    ).rejects.toThrow(/TOOL_REMOVED/);
  });

  it("rejects a duplicate open request", async () => {
    const h = await setup();
    const toolId = await withTool(h);
    const args = { toolId, startDate: TODAY, endDate: TODAY };
    await h.bob.as.mutation(api.loans.request, args);
    await expect(h.bob.as.mutation(api.loans.request, args)).rejects.toThrow(/DUPLICATE_REQUEST/);
  });

  it("rejects dates overlapping an approved loan", async () => {
    const h = await setup();
    const toolId = await withTool(h);
    await h.addLoan(toolId, h.alice.id, h.carol.id, "2026-06-20", "2026-06-25", "approved");
    await expect(
      h.bob.as.mutation(api.loans.request, { toolId, startDate: "2026-06-25", endDate: "2026-06-26" }),
    ).rejects.toThrow(/TOOL_BOOKED/);
  });

  it("treats an overdue loan as blocking every later date", async () => {
    const h = await setup();
    const toolId = await withTool(h);
    await h.addLoan(toolId, h.alice.id, h.carol.id, "2026-06-01", "2026-06-05", "approved");
    await expect(
      h.bob.as.mutation(api.loans.request, { toolId, startDate: "2026-07-01", endDate: "2026-07-02" }),
    ).rejects.toThrow(/TOOL_BOOKED/);
  });
});

describe("approving", () => {
  it("re-checks overlap, so the second of two conflicting requests fails", async () => {
    const h = await setup();
    const toolId = await withTool(h);
    const first = await h.addLoan(toolId, h.alice.id, h.bob.id, "2026-06-20", "2026-06-22");
    const second = await h.addLoan(toolId, h.alice.id, h.carol.id, "2026-06-21", "2026-06-23");

    await h.alice.as.mutation(api.loans.approve, { loanId: first });
    await expect(h.alice.as.mutation(api.loans.approve, { loanId: second })).rejects.toThrow(/TOOL_BOOKED/);
  });

  it("refuses a request whose start date has passed", async () => {
    const h = await setup();
    const toolId = await withTool(h);
    const loanId = await h.addLoan(toolId, h.alice.id, h.bob.id, "2026-06-10", "2026-06-20");
    await expect(h.alice.as.mutation(api.loans.approve, { loanId })).rejects.toThrow(/REQUEST_EXPIRED/);
  });

  it("stores the earliest approved loan on the tool", async () => {
    const h = await setup();
    const toolId = await withTool(h);
    const later = await h.addLoan(toolId, h.alice.id, h.bob.id, "2026-06-20", "2026-06-22");
    const sooner = await h.addLoan(toolId, h.alice.id, h.carol.id, "2026-06-16", "2026-06-17");

    await h.alice.as.mutation(api.loans.approve, { loanId: later });
    await h.alice.as.mutation(api.loans.approve, { loanId: sooner });
    let tool = await h.t.run((ctx) => ctx.db.get(toolId));
    expect(tool?.activeLoan?.startDate).toBe("2026-06-16");

    await h.alice.as.mutation(api.loans.markReturned, { loanId: sooner });
    tool = await h.t.run((ctx) => ctx.db.get(toolId));
    expect(tool?.activeLoan?.startDate).toBe("2026-06-20");

    await h.alice.as.mutation(api.loans.markReturned, { loanId: later });
    tool = await h.t.run((ctx) => ctx.db.get(toolId));
    expect(tool?.activeLoan).toBeUndefined();
  });
});

describe("cancelling", () => {
  it("lets the borrower withdraw a request but not the lender", async () => {
    const h = await setup();
    const toolId = await withTool(h);
    const loanId = await h.addLoan(toolId, h.alice.id, h.bob.id, TODAY, TODAY);

    await expect(h.alice.as.mutation(api.loans.cancel, { loanId })).rejects.toThrow(/FORBIDDEN/);
    await h.bob.as.mutation(api.loans.cancel, { loanId });
    expect(await statusOf(h, loanId)).toBe("cancelled");
  });

  it("lets either party cancel an approved loan before it starts", async () => {
    const h = await setup();
    const toolId = await withTool(h);
    const loanId = await h.addLoan(toolId, h.alice.id, h.bob.id, "2026-06-20", "2026-06-22", "approved");

    await h.alice.as.mutation(api.loans.cancel, { loanId });
    const tool = await h.t.run((ctx) => ctx.db.get(toolId));
    expect(await statusOf(h, loanId)).toBe("cancelled");
    expect(tool?.activeLoan).toBeUndefined();
  });

  it("closes the window once the loan has started", async () => {
    const h = await setup();
    const toolId = await withTool(h);
    const loanId = await h.addLoan(toolId, h.alice.id, h.bob.id, "2026-06-10", "2026-06-12", "approved");
    await expect(h.bob.as.mutation(api.loans.cancel, { loanId })).rejects.toThrow(/CANCEL_WINDOW_CLOSED/);
  });
});

describe("pickup note", () => {
  it("reaches the borrower only while the loan is approved, then is deleted", async () => {
    const h = await setup();
    const toolId = await withTool(h);
    const loanId = await h.addLoan(toolId, h.alice.id, h.bob.id, TODAY, TODAY);
    const pickupNote = "Side gate after 6pm";

    await h.alice.as.mutation(api.loans.approve, { loanId, pickupNote });
    expect((await h.bob.as.query(api.loans.myRequests, {}))[0].pickupNote).toBe(pickupNote);

    await h.alice.as.mutation(api.loans.markReturned, { loanId });
    expect((await h.bob.as.query(api.loans.myRequests, {}))[0].pickupNote).toBeUndefined();
    const loan = await h.t.run((ctx) => ctx.db.get(loanId));
    expect(loan?.pickupNote).toBeUndefined();
  });

  it("is not visible to an admin or in the audit log", async () => {
    const h = await setup();
    const toolId = await withTool(h);
    const loanId = await h.addLoan(toolId, h.alice.id, h.bob.id, TODAY, TODAY);
    const pickupNote = "Secret side gate";
    await h.alice.as.mutation(api.loans.approve, { loanId, pickupNote });

    const loans = await h.admin.as.query(api.admin.allLoans, {
      paginationOpts: { numItems: 10, cursor: null },
    });
    const audit = await h.t.run((ctx) => ctx.db.query("auditLog").collect());
    expect(JSON.stringify(loans)).not.toContain(pickupNote);
    expect(JSON.stringify(audit)).not.toContain(pickupNote);
  });

  it("enforces the length limit", async () => {
    const h = await setup();
    const toolId = await withTool(h);
    const loanId = await h.addLoan(toolId, h.alice.id, h.bob.id, TODAY, TODAY);
    await expect(
      h.alice.as.mutation(api.loans.approve, { loanId, pickupNote: "x".repeat(201) }),
    ).rejects.toThrow(/INVALID_INPUT/);
  });
});

describe("admin removal", () => {
  it("cancels open and unstarted loans and leaves a running loan alone", async () => {
    const h = await setup();
    const toolId = await withTool(h);
    const open = await h.addLoan(toolId, h.alice.id, h.bob.id, "2026-07-01", "2026-07-02");
    const future = await h.addLoan(toolId, h.alice.id, h.carol.id, "2026-06-20", "2026-06-21", "approved");
    const running = await h.addLoan(toolId, h.alice.id, h.carol.id, "2026-06-14", "2026-06-16", "approved");

    await h.admin.as.mutation(api.admin.removeListing, { toolId });

    expect(await statusOf(h, open)).toBe("cancelled");
    expect(await statusOf(h, future)).toBe("cancelled");
    expect(await statusOf(h, running)).toBe("approved");
  });
});

describe("audit trail", () => {
  it("records each loan transition", async () => {
    const h = await setup();
    const toolId = await withTool(h);
    const loanId = await h.bob.as.mutation(api.loans.request, { toolId, startDate: TODAY, endDate: TODAY });
    await h.alice.as.mutation(api.loans.approve, { loanId });
    await h.alice.as.mutation(api.loans.markReturned, { loanId });

    const actions = await h.t.run(async (ctx) =>
      (await ctx.db.query("auditLog").collect()).map((entry) => entry.action),
    );
    expect(actions).toEqual(["loan.requested", "loan.approved", "loan.returned"]);
  });
});
