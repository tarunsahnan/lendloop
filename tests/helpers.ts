/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { vi } from "vitest";
import type { Id } from "../convex/_generated/dataModel";
import schema from "../convex/schema";

const modules = import.meta.glob("../convex/**/*.*s");

export const NOW = new Date("2026-06-15T12:00:00Z");
export const TODAY = "2026-06-15";

export type Harness = Awaited<ReturnType<typeof setup>>;

type Role = "admin" | "user";

export async function setup() {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  const t = convexTest(schema, modules);

  const addUser = async (name: string, role: Role = "user") => {
    const tokenIdentifier = `test|${name}`;
    const id = await t.run((ctx) =>
      ctx.db.insert("users", {
        tokenIdentifier,
        displayName: name,
        role,
        isTrustedLender: false,
      }),
    );
    return { id, as: t.withIdentity({ tokenIdentifier, name }) };
  };

  const alice = await addUser("Alice Rao");
  const bob = await addUser("Bob Stone");
  const carol = await addUser("Carol Diaz");
  const admin = await addUser("Ada Admin", "admin");

  const addTool = (ownerId: Id<"users">, name = "Drill") =>
    t.run((ctx) =>
      ctx.db.insert("tools", {
        ownerId,
        name,
        category: "power_tools",
        condition: "good",
        description: "Private detail",
      }),
    );

  const addLoan = (
    toolId: Id<"tools">,
    lenderId: Id<"users">,
    borrowerId: Id<"users">,
    startDate: string,
    endDate: string,
    status: "requested" | "approved" | "returned" = "requested",
  ) =>
    t.run(async (ctx) => {
      const loanId = await ctx.db.insert("loans", {
        toolId,
        lenderId,
        borrowerId,
        startDate,
        endDate,
        status,
      });
      if (status === "approved") {
        await ctx.db.patch(toolId, { activeLoan: { startDate, endDate } });
      }
      return loanId;
    });

  return { t, alice, bob, carol, admin, addUser, addTool, addLoan };
}
