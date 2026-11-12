import { afterEach, describe, expect, it, vi } from "vitest";
import { api, internal } from "../convex/_generated/api";
import { setup, TODAY } from "./helpers";

afterEach(() => {
  vi.useRealTimers();
});

const toolInput = {
  name: "Hammer",
  category: "hand_tools" as const,
  condition: "good" as const,
  description: "Claw hammer",
};
const page = { paginationOpts: { numItems: 10, cursor: null } };

describe("anonymous callers", () => {
  it("are rejected from every member function", async () => {
    const { t, alice, addTool, bob, addLoan } = await setup();
    const toolId = await addTool(alice.id);
    const loanId = await addLoan(toolId, alice.id, bob.id, TODAY, TODAY);
    const denied = /UNAUTHENTICATED/;

    await expect(t.query(api.tools.listForMembers, page)).rejects.toThrow(denied);
    await expect(t.query(api.tools.listMine, {})).rejects.toThrow(denied);
    await expect(t.query(api.loans.myRequests, {})).rejects.toThrow(denied);
    await expect(t.query(api.loans.incoming, {})).rejects.toThrow(denied);
    await expect(t.mutation(api.tools.create, toolInput)).rejects.toThrow(denied);
    await expect(t.mutation(api.tools.remove, { toolId })).rejects.toThrow(denied);
    await expect(
      t.mutation(api.loans.request, { toolId, startDate: TODAY, endDate: TODAY }),
    ).rejects.toThrow(denied);
    await expect(t.mutation(api.loans.approve, { loanId })).rejects.toThrow(denied);
    await expect(t.mutation(api.users.ensureUser, {})).rejects.toThrow(denied);
  });
});

describe("listing ownership", () => {
  it("stops a user editing or deleting someone else's listing", async () => {
    const { alice, bob, addTool } = await setup();
    const toolId = await addTool(alice.id);

    await expect(
      bob.as.mutation(api.tools.update, { toolId, ...toolInput }),
    ).rejects.toThrow(/FORBIDDEN/);
    await expect(bob.as.mutation(api.tools.remove, { toolId })).rejects.toThrow(
      /FORBIDDEN/,
    );
  });

  it("gives an admin removal rights but not edit rights", async () => {
    const { t, alice, admin, addTool } = await setup();
    const toolId = await addTool(alice.id);

    await expect(
      admin.as.mutation(api.tools.update, { toolId, ...toolInput }),
    ).rejects.toThrow(/FORBIDDEN/);

    await admin.as.mutation(api.admin.removeListing, { toolId });
    const tool = await t.run((ctx) => ctx.db.get(toolId));
    expect(tool?.removedAt).toBeDefined();
  });
});

describe("loan actions", () => {
  it("lets only the lender approve, decline or mark returned", async () => {
    const { alice, bob, carol, addTool, addLoan } = await setup();
    const toolId = await addTool(alice.id);
    const loanId = await addLoan(toolId, alice.id, bob.id, TODAY, TODAY);

    for (const actor of [bob, carol]) {
      await expect(actor.as.mutation(api.loans.approve, { loanId })).rejects.toThrow(/FORBIDDEN/);
      await expect(actor.as.mutation(api.loans.decline, { loanId })).rejects.toThrow(/FORBIDDEN/);
      await expect(actor.as.mutation(api.loans.markReturned, { loanId })).rejects.toThrow(/FORBIDDEN/);
    }
  });

  it("gives an admin no owner rights over another user's loan", async () => {
    const { alice, bob, admin, addTool, addLoan } = await setup();
    const toolId = await addTool(alice.id);
    const loanId = await addLoan(toolId, alice.id, bob.id, TODAY, TODAY);

    await expect(admin.as.mutation(api.loans.approve, { loanId })).rejects.toThrow(/FORBIDDEN/);
  });

  it("treats an admin who owns a tool like any other owner", async () => {
    const { t, bob, admin, addTool, addLoan } = await setup();
    const toolId = await addTool(admin.id);
    const loanId = await addLoan(toolId, admin.id, bob.id, TODAY, TODAY);

    await admin.as.mutation(api.loans.approve, { loanId });
    const loan = await t.run((ctx) => ctx.db.get(loanId));
    expect(loan?.status).toBe("approved");
  });

  it("keeps a stranger out of cancel", async () => {
    const { alice, bob, carol, addTool, addLoan } = await setup();
    const toolId = await addTool(alice.id);
    const loanId = await addLoan(toolId, alice.id, bob.id, TODAY, TODAY);

    await expect(carol.as.mutation(api.loans.cancel, { loanId })).rejects.toThrow(/FORBIDDEN/);
  });

  it("scopes request lists to the caller", async () => {
    const { alice, bob, carol, addTool, addLoan } = await setup();
    const toolId = await addTool(alice.id);
    await addLoan(toolId, alice.id, bob.id, TODAY, TODAY);

    expect(await bob.as.query(api.loans.myRequests, {})).toHaveLength(1);
    expect(await alice.as.query(api.loans.incoming, {})).toHaveLength(1);
    expect(await carol.as.query(api.loans.myRequests, {})).toHaveLength(0);
    expect(await carol.as.query(api.loans.incoming, {})).toHaveLength(0);
  });
});

