import { describe, expect, it } from "vitest";
import { burnSlot, handSlot, planDeal, tableSlot } from "@/lib/deal-plan";

describe("deal plan", () => {
  it("deals one card at a time around the table from the first bidder, then burns and the table", () => {
    const players = [
      { id: "a", status: "active", cardCount: 2 },
      { id: "b", status: "active", cardCount: 1 },
      { id: "c", status: "eliminated", cardCount: 6 },
      { id: "d", status: "active", cardCount: 2 },
    ];
    const { order, count } = planDeal(players, "b");
    const sequence = [...order.entries()].sort((x, y) => x[1] - y[1]).map(([k]) => k);
    expect(sequence).toEqual([
      handSlot("b", 0), handSlot("d", 0), handSlot("a", 0),
      handSlot("d", 1), handSlot("a", 1),
      burnSlot(0), tableSlot(0), tableSlot(1), tableSlot(2),
      burnSlot(1), tableSlot(3),
      burnSlot(2), tableSlot(4),
    ]);
    expect(count).toBe(13);
  });
});
