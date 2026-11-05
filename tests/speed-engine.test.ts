import { describe, expect, it } from "vitest";
import type { SpeedAction, SpeedSettings, SpeedState } from "@/types/speed";
import { applySpeedAction, cardsLeft, COUNTDOWN_MS, createSpeedRoom, fits, getSpeedView, nextDuel, speedClock, STALL_MS } from "@/lib/speed-engine";
import { getSpeedBotAction, observeSpeed, speedBots, speedDueAt } from "@/lib/bot-ai";
import { cards } from "@/components/rules/sample-cards";
import { seededRandom } from "@/lib/cards";

function must(r: { ok: boolean; state: SpeedState; error?: string }): SpeedState {
  if (!r.ok) throw new Error(r.error);
  return r.state;
}
const act = (s: SpeedState, a: SpeedAction, now = 10_000) => must(applySpeedAction(s, a, now));
const card = (id: string) => cards(id)[0];

function table(ids = ["a", "b"], settings?: Partial<SpeedSettings>) {
  let s = createSpeedRoom({ roomId: "t", host: { id: ids[0], name: ids[0] }, settings });
  for (const id of ids.slice(1)) s = act(s, { type: "JOIN_ROOM", player: { id, name: id } });
  return act(s, { type: "START_GAME", playerId: ids[0], seed: 4 }, 0);
}

/** Live, with these hands ("7S 8D", padded with empty slots), stocks, piles and spares. */
function rig(s: SpeedState, o: { a: string; b: string; stockA?: string; stockB?: string; piles: [string, string]; spares?: [string, string] }): SpeedState {
  const n = structuredClone(s);
  const slots = (spec: string) => {
    const list = spec ? cards(spec) : [];
    return Array.from({ length: 5 }, (_, i) => list[i] ?? null);
  };
  n.sides![0].hand = slots(o.a);
  n.sides![1].hand = slots(o.b);
  n.sides![0].stock = o.stockA ? cards(o.stockA) : [];
  n.sides![1].stock = o.stockB ? cards(o.stockB) : [];
  n.piles = [cards(o.piles[0]), cards(o.piles[1])];
  n.spares = o.spares ? [o.spares[0] ? cards(o.spares[0]) : [], o.spares[1] ? cards(o.spares[1]) : []] : [[], []];
  n.phase = "live";
  n.clockAt = null;
  return n;
}
const slam = (s: SpeedState, by: string, ids: string, pile: 0 | 1, now = 10_000) =>
  applySpeedAction(s, { type: "PLAY", playerId: by, cardIds: ids.split(" "), pile, expectedTopId: s.piles[pile].at(-1)!.id }, now);

describe("deal", () => {
  it("deals 20 each (5 in hand), five spares a side and one card to each pile", () => {
    const s = table();
    expect(s.sides!.map((x) => [x.hand.length, x.stock.length])).toEqual([
      [5, 15],
      [5, 15],
    ]);
    expect(s.spares.map((x) => x.length)).toEqual([5, 5]);
    expect(s.piles.map((x) => x.length)).toEqual([1, 1]);
    expect(s.phase).toBe("countdown");
  });

  it("keeps the piles face down until the countdown ends, and hands private", () => {
    const s = table();
    const v = getSpeedView(s, "a");
    expect(v.piles).toEqual([[], []]);
    expect(v.sides![1].hand).toBeNull();
    expect(v.sides![1].filled).toEqual([true, true, true, true, true]);
    expect(applySpeedAction(s, { type: "GO", playerId: "a" }, 1000).ok).toBe(false);
    const live = act(s, { type: "GO", playerId: "a" }, COUNTDOWN_MS);
    expect(["live", "stalled"]).toContain(live.phase);
    expect(getSpeedView(live, "a").piles[0]).toHaveLength(1);
    expect(speedClock(s)).toMatchObject({ at: COUNTDOWN_MS, action: { type: "GO" } });
  });
});

describe("what fits", () => {
  it("goes one up or down, wrapping King, Ace and 2", () => {
    expect(fits(card("8D"), card("7S"), false)).toBe(true);
    expect(fits(card("6D"), card("7S"), false)).toBe(true);
    expect(fits(card("9D"), card("7S"), false)).toBe(false);
    expect(fits(card("AH"), card("KS"), false)).toBe(true);
    expect(fits(card("2H"), card("AS"), false)).toBe(true);
    expect(fits(card("KH"), card("2S"), false)).toBe(false);
  });

  it("takes the same rank only when the house allows", () => {
    expect(fits(card("8D"), card("8S"), true)).toBe(true);
    expect(fits(card("8D"), card("8S"), false)).toBe(false);
  });
});

