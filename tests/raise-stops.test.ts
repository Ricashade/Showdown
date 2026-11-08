import { describe, expect, it } from "vitest";
import { raiseStops } from "@/lib/raise-stops";

const range = { currentBet: 20, potAfterCall: 60, allInWord: "All in" };

describe("raise stops", () => {
  it("runs from the minimum through pot steps to all in", () => {
    expect(raiseStops({ ...range, min: 40, max: 1000 })).toEqual([
      { label: "Min", to: 40 },
      { label: "½ pot", to: 50 },
      { label: "¾ pot", to: 65 },
      { label: "Pot", to: 80 },
      { label: "2× pot", to: 140 },
      { label: "All in", to: 1000 },
    ]);
  });

  it("drops steps at or past all in", () => {
    expect(raiseStops({ ...range, min: 40, max: 70 }).map((s) => s.label)).toEqual(["Min", "½ pot", "¾ pot", "All in"]);
  });

  it("is only all in when the minimum raise is everything", () => {
    expect(raiseStops({ ...range, min: 300, max: 300 })).toEqual([{ label: "All in", to: 300 }]);
  });
});