describe("admin functions", () => {
  it("reject the user role", async () => {
    const { alice, bob, addTool } = await setup();
    const toolId = await addTool(alice.id);
    const denied = /FORBIDDEN/;

    await expect(bob.as.query(api.admin.allLoans, page)).rejects.toThrow(denied);
    await expect(bob.as.query(api.admin.allListings, page)).rejects.toThrow(denied);
    await expect(bob.as.query(api.admin.allUsers, {})).rejects.toThrow(denied);
    await expect(bob.as.query(api.admin.automationFailures, {})).rejects.toThrow(denied);
    await expect(bob.as.mutation(api.admin.removeListing, { toolId })).rejects.toThrow(denied);
    await expect(
      bob.as.mutation(api.admin.setTrustedLender, { userId: bob.id, trusted: true }),
    ).rejects.toThrow(denied);
  });

  it("write an audit entry", async () => {
    const { t, bob, admin } = await setup();
    await admin.as.mutation(api.admin.setTrustedLender, { userId: bob.id, trusted: true });
    const entries = await t.run((ctx) => ctx.db.query("auditLog").collect());
    expect(entries.map((entry) => entry.action)).toContain("admin.trusted_granted");
  });
});

describe("user creation", () => {
  it("always creates role user and ignores repeat calls", async () => {
    const { t } = await setup();
    const newcomer = t.withIdentity({ tokenIdentifier: "test|new", name: "New Person" });

    const first = await newcomer.mutation(api.users.ensureUser, {});
    expect(first.role).toBe("user");

    await t.run((ctx) => ctx.db.patch(first._id, { role: "admin" }));
    const second = await newcomer.mutation(api.users.ensureUser, {});
    expect(second.role).toBe("admin");
    expect(second._id).toBe(first._id);
  });

  it("refuses a role passed by the client", async () => {
    const { t } = await setup();
    const newcomer = t.withIdentity({ tokenIdentifier: "test|new", name: "New" });
    await expect(
      newcomer.mutation(api.users.ensureUser, { role: "admin" } as never),
    ).rejects.toThrow();
  });

  it("falls back when the token has no name", async () => {
    const { t } = await setup();
    const nameless = t.withIdentity({ tokenIdentifier: "test|anon" });
    const user = await nameless.mutation(api.users.ensureUser, {});
    expect(user.displayName).toBe("Neighbor");
  });

  it("promotes only through the internal function", async () => {
    const { t, alice } = await setup();
    const result = await t.mutation(internal.users.promoteToAdmin, {
      displayName: "Alice Rao",
    });
    expect(result.promoted).toBe("Alice Rao");
    const user = await t.run((ctx) => ctx.db.get(alice.id));
    expect(user?.role).toBe("admin");
  });
});