describe("playing", () => {
  it("lands a card and refills the hand from the stock", () => {
    const s = rig(table(), { a: "8D 3C", b: "QS", stockA: "5H", piles: ["7S", "KH"] });
    const n = must(slam(s, "a", "8D", 0));
    expect(n.piles[0].at(-1)!.id).toBe("8D");
    expect(n.sides![0].hand.filter(Boolean).map((c) => c!.id).sort()).toEqual(["3C", "5H"]);
  });

  it("first to land wins: a stale move that no longer fits is too slow", () => {
    const s = rig(table(), { a: "8D", b: "6C QD", stockA: "4H", stockB: "4D", piles: ["7S", "KH"] });
    const top = s.piles[0].at(-1)!.id;
    const n = must(slam(s, "a", "8D", 0));
    const late = applySpeedAction(n, { type: "PLAY", playerId: "b", cardIds: ["6C"], pile: 0, expectedTopId: top }, 10_030);
    expect(late).toMatchObject({ ok: false, error: "Too slow!" });
  });

  it("a stale move that still fits the new top lands", () => {
    const s = rig(table(), { a: "8D", b: "9C 2D", stockA: "4H", stockB: "4D", piles: ["7S", "KH"] });
    const top = s.piles[0].at(-1)!.id;
    const n = must(slam(s, "a", "8D", 0));
    expect(applySpeedAction(n, { type: "PLAY", playerId: "b", cardIds: ["9C"], pile: 0, expectedTopId: top }, 10_030).ok).toBe(true);
  });

  it("slams a set of one rank together (unless the house says no)", () => {
    const s = rig(table(), { a: "8D 8C 3H", b: "QS", stockA: "5H", piles: ["7S", "KH"] });
    expect(must(slam(s, "a", "8D 8C", 0)).piles[0].map((c) => c.id)).toEqual(["7S", "8D", "8C"]);
    const strict = rig(table(["a", "b"], { allowDoubles: false }), { a: "8D 8C 3H", b: "QS", stockA: "5H", piles: ["7S", "KH"] });
    expect(slam(strict, "a", "8D 8C", 0).ok).toBe(false);
  });

  it("draws by hand when the hand doesn't refill itself", () => {
    const s = rig(table(["a", "b"], { autoDraw: false }), { a: "8D", b: "QS", stockA: "5H 6H", piles: ["7S", "KH"] });
    const n = must(slam(s, "a", "8D", 0));
    expect(n.sides![0].hand.filter(Boolean)).toHaveLength(0);
    expect(act(n, { type: "DRAW", playerId: "a" }).sides![0].hand.filter(Boolean)).toHaveLength(2);
  });
});

describe("stalls", () => {
  it("turns a spare onto each pile when nobody can go", () => {
    // Both ask for new cards.
    const stuck = rig(table(), { a: "3C", b: "5S", piles: ["8S", "JH"], spares: ["9C", "4D"], stockA: "6C", stockB: "6D" });
    const stalled = act(stuck, { type: "VOTE_FLIP", playerId: "a" });
    expect(stalled.phase).toBe("live");
    const both = act(stalled, { type: "VOTE_FLIP", playerId: "b" }, 20_000);
    expect(both).toMatchObject({ phase: "stalled", clockAt: 20_000 + STALL_MS });
    const flipped = act(both, { type: "FLIP", playerId: "a" }, 20_000 + STALL_MS);
    expect(flipped.piles.map((p) => p.at(-1)!.id)).toEqual(["9C", "4D"]);
  });

  it("notices on its own when nobody can go", () => {
    const s = rig(table(), { a: "8D 3C", b: "5S", stockA: "", piles: ["7S", "JH"], spares: ["2C", "2D"] });
    const n = must(slam(s, "a", "8D", 0, 30_000));
    // a: 3 vs 8/J, b: 5 vs 8/J: stuck.
    expect(n).toMatchObject({ phase: "stalled", clockAt: 30_000 + STALL_MS });
    expect(speedClock(n)).toMatchObject({ action: { type: "FLIP" } });
  });

  it("rebuilds the spares from under the piles when they run out", () => {
    const s = rig(table(), { a: "3C", b: "5S", stockA: "6C", stockB: "6D", piles: ["2S 9S", "4H JH"], spares: ["", ""] });
    let n = act(s, { type: "VOTE_FLIP", playerId: "a" });
    n = act(n, { type: "VOTE_FLIP", playerId: "b" }, 1000);
    n = act(n, { type: "FLIP", playerId: "a" }, 1000 + STALL_MS);
    expect(n.log.at(-1)).toMatchObject({ kind: "flip", reshuffled: true });
    expect(n.piles.map((p) => p.length)).toEqual([2, 2]);
    expect(n.spares[0].length + n.spares[1].length).toBe(0);
  });

  it("with nothing left to turn, fewest cards wins", () => {
    const s = rig(table(), { a: "3C", b: "5S 5D", piles: ["9S", "JH"] });
    let n = act(s, { type: "VOTE_FLIP", playerId: "a" });
    n = act(n, { type: "VOTE_FLIP", playerId: "b" }, 1000);
    n = act(n, { type: "FLIP", playerId: "a" }, 1000 + STALL_MS);
    expect(n).toMatchObject({ phase: "game_over", winnerIds: ["a"] });
  });
});

