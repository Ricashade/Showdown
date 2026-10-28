import { describe, expect, it } from "vitest";
import type { Card } from "@/types/cards";
import type { RummyAction, RummySettings, RummyState } from "@/types/rummy";
import { applyRummyAction, createRummyRoom, getRummyLegal, getRummyView } from "@/lib/rummy-engine";
import { findMelds, isPlayable, layOffShape, validateMeld } from "@/lib/rummy-melds";
import { rummyBots } from "@/lib/bot-ai";
import { cards } from "@/components/rules/sample-cards";
import { seededRandom } from "@/lib/cards";

function must(r: { ok: boolean; state: RummyState; error?: string }): RummyState {
  if (!r.ok) throw new Error(r.error);
  return r.state;
}
const act = (s: RummyState, a: RummyAction) => must(applyRummyAction(s, a));
const play = (s: RummyState, ...actions: RummyAction[]) => actions.reduce(act, s);

const JOKER: Card = { id: "JK1", kind: "joker" };
const ids = (spec: string) => cards(spec).map((c) => c.id);

function game(ids: string[], settings?: Partial<RummySettings>, bots: string[] = []) {
  let s = createRummyRoom({ roomId: "t", host: { id: ids[0], name: ids[0] }, settings });
  for (const id of ids.slice(1)) s = act(s, { type: "JOIN_ROOM", player: { id, name: id } });
  for (const id of bots) s = act(s, { type: "JOIN_ROOM", player: { id, name: id, isBot: true, botDifficulty: "hard" } });
  return act(s, { type: "START_GAME", playerId: ids[0], seed: 5 });
}

/** Set up a position: hands, the piles and table melds, whose turn and which step. */
function rig(
  s: RummyState,
  o: { turn: string; step?: "draw" | "play"; hands?: Record<string, string>; stock?: string; discard?: string; melds?: { kind: "set" | "run"; cards: string; by: string }[] },
): RummyState {
  const n = structuredClone(s);
  n.currentTurnId = o.turn;
  n.step = o.step ?? "draw";
  n.mustPlayId = null;
  for (const [id, spec] of Object.entries(o.hands ?? {})) n.players.find((p) => p.id === id)!.hand = cards(spec);
  if (o.stock !== undefined) n.stock = cards(o.stock);
  if (o.discard !== undefined) n.discard = cards(o.discard);
  if (o.melds) {
    n.melds = o.melds.map((m, i) => {
      const c = cards(m.cards);
      return { id: `t${i}`, kind: m.kind, cards: c, placedBy: Object.fromEntries(c.map((x) => [x.id, m.by])) };
    });
  }
  return n;
}

describe("melds", () => {
  it("knows sets from runs", () => {
    expect(validateMeld(cards("7S 7H 7D"), "both")?.kind).toBe("set");
    expect(validateMeld(cards("7S 7H 7D 7C"), "both")?.kind).toBe("set");
    expect(validateMeld(cards("7S 7S 7D"), "both")).toBeNull(); // Same suit twice.
    expect(validateMeld(cards("4C 6C 5C 7C"), "both")?.ordered.map((c) => c.id)).toEqual(["4C", "5C", "6C", "7C"]);
    expect(validateMeld(cards("4C 5C 6D"), "both")).toBeNull(); // Mixed suits.
    expect(validateMeld(cards("4C 6C"), "both")).toBeNull(); // Too short.
  });

  it("plays Aces low, high, or round the corner as set", () => {
    expect(validateMeld(cards("AS 2S 3S"), "low")).not.toBeNull();
    expect(validateMeld(cards("QS KS AS"), "low")).toBeNull();
    expect(validateMeld(cards("QS KS AS"), "both")).not.toBeNull();
    expect(validateMeld(cards("KS AS 2S"), "both")).toBeNull();
    expect(validateMeld(cards("KS AS 2S"), "wrap")?.ordered.map((c) => c.id)).toEqual(["KS", "AS", "2S"]);
  });

  it("lets Jokers fill gaps", () => {
    expect(validateMeld([...cards("4C 6C"), JOKER], "both")?.ordered.map((c) => c.id)).toEqual(["4C", "JK1", "6C"]);
    expect(validateMeld([...cards("9H 9S"), JOKER], "both")?.kind).toBe("set");
  });

  it("lays off onto either end of a run, or the fourth card of a set", () => {
    const run = { kind: "run" as const, cards: cards("4C 5C 6C 7C") };
    expect(layOffShape(run, cards("8C"), "both")?.ordered.at(-1)?.id).toBe("8C");
    expect(layOffShape(run, cards("3C"), "both")?.ordered[0].id).toBe("3C");
    expect(layOffShape(run, cards("9C"), "both")).toBeNull();
    expect(layOffShape({ kind: "set", cards: cards("KS KD KC") }, cards("KH"), "both")).not.toBeNull();
  });

  it("finds the melds in a hand without sharing cards", () => {
    // The 7 of spades fits the set or the run, not both: only three cards can go down.
    expect(findMelds(cards("7S 8S 9S 7H 7D KC 2H"), "both").flat()).toHaveLength(3);
    // With a fourth 7, the set gives up the 7 of spades so the run can be made as well.
    const melds = findMelds(cards("7S 8S 9S 7H 7D 7C KC"), "both");
    expect(melds.flat()).toHaveLength(6);
    expect(new Set(melds.flat().map((c) => c.id)).size).toBe(6);
    expect(findMelds(cards("QH KH AH 5C"), "low")).toEqual([]);
    expect(findMelds(cards("QH KH AH 5C"), "both").flat().map((c) => c.id).sort()).toEqual(["AH", "KH", "QH"]);
  });
});

