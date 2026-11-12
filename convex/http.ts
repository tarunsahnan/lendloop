import { httpRouter } from "convex/server";
import { internal } from "./_generated/api";
import { httpAction, type ActionCtx } from "./_generated/server";
import { utcToday } from "./lib/dates";
import {
  isValidSignature,
  SIGNATURE_HEADER,
  TIMESTAMP_HEADER,
} from "./lib/hmac";

type Handler = (ctx: ActionCtx, body: unknown) => Promise<Response>;

function json(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object"
    ? (value as Record<string, unknown>)
    : {};
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

/** Verifies the signature over the raw bytes before anything is parsed. Failures reveal no detail. */
function signedRoute(handler: Handler) {
  return httpAction(async (ctx, request) => {
    const secret = process.env.N8N_TO_CONVEX_SECRET;
    if (!secret) return new Response(null, { status: 503 });

    const rawBody = await request.text();
    const valid = await isValidSignature(
      secret,
      request.headers.get(TIMESTAMP_HEADER),
      request.headers.get(SIGNATURE_HEADER),
      {
        method: request.method,
        path: new URL(request.url).pathname,
        body: rawBody,
      },
      Date.now(),
    );
    if (!valid) return new Response(null, { status: 401 });

    let body: unknown = {};
    if (rawBody) {
      try {
        body = JSON.parse(rawBody);
      } catch {
        return new Response(null, { status: 400 });
      }
    }
    return handler(ctx, body);
  });
}

const http = httpRouter();

http.route({
  path: "/n8n/overdue-loans",
  method: "GET",
  handler: signedRoute(async (ctx) => {
    const today = utcToday(Date.now());
    const loans = await ctx.runQuery(internal.reminders.overdueLoans, { today });
    return json({ today, loans });
  }),
});

http.route({
  path: "/n8n/reminders/claim",
  method: "POST",
  handler: signedRoute(async (ctx, body) => {
    const reminderKey = optionalString(asRecord(body).reminderKey);
    if (!reminderKey) return new Response(null, { status: 400 });
    return json(await ctx.runMutation(internal.reminders.claim, { reminderKey }));
  }),
});

http.route({
  path: "/n8n/reminders/result",
  method: "POST",
  handler: signedRoute(async (ctx, body) => {
    const { reminderKey, status, errorCode } = asRecord(body);
    const key = optionalString(reminderKey);
    if (!key || (status !== "sent" && status !== "failed")) {
      return new Response(null, { status: 400 });
    }
    return json(
      await ctx.runMutation(internal.reminders.recordResult, {
        reminderKey: key,
        status,
        errorCode: optionalString(errorCode),
      }),
    );
  }),
});

http.route({
  path: "/n8n/automation-failure",
  method: "POST",
  handler: signedRoute(async (ctx, body) => {
    const { executionId, workflowName, failedNode } = asRecord(body);
    await ctx.runMutation(internal.notifications.recordWorkflowFailure, {
      executionId: optionalString(executionId),
      workflowName: optionalString(workflowName) ?? "unknown",
      failedNode: optionalString(failedNode) ?? "unknown",
    });
    return json({ recorded: true });
  }),
});

export default http;
