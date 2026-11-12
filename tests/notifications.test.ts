import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api, internal } from "../convex/_generated/api";
import type { Id } from "../convex/_generated/dataModel";
import { isValidSignature, SIGNATURE_HEADER, TIMESTAMP_HEADER } from "../convex/lib/hmac";
import { setup, TODAY, type Harness } from "./helpers";

const SECRET = "test-outbound-secret";
const URL_N8N = "http://n8n.test/webhook/lendloop-loan-event";

beforeEach(() => {
  vi.stubEnv("CONVEX_TO_N8N_SECRET", SECRET);
  vi.stubEnv("N8N_LOAN_EVENT_URL", URL_N8N);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

async function requestLoan(h: Harness) {
  const toolId = await h.addTool(h.alice.id);
  const loanId = await h.bob.as.mutation(api.loans.request, {
    toolId,
    startDate: TODAY,
    endDate: TODAY,
  });
  const [row] = await h.t.run((ctx) => ctx.db.query("notifications").collect());
  return { toolId, loanId, row };
}

const rowOf = (h: Harness, id: Id<"notifications">) =>
  h.t.run((ctx) => ctx.db.get(id));

describe("enqueue", () => {
  it("writes one pending row addressed to the lender", async () => {
    const h = await setup();
    const { row } = await requestLoan(h);
    expect(row.status).toBe("pending");
    expect(row.type).toBe("loan.requested");
    expect(row.recipientUserId).toBe(h.alice.id);
  });

  it("writes nothing when the mutation fails", async () => {
    const h = await setup();
    const toolId = await h.addTool(h.alice.id);
    await expect(
      h.alice.as.mutation(api.loans.request, { toolId, startDate: TODAY, endDate: TODAY }),
    ).rejects.toThrow();
    const rows = await h.t.run((ctx) => ctx.db.query("notifications").collect());
    expect(rows).toHaveLength(0);
  });

  it("addresses the other party on cancel", async () => {
    const h = await setup();
    const { loanId } = await requestLoan(h);
    await h.bob.as.mutation(api.loans.cancel, { loanId });
    const rows = await h.t.run((ctx) => ctx.db.query("notifications").collect());
    expect(rows[1].type).toBe("loan.cancelled");
    expect(rows[1].recipientUserId).toBe(h.alice.id);
  });
});

describe("payload", () => {
  it("contains exactly the allowlisted fields", async () => {
    const h = await setup();
    const { row } = await requestLoan(h);
    const payload = await h.t.query(internal.notifications.buildPayload, {
      notificationId: row._id,
      attempt: 1,
    });

    expect(Object.keys(payload!).sort()).toEqual(
      ["attempt", "endDate", "eventId", "loanId", "recipient", "startDate", "toolName", "type"].sort(),
    );
    expect(Object.keys(payload!.recipient).sort()).toEqual(["firstName", "id"]);
    expect(payload!.recipient.firstName).toBe("Alice");
    expect(JSON.stringify(payload)).not.toContain("Private detail");
  });

  it("never carries the pickup note", async () => {
    const h = await setup();
    const { loanId } = await requestLoan(h);
    await h.alice.as.mutation(api.loans.approve, { loanId, pickupNote: "Side gate" });
    const rows = await h.t.run((ctx) => ctx.db.query("notifications").collect());
    const payload = await h.t.query(internal.notifications.buildPayload, {
      notificationId: rows[1]._id,
      attempt: 1,
    });
    expect(JSON.stringify(payload)).not.toContain("Side gate");
  });
});

describe("delivery", () => {
  it("signs the exact bytes it sends and marks the row sent", async () => {
    const h = await setup();
    const { row } = await requestLoan(h);
    const fetchMock = vi.fn(async () => new Response(null, { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await h.t.action(internal.notifications.deliver, { notificationId: row._id, attempt: 1 });

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    const headers = init.headers as Record<string, string>;
    expect(url).toBe(URL_N8N);
    expect(
      await isValidSignature(
        SECRET,
        headers[TIMESTAMP_HEADER],
        headers[SIGNATURE_HEADER],
        { method: "POST", path: "/webhook/lendloop-loan-event", body: init.body as string },
        Date.now(),
      ),
    ).toBe(true);
    expect((await rowOf(h, row._id))?.status).toBe("sent");
  });

  it("records the failure code and stays pending on a 500", async () => {
    const h = await setup();
    const { row } = await requestLoan(h);
    vi.stubGlobal("fetch", vi.fn(async () => new Response(null, { status: 500 })));

    await h.t.action(internal.notifications.deliver, { notificationId: row._id, attempt: 1 });

    const updated = await rowOf(h, row._id);
    expect(updated?.status).toBe("pending");
    expect(updated?.lastErrorCode).toBe("HTTP_500");
  });

  it("records a network failure", async () => {
    const h = await setup();
    const { row } = await requestLoan(h);
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("offline"); }));

    await h.t.action(internal.notifications.deliver, { notificationId: row._id, attempt: 1 });
    expect((await rowOf(h, row._id))?.lastErrorCode).toBe("NETWORK");
  });

  it("does not send a row that is no longer pending", async () => {
    const h = await setup();
    const { row } = await requestLoan(h);
    await h.t.mutation(internal.notifications.markSent, { notificationId: row._id });
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await h.t.action(internal.notifications.deliver, { notificationId: row._id, attempt: 2 });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("tick", () => {
  it("counts attempts and marks the row failed when they run out", async () => {
    const h = await setup();
    const { row } = await requestLoan(h);

    for (let attempt = 1; attempt <= 3; attempt++) {
      await h.t.mutation(internal.notifications.tick, { notificationId: row._id });
      expect((await rowOf(h, row._id))?.attempts).toBe(attempt);
      expect((await rowOf(h, row._id))?.status).toBe("pending");
    }

    await h.t.mutation(internal.notifications.tick, { notificationId: row._id });
    const final = await rowOf(h, row._id);
    expect(final?.status).toBe("failed");
    expect(final?.lastErrorCode).toBe("NO_RESPONSE");
  });

  it("stops once the row is sent", async () => {
    const h = await setup();
    const { row } = await requestLoan(h);
    await h.t.mutation(internal.notifications.markSent, { notificationId: row._id });
    await h.t.mutation(internal.notifications.tick, { notificationId: row._id });
    expect((await rowOf(h, row._id))?.attempts).toBe(0);
  });
});

describe("redeliver", () => {
  it("is admin only and re-opens a failed row", async () => {
    const h = await setup();
    const { row } = await requestLoan(h);
    await h.t.run((ctx) => ctx.db.patch(row._id, { status: "failed", attempts: 3 }));

    await expect(
      h.bob.as.mutation(api.admin.redeliver, { notificationId: row._id }),
    ).rejects.toThrow(/FORBIDDEN/);

    await h.admin.as.mutation(api.admin.redeliver, { notificationId: row._id });
    const updated = await rowOf(h, row._id);
    expect(updated?.status).toBe("pending");
    expect(updated?.attempts).toBe(0);
  });
});

describe("activity", () => {
  it("is shown on the loan", async () => {
    const h = await setup();
    await requestLoan(h);
    const [loan] = await h.bob.as.query(api.loans.myRequests, {});
    expect(loan.activity[0]).toMatchObject({ kind: "loan_event", status: "pending" });
  });
});