describe("dealing", () => {
  it("deals 10 each to two players (13 if set), 7 to more; two decks for five or six", () => {
    expect(game(["a", "b"]).players.map((p) => p.hand.length)).toEqual([10, 10]);
    expect(game(["a", "b"], { twoPlayerHand: 13 }).players[0].hand).toHaveLength(13);
    const three = game(["a", "b", "c"]);
    expect(three.players.every((p) => p.hand.length === 7)).toBe(true);
    expect(three.stock.length).toBe(52 - 21 - 1);
    expect(game(["a", "b", "c", "d", "e"]).stock.length).toBe(104 - 35 - 1);
    expect(game(["a", "b", "c"], { jokers: true }).stock.length).toBe(54 - 21 - 1);
  });
});

describe("a turn", () => {
  it("draw, meld a run, lay off on a set, discard, and the turn passes", () => {
    let s = rig(game(["a", "b"]), {
      turn: "a",
      hands: { a: "7S 8S KH 4D 2C" },
      discard: "3H 9S",
      melds: [{ kind: "set", cards: "KS KD KC", by: "b" }],
    });
    expect(applyRummyAction(s, { type: "DRAW_DISCARD", playerId: "a", index: 0 }).ok).toBe(false); // Classic: top only.
    s = act(s, { type: "DRAW_DISCARD", playerId: "a", index: 1 });
    s = act(s, { type: "MELD", playerId: "a", cardIds: ids("7S 8S 9S") });
    expect(s.melds.at(-1)).toMatchObject({ kind: "run" });
    s = act(s, { type: "LAY_OFF", playerId: "a", cardIds: ["KH"], meldId: "t0" });
    expect(s.melds[0].cards).toHaveLength(4);
    expect(s.melds[0].placedBy.KH).toBe("a");
    s = act(s, { type: "DISCARD", playerId: "a", cardId: "2C" });
    expect(s.currentTurnId).toBe("b");
    expect(s.step).toBe("draw");
    expect(s.players[0].hand.map((c) => c.id)).toEqual(["4D"]);
  });

  it("rejects melds that aren't sets or runs, and moves out of turn", () => {
    const s = rig(game(["a", "b"]), { turn: "a", step: "play", hands: { a: "7S 8H 9S 2C" } });
    expect(applyRummyAction(s, { type: "MELD", playerId: "a", cardIds: ids("7S 8H 9S") }).ok).toBe(false);
    expect(applyRummyAction(s, { type: "DISCARD", playerId: "b", cardId: "2C" }).ok).toBe(false);
  });
});

describe("going out and scoring", () => {
  it("Classic: going out scores everyone else's cards", () => {
    let s = rig(game(["a", "b", "c"]), { turn: "a", hands: { a: "7S 8S 2C", b: "KH 5D", c: "AC" }, stock: "9S", melds: [{ kind: "set", cards: "QS QD QC", by: "a" }] });
    s.players[0].meldedBefore = true;
    s = play(s, { type: "DRAW_STOCK", playerId: "a" }, { type: "MELD", playerId: "a", cardIds: ids("7S 8S 9S") }, { type: "DISCARD", playerId: "a", cardId: "2C" });
    expect(s.phase).toBe("round_over");
    expect(s.result).toMatchObject({ winnerId: "a", rummy: false, points: { a: 15 + 1, b: 0, c: 0 } });
  });

  it("Rummy: melding the whole hand in one turn doubles it", () => {
    let s = rig(game(["a", "b"]), { turn: "a", hands: { a: "7S 8S 4D 4H 4C", b: "KH 5D" }, stock: "9S" });
    s = play(
      s,
      { type: "DRAW_STOCK", playerId: "a" },
      { type: "MELD", playerId: "a", cardIds: ids("7S 8S 9S") },
      { type: "MELD", playerId: "a", cardIds: ids("4D 4H 4C") },
    );
    expect(s.result).toMatchObject({ winnerId: "a", rummy: true, points: { a: 30 } });
  });

  it("Rummy 500: melded points minus what's left in hand", () => {
    let s = rig(game(["a", "b"], { variant: "rummy500" }), {
      turn: "a",
      hands: { a: "7S 8S", b: "KH AD" },
      stock: "9S",
      melds: [{ kind: "set", cards: "QS QD QC", by: "b" }],
    });
    s = play(s, { type: "DRAW_STOCK", playerId: "a" }, { type: "MELD", playerId: "a", cardIds: ids("7S 8S 9S") });
    // a: three fives melded = 15, doubled for rummy = 30. b: 30 on the table − (10 + 15) in hand = 5.
    expect(s.result?.points).toEqual({ a: 30, b: 5 });
  });

  it("ends the match at the target, or after one hand", () => {
    let s = rig(game(["a", "b"], { targetScore: null }), { turn: "a", hands: { a: "7S 8S 2C", b: "KH" }, stock: "9S" });
    s = play(s, { type: "DRAW_STOCK", playerId: "a" }, { type: "MELD", playerId: "a", cardIds: ids("7S 8S 9S") }, { type: "DISCARD", playerId: "a", cardId: "2C" });
    expect(s.phase).toBe("game_over");
    expect(s.winnerId).toBe("a");
  });
});

