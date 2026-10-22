import { describe, expect, it } from "vitest";
import { buildPots, splitPot } from "@/lib/holdem-pots";

describe("side pots", () => {
  it("one short all-in makes a main pot and a side pot", () => {
    const { pots, refunds } = buildPots([
      { id: "a", amount: 100, folded: false },
      { id: "b", amount: 300, folded: false },
      { id: "c", amount: 300, folded: false },
    ]);
    expect(pots).toEqual([
      { amount: 300, eligibleIds: ["a", "b", "c"] },
      { amount: 400, eligibleIds: ["b", "c"] },
    ]);
    expect(refunds).toEqual({});
  });

  it("stacks several all-ins into several side pots", () => {
    const { pots } = buildPots([
      { id: "a", amount: 50, folded: false },
      { id: "b", amount: 120, folded: false },
      { id: "c", amount: 400, folded: false },
      { id: "d", amount: 400, folded: false },
    ]);
    expect(pots).toEqual([
      { amount: 200, eligibleIds: ["a", "b", "c", "d"] },
      { amount: 210, eligibleIds: ["b", "c", "d"] },
      { amount: 560, eligibleIds: ["c", "d"] },
    ]);
  });

  it("returns the part of a bet nobody matched", () => {
    const { pots, refunds } = buildPots([
      { id: "a", amount: 100, folded: false },
      { id: "b", amount: 500, folded: false },
    ]);
    expect(pots).toEqual([{ amount: 200, eligibleIds: ["a", "b"] }]);
    expect(refunds).toEqual({ b: 400 });
  });

  it("keeps folded chips in the pot without letting the folder win", () => {
    const { pots } = buildPots([
      { id: "a", amount: 60, folded: true },
      { id: "b", amount: 200, folded: false },
      { id: "c", amount: 200, folded: false },
    ]);
    expect(pots).toEqual([{ amount: 460, eligibleIds: ["b", "c"] }]);
  });

  it("never loses or creates chips", () => {
    const contributions = [
      { id: "a", amount: 37, folded: false },
      { id: "b", amount: 250, folded: true },
      { id: "c", amount: 911, folded: false },
      { id: "d", amount: 250, folded: false },
      { id: "e", amount: 5, folded: true },
    ];
    const { pots, refunds } = buildPots(contributions);
    const total = contributions.reduce((n, c) => n + c.amount, 0);
    const out = pots.reduce((n, p) => n + p.amount, 0) + Object.values(refunds).reduce((n, r) => n + r, 0);
    expect(out).toBe(total);
  });
});

describe("split pots", () => {
  it("splits evenly", () => {
    expect(splitPot(300, ["a", "b"])).toEqual({ a: 150, b: 150 });
  });

  it("gives odd chips to the first winners left of the button", () => {
    expect(splitPot(301, ["b", "a"])).toEqual({ b: 151, a: 150 });
    expect(splitPot(100, ["c", "a", "b"])).toEqual({ c: 34, a: 33, b: 33 });
  });
});
