import { describe, expect, it } from "vitest";
import type { ActiveGameState } from "@/types/party";
import { banterFor } from "@/lib/bot-banter";

const players = [
  { id: "ann", name: "Ann" },
  { id: "bot", name: "Dealer Dan", isBot: true },
];
// Only the fields banter reads; the rest of each game's state doesn't matter here.
const state = (s: object) => ({ players, ...s }) as unknown as ActiveGameState;

describe("bot banter", () => {
  it("speaks up when BS is called on a bot's bid, caught or not", () => {
    const before = state({ mode: "bs-poker", showdown: null });
    const caught = banterFor(before, state({ mode: "bs-poker", showdown: { round: 1, callerId: "ann", bidderId: "bot", loserId: "bot" } }));
    const held = banterFor(before, state({ mode: "bs-poker", showdown: { round: 1, callerId: "ann", bidderId: "bot", loserId: "ann" } }));
    expect(caught).toHaveLength(1);
    expect(caught[0].botId).toBe("bot");
    expect(held).toHaveLength(1);
    // Not about a person's bid, and not twice for the same showdown.
    expect(banterFor(before, state({ mode: "bs-poker", showdown: { round: 1, callerId: "bot", bidderId: "ann", loserId: "ann" } }))).toEqual([]);
    const after = state({ mode: "bs-poker", showdown: { round: 1, callerId: "ann", bidderId: "bot", loserId: "bot" } });
    expect(banterFor(after, after)).toEqual([]);
  });

  it("calls a War when one breaks out at a bot's battle", () => {
    const sides = [{ id: "ann" }, { id: "bot" }];
    expect(banterFor(state({ mode: "war", stage: "battle", sides }), state({ mode: "war", stage: "war", sides }))).toEqual([{ botId: "bot", text: expect.any(String) }]);
    expect(banterFor(state({ mode: "war", stage: "war", sides }), state({ mode: "war", stage: "war", sides }))).toEqual([]);
  });

  it("complains when someone takes a bot's cards in Go Fish, naming them", () => {
    const ask = (n: number, got: number, targetId = "bot") => ({ n, kind: "ask", askerId: "ann", targetId, rank: 7, got, fished: false, lucky: false, shown: null, again: got > 0 });
    const before = state({ mode: "go-fish", log: [ask(1, 0)] });
    const robbed = banterFor(before, state({ mode: "go-fish", log: [ask(1, 0), ask(2, 2)] }));
    expect(robbed).toHaveLength(1);
    expect(robbed[0].botId).toBe("bot");
    expect(banterFor(before, state({ mode: "go-fish", log: [ask(1, 0), ask(2, 0)] }))).toEqual([]);
    expect(banterFor(before, state({ mode: "go-fish", log: [ask(1, 0), ask(2, 2, "ann")] }))).toEqual([]);
  });

  it("stays quiet across a game switch", () => {
    expect(banterFor(state({ mode: "war", stage: "battle", sides: [] }), state({ mode: "go-fish", log: [] }))).toEqual([]);
  });
});