describe("Rummy 500 deep discard", () => {
  const base = () =>
    rig(game(["a", "b"], { variant: "rummy500" }), { turn: "a", hands: { a: "7S 8S 2C 3D" }, discard: "4H 9S JD KC" });

  it("takes a buried card and everything on top, if that card can be played", () => {
    const s = base();
    expect(getRummyLegal(getRummyView(s, "a"), "a").takeable).toEqual([1, 3]);
    expect(applyRummyAction(s, { type: "DRAW_DISCARD", playerId: "a", index: 0 }).ok).toBe(false);
    const n = act(s, { type: "DRAW_DISCARD", playerId: "a", index: 1 });
    expect(n.players[0].hand.map((c) => c.id)).toEqual(ids("7S 8S 2C 3D 9S JD KC"));
    expect(n.discard.map((c) => c.id)).toEqual(["4H"]);
    expect(n.mustPlayId).toBe("9S");
  });

  it("won't let you discard before playing the card you dug for", () => {
    let s = act(base(), { type: "DRAW_DISCARD", playerId: "a", index: 1 });
    expect(applyRummyAction(s, { type: "DISCARD", playerId: "a", cardId: "2C" }).ok).toBe(false);
    s = play(s, { type: "MELD", playerId: "a", cardIds: ids("7S 8S 9S") }, { type: "DISCARD", playerId: "a", cardId: "2C" });
    expect(s.currentTurnId).toBe("b");
  });
});

describe("what players see", () => {
  it("keeps other hands and the stock hidden until the round ends", () => {
    const s = rig(game(["a", "b"]), { turn: "a", hands: { a: "7S 8S", b: "KH 5D" }, stock: "9S" });
    const v = getRummyView(s, "a");
    expect(v.players[1].hand).toBeNull();
    expect(v.players[1].handCount).toBe(2);
    const json = JSON.stringify(v);
    for (const id of ["KH", "5D", "9S"]) expect(json).not.toContain(`"${id}"`);
  });
});

describe("rummy bots", () => {
  it("take a discard that completes a meld (Medium and Hard)", () => {
    const s = rig(game(["a"], {}, ["bot"]), { turn: "bot", hands: { bot: "7S 8S KH 4D" }, discard: "9S" });
    expect(rummyBots.decide(s, "bot")).toEqual({ type: "DRAW_DISCARD", playerId: "bot", index: 0 });
  });

  it("never see another hand: what a opponent holds doesn't change the move", () => {
    const s = rig(game(["a"], {}, ["bot"]), { turn: "bot", step: "play", hands: { bot: "7S 8S KH 4D 2C", a: "9S 9H" } });
    const other = rig(s, { turn: "bot", step: "play", hands: { a: "QD JC" } });
    expect(rummyBots.decide(s, "bot", () => 0.4)).toEqual(rummyBots.decide(other, "bot", () => 0.4));
  });

  for (const variant of ["classic", "rummy500"] as const) {
    it(`play whole ${variant} games against each other without a stuck move`, () => {
      for (let seed = 1; seed <= 12; seed++) {
        let s = createRummyRoom({ roomId: "t", host: { id: "e", name: "e", isBot: true, botDifficulty: "easy" }, settings: { variant, targetScore: null, jokers: seed % 2 === 0, aceRule: seed % 3 === 0 ? "wrap" : "both" } });
        s = act(s, { type: "JOIN_ROOM", player: { id: "m", name: "m", isBot: true, botDifficulty: "medium" } });
        s = act(s, { type: "JOIN_ROOM", player: { id: "h", name: "h", isBot: true, botDifficulty: "hard" } });
        s = act(s, { type: "START_GAME", playerId: "e", seed });
        const rng = seededRandom(seed);
        let steps = 0;
        while (s.phase === "playing" && steps++ < 2000) {
          const p = rummyBots.pending(s)!;
          s = act(s, rummyBots.decide(s, p.botId, rng)!);
        }
        expect(s.phase).toBe("game_over");
      }
    });
  }

  it("only dig for cards they can use", () => {
    const hand = cards("7S 8S 2C 3D");
    expect(isPlayable(cards("9S")[0], hand, [], "both")).toBe(true);
    expect(isPlayable(cards("4H")[0], hand, [], "both")).toBe(false);
  });
});
