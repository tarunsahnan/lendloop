import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { signatureHeaders, SIGNATURE_HEADER, TIMESTAMP_HEADER } from "../convex/lib/hmac";
import { NOW, setup, TODAY, type Harness } from "./helpers";

const SECRET = "test-inbound-secret";

beforeEach(() => {
  vi.stubEnv("N8N_TO_CONVEX_SECRET", SECRET);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

const signed = (method: string, path: string, body = "", at = NOW.getTime(), secret = SECRET) =>
  signatureHeaders(secret, { method, path, body }, at);

async function post(h: Harness, path: string, payload: unknown) {
  const body = JSON.stringify(payload);
  return h.t.fetch(path, { method: "POST", body, headers: await signed("POST", path, body) });
}

describe("signature checks", () => {
  const path = "/n8n/overdue-loans";

  it("accepts a valid request", async () => {
    const h = await setup();
    const response = await h.t.fetch(path, { method: "GET", headers: await signed("GET", path) });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ today: TODAY, loans: [] });
  });

  it("rejects missing headers", async () => {
    const h = await setup();
    expect((await h.t.fetch(path, { method: "GET" })).status).toBe(401);
  });

  it("rejects the wrong secret", async () => {
    const h = await setup();
    const headers = await signed("GET", path, "", NOW.getTime(), "other-secret");
    expect((await h.t.fetch(path, { method: "GET", headers })).status).toBe(401);
  });

  it("rejects an expired timestamp", async () => {
    const h = await setup();
    const headers = await signed("GET", path, "", NOW.getTime() - 301_000);
    expect((await h.t.fetch(path, { method: "GET", headers })).status).toBe(401);
  });

  it("rejects a short or malformed signature without erroring", async () => {
    const h = await setup();
    for (const value of ["v1=abc", "abc", "v1=", `v1=${"z".repeat(64)}`]) {
      const headers = { ...(await signed("GET", path)), [SIGNATURE_HEADER]: value };
      expect((await h.t.fetch(path, { method: "GET", headers })).status).toBe(401);
    }
  });

  it("rejects a tampered timestamp", async () => {
    const h = await setup();
    const headers = await signed("GET", path);
    headers[TIMESTAMP_HEADER] = String(Number(headers[TIMESTAMP_HEADER]) + 1);
    expect((await h.t.fetch(path, { method: "GET", headers })).status).toBe(401);
  });

  it("rejects a signature replayed against another endpoint", async () => {
    const h = await setup();
    const body = JSON.stringify({ reminderKey: "reminder:x:2026-06-15" });
    const headers = await signed("POST", "/n8n/reminders/claim", body);
    const response = await h.t.fetch("/n8n/reminders/result", { method: "POST", body, headers });
    expect(response.status).toBe(401);
  });

  it("rejects a changed body", async () => {
    const h = await setup();
    const headers = await signed("POST", "/n8n/reminders/claim", '{"reminderKey":"a"}');
    const response = await h.t.fetch("/n8n/reminders/claim", {
      method: "POST",
      body: '{"reminderKey":"b"}',
      headers,
    });
    expect(response.status).toBe(401);
  });

  it("returns 503 when the secret is not configured", async () => {
    const h = await setup();
    vi.stubEnv("N8N_TO_CONVEX_SECRET", "");
    const response = await h.t.fetch(path, { method: "GET", headers: await signed("GET", path) });
    expect(response.status).toBe(503);
  });
});

describe("endpoints", () => {
  it("runs claim and result end to end", async () => {
    const h = await setup();
    const toolId = await h.addTool(h.alice.id);
    const loanId = await h.addLoan(toolId, h.alice.id, h.bob.id, "2026-06-01", "2026-06-10", "approved");
    const reminderKey = `reminder:${loanId}:${TODAY}`;

    const first = await post(h, "/n8n/reminders/claim", { reminderKey });
    expect(await first.json()).toEqual({ claimed: true });

    const again = await post(h, "/n8n/reminders/claim", { reminderKey });
    expect(await again.json()).toEqual({ claimed: false });

    const result = await post(h, "/n8n/reminders/result", { reminderKey, status: "sent" });
    expect(await result.json()).toEqual({ found: true, status: "sent" });
  });

  it("rejects bad payloads after a valid signature", async () => {
    const h = await setup();
    expect((await post(h, "/n8n/reminders/claim", {})).status).toBe(400);
    expect(
      (await post(h, "/n8n/reminders/result", { reminderKey: "k", status: "maybe" })).status,
    ).toBe(400);

    const body = "{not json";
    const response = await h.t.fetch("/n8n/reminders/claim", {
      method: "POST",
      body,
      headers: await signed("POST", "/n8n/reminders/claim", body),
    });
    expect(response.status).toBe(400);
  });

  it("records a workflow failure", async () => {
    const h = await setup();
    const response = await post(h, "/n8n/automation-failure", {
      executionId: "7",
      workflowName: "Overdue Reminders",
      failedNode: "Notify",
    });
    expect(await response.json()).toEqual({ recorded: true });
    const rows = await h.t.run((ctx) => ctx.db.query("notifications").collect());
    expect(rows[0].key).toBe("n8n:7");
  });
});