describe("winning", () => {
  it("the last card wins", () => {
    const s = rig(table(), { a: "8D", b: "QS", piles: ["7S", "KH"] });
    expect(must(slam(s, "a", "8D", 0))).toMatchObject({ phase: "game_over", winnerIds: ["a"] });
  });

  it("in arcade mode, slap first to win; get caught and take a pile back", () => {
    const base = () => rig(table(["a", "b"], { winBy: "slap" }), { a: "8D", b: "QS 3C", stockB: "4C", piles: ["5C 6H 7S", "2D KH"] });
    const out = must(slam(base(), "a", "8D", 0));
    expect(out).toMatchObject({ phase: "slap", emptyId: "a" });
    expect(act(out, { type: "SLAP", playerId: "a" })).toMatchObject({ phase: "game_over", winnerIds: ["a"] });
    const caught = act(out, { type: "SLAP", playerId: "b" });
    // The smaller pile (one card under the King) goes back to a.
    expect(caught.phase).toBe("live");
    expect(cardsLeft(caught.sides![0])).toBe(1);
    expect(caught.piles[1].map((c) => c.id)).toEqual(["KH"]);
  });

  it("winner stays on", () => {
    let s = table(["a", "b", "c"], { winnerStaysOn: true });
    s = rig(s, { a: "8D", b: "QS", piles: ["7S", "KH"] });
    s = must(slam(s, "a", "8D", 0));
    expect(nextDuel(s)).toEqual(["a", "c"]);
  });
});

describe("bots", () => {
  it("react slower the easier they are, and faster again on a run", () => {
    const at = (difficulty: "easy" | "medium" | "hard", chaining = false) => speedDueAt({ botId: "x", difficulty, lastPlayAt: 0, boardAt: 0, chaining, slapping: false });
    expect(at("easy")).toBeGreaterThanOrEqual(1800);
    expect(at("medium")).toBeLessThan(1500);
    expect(at("hard")).toBeLessThan(900);
    expect(at("hard", true)).toBe(450);
  });

  it("never peeks at the other hand", () => {
    const s = rig(table(), { a: "8D 3C", b: "QS 6C", piles: ["7S", "KH"] });
    const swapped = structuredClone(s);
    swapped.sides![1].hand = cards("2C 9C").concat([null, null, null] as never);
    const obs = (st: SpeedState) => getSpeedBotAction(observeSpeed(getSpeedView(st, "a"), "a")!, "hard", seededRandom(1));
    expect(obs(swapped)).toEqual(obs(s));
  });

  for (const difficulty of ["easy", "medium", "hard"] as const) {
    it(`${difficulty} bots finish a game against each other`, () => {
      let s = createSpeedRoom({ roomId: "t", host: { id: "a", name: "a", isBot: true, botDifficulty: difficulty } });
      s = act(s, { type: "JOIN_ROOM", player: { id: "b", name: "b", isBot: true, botDifficulty: difficulty } });
      s = act(s, { type: "START_GAME", playerId: "a", seed: 21 }, 0);
      let now = 0;
      const rng = seededRandom(3);
      for (let i = 0; i < 2000 && s.phase !== "game_over"; i++) {
        const timed = speedClock(s);
        if (timed) {
          now = Math.max(now, timed.at);
          s = act(s, timed.action, now);
          continue;
        }
        const turn = speedBots.pending(s);
        if (!turn) throw new Error(`stuck in ${s.phase}`);
        now += 500;
        s = act(s, speedBots.decide(s, turn.botId, rng)!, now);
      }
      expect(s.phase).toBe("game_over");
    });
  }
});
