import { afterEach, describe, expect, it, vi } from "vitest";
import { api } from "../convex/_generated/api";
import { setup, TODAY } from "./helpers";

afterEach(() => {
  vi.useRealTimers();
});

const input = {
  name: "  Hammer  ",
  category: "hand_tools" as const,
  condition: "good" as const,
  description: " Claw hammer ",
};

describe("public list", () => {
  it("exposes exactly name and category", async () => {
    const { t, alice, addTool } = await setup();
    await addTool(alice.id, "Drill");

    const tools = await t.query(api.tools.listPublic, {});
    expect(tools).toEqual([{ name: "Drill", category: "power_tools" }]);
    expect(Object.keys(tools[0]).sort()).toEqual(["category", "name"]);
  });

  it("hides removed tools and tools with an approved loan", async () => {
    const { t, alice, bob, addTool, addLoan } = await setup();
    await addTool(alice.id, "Visible");
    const lent = await addTool(alice.id, "Lent");
    await addLoan(lent, alice.id, bob.id, TODAY, TODAY, "approved");
    const removed = await addTool(alice.id, "Removed");
    await t.run((ctx) => ctx.db.patch(removed, { removedAt: 1 }));

    const tools = await t.query(api.tools.listPublic, {});
    expect(tools.map((tool) => tool.name)).toEqual(["Visible"]);
  });

  it("is capped", async () => {
    const { t, alice, addTool } = await setup();
    for (let i = 0; i < 55; i++) await addTool(alice.id, `Tool ${i}`);
    expect(await t.query(api.tools.listPublic, {})).toHaveLength(50);
  });
});

describe("member list", () => {
  it("shows the owner's name but no borrower identity", async () => {
    const { alice, bob, addTool, addLoan } = await setup();
    const toolId = await addTool(alice.id);
    await addLoan(toolId, alice.id, bob.id, TODAY, TODAY, "approved");

    const { page } = await bob.as.query(api.tools.listForMembers, {
      paginationOpts: { numItems: 10, cursor: null },
    });
    expect(page[0].ownerName).toBe("Alice Rao");
    expect(page[0].activeLoan).toEqual({ startDate: TODAY, endDate: TODAY });
    expect(JSON.stringify(page[0])).not.toContain("Bob");
  });

  it("filters by category", async () => {
    const { alice, addTool } = await setup();
    await addTool(alice.id);
    const paginationOpts = { numItems: 10, cursor: null };

    const garden = await alice.as.query(api.tools.listForMembers, {
      category: "garden",
      paginationOpts,
    });
    const power = await alice.as.query(api.tools.listForMembers, {
      category: "power_tools",
      paginationOpts,
    });
    expect(garden.page).toHaveLength(0);
    expect(power.page).toHaveLength(1);
  });
});

describe("writes", () => {
  it("trims input", async () => {
    const { t, alice } = await setup();
    const toolId = await alice.as.mutation(api.tools.create, input);
    const tool = await t.run((ctx) => ctx.db.get(toolId));
    expect(tool?.name).toBe("Hammer");
    expect(tool?.description).toBe("Claw hammer");
  });

  it("rejects oversized and empty fields", async () => {
    const { alice } = await setup();
    await expect(
      alice.as.mutation(api.tools.create, { ...input, name: "x".repeat(81) }),
    ).rejects.toThrow(/INVALID_INPUT/);
    await expect(
      alice.as.mutation(api.tools.create, { ...input, description: "   " }),
    ).rejects.toThrow(/INVALID_INPUT/);
  });

  it("rejects a category outside the list", async () => {
    const { alice } = await setup();
    await expect(
      alice.as.mutation(api.tools.create, { ...input, category: "weapons" } as never),
    ).rejects.toThrow();
  });

  it("will not delete a listing with an approved loan", async () => {
    const { alice, bob, addTool, addLoan } = await setup();
    const toolId = await addTool(alice.id);
    await addLoan(toolId, alice.id, bob.id, TODAY, TODAY, "approved");
    await expect(alice.as.mutation(api.tools.remove, { toolId })).rejects.toThrow(/TOOL_ON_LOAN/);
  });

  it("cancels open requests when a listing is deleted", async () => {
    const { t, alice, bob, addTool, addLoan } = await setup();
    const toolId = await addTool(alice.id);
    const loanId = await addLoan(toolId, alice.id, bob.id, TODAY, TODAY);

    await alice.as.mutation(api.tools.remove, { toolId });
    const loan = await t.run((ctx) => ctx.db.get(loanId));
    expect(loan?.status).toBe("cancelled");
  });
});
