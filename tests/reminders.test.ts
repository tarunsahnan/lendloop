import { afterEach, describe, expect, it, vi } from "vitest";
import { internal } from "../convex/_generated/api";
import { setup, TODAY, type Harness } from "./helpers";

afterEach(() => {
  vi.useRealTimers();
});

async function overdueLoan(h: Harness) {
  const toolId = await h.addTool(h.alice.id);
  const loanId = await h.addLoan(toolId, h.alice.id, h.bob.id, "2026-06-01", "2026-06-10", "approved");
  return { loanId, toolId, key: `reminder:${loanId}:${TODAY}` };
}

const claim = (h: Harness, reminderKey: string) =>
  h.t.mutation(internal.reminders.claim, { reminderKey });

const rows = (h: Harness) =>
  h.t.run((ctx) => ctx.db.query("notifications").collect());

describe("overdue list", () => {
  it("returns exactly the allowlisted fields", async () => {
    const h = await setup();
    const { loanId, key } = await overdueLoan(h);

    const loans = await h.t.query(internal.reminders.overdueLoans, { today: TODAY });
    expect(loans).toEqual([
      {
        loanId,
        reminderKey: key,
        toolName: "Drill",
        dueDate: "2026-06-10",
        daysOverdue: 5,
        recipient: { id: h.bob.id, firstName: "Bob" },
      },
    ]);
  });

  it("skips loans that are not yet due", async () => {
    const h = await setup();
    const toolId = await h.addTool(h.alice.id);
    await h.addLoan(toolId, h.alice.id, h.bob.id, TODAY, TODAY, "approved");
    expect(await h.t.query(internal.reminders.overdueLoans, { today: TODAY })).toEqual([]);
  });
});

describe("claim", () => {
  it("wins once, so a retried run cannot remind twice", async () => {
    const h = await setup();
    const { key } = await overdueLoan(h);

    expect(await claim(h, key)).toEqual({ claimed: true });
    expect(await claim(h, key)).toEqual({ claimed: false });
    expect(await rows(h)).toHaveLength(1);
  });

  it("stays closed after a successful send", async () => {
    const h = await setup();
    const { key } = await overdueLoan(h);
    await claim(h, key);
    await h.t.mutation(internal.reminders.recordResult, { reminderKey: key, status: "sent" });
    expect(await claim(h, key)).toEqual({ claimed: false });
  });

  it("re-opens after a recorded failure", async () => {
    const h = await setup();
    const { key } = await overdueLoan(h);
    await claim(h, key);
    await h.t.mutation(internal.reminders.recordResult, {
      reminderKey: key,
      status: "failed",
      errorCode: "BOUNCE",
    });
    expect(await claim(h, key)).toEqual({ claimed: true });
    expect((await rows(h))[0].attempts).toBe(2);
  });

  it("refuses a loan returned since the list was fetched", async () => {
    const h = await setup();
    const { key, loanId } = await overdueLoan(h);
    await h.t.run((ctx) => ctx.db.patch(loanId, { status: "returned" }));
    expect(await claim(h, key)).toEqual({ claimed: false });
  });

  it("refuses a key for another day or a malformed key", async () => {
    const h = await setup();
    const { loanId } = await overdueLoan(h);
    expect(await claim(h, `reminder:${loanId}:2026-06-14`)).toEqual({ claimed: false });
    expect(await claim(h, "reminder:../../etc:2026-06-15")).toEqual({ claimed: false });
    expect(await rows(h)).toHaveLength(0);
  });

  it("uses a new key on the next day, which is the retry", async () => {
    const h = await setup();
    const { key, loanId } = await overdueLoan(h);
    await claim(h, key);
    vi.setSystemTime(new Date("2026-06-16T12:00:00Z"));
    expect(await claim(h, `reminder:${loanId}:2026-06-16`)).toEqual({ claimed: true });
    expect(await rows(h)).toHaveLength(2);
  });
});

describe("result", () => {
  it("is idempotent and never downgrades a sent row", async () => {
    const h = await setup();
    const { key } = await overdueLoan(h);
    await claim(h, key);
    const write = (status: "sent" | "failed") =>
      h.t.mutation(internal.reminders.recordResult, { reminderKey: key, status });

    await write("sent");
    await write("sent");
    expect(await write("failed")).toEqual({ found: true, status: "sent" });

    const all = await rows(h);
    expect(all).toHaveLength(1);
    expect(all[0].status).toBe("sent");
  });

  it("reports an unknown key without creating a row", async () => {
    const h = await setup();
    const result = await h.t.mutation(internal.reminders.recordResult, {
      reminderKey: "reminder:missing:2026-06-15",
      status: "sent",
    });
    expect(result.found).toBe(false);
    expect(await rows(h)).toHaveLength(0);
  });
});

describe("workflow failures", () => {
  it("are recorded once per execution", async () => {
    const h = await setup();
    const args = { executionId: "42", workflowName: "Reminders", failedNode: "Notify" };
    await h.t.mutation(internal.notifications.recordWorkflowFailure, args);
    await h.t.mutation(internal.notifications.recordWorkflowFailure, args);

    const all = await rows(h);
    expect(all).toHaveLength(1);
    expect(all[0]).toMatchObject({ kind: "workflow_failure", status: "failed" });
  });
});
