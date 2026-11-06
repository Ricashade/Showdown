import { describe, expect, it } from "vitest";
import type { BouillotteAction, BouillotteSettings, BouillotteState } from "@/types/bouillotte";
import { applyBouillotteAction, brelanOf, createBouillotteRoom, deckFor, getBouillotteLegal, getBouillotteView, pointWinner, suitsByPoints, suitTotals } from "@/lib/bouillotte-engine";
import { bouillotteBots } from "@/lib/bot-ai";
import { cards } from "@/components/rules/sample-cards";
import { seededRandom } from "@/lib/cards";

function must(r: { ok: boolean; state: BouillotteState; error?: string }): BouillotteState {
  if (!r.ok) throw new Error(r.error);
  return r.state;
}
const act = (s: BouillotteState, a: BouillotteAction) => must(applyBouillotteAction(s, a));

function table(ids = ["a", "b", "c", "d"], settings: Partial<BouillotteSettings> = { allowCarre: false }) {
  let s = createBouillotteRoom({ roomId: "t", host: { id: ids[0], name: ids[0] }, settings });
  for (const id of ids.slice(1)) s = act(s, { type: "JOIN_ROOM", player: { id, name: id } });
  return act(s, { type: "START_GAME", playerId: ids[0], seed: 5 });
}

/** These hands (in seat order) and Retourné, betting fresh with `turn` to act. */
function rig(s: BouillotteState, hands: string[], retourne: string, turn: string): BouillotteState {
  const n = structuredClone(s);
  n.players.forEach((p, i) => (p.hand = cards(hands[i] ?? "")));
  n.retourne = cards(retourne)[0];
  n.currentTurnId = turn;
  return n;
}

describe("the deck", () => {
  it("strips the deck to the table: 16, 20 or 24 cards", () => {
    expect(deckFor(3)).toHaveLength(16);
    expect(deckFor(4)).toHaveLength(20);
    expect(deckFor(5)).toHaveLength(24);
    expect(new Set(deckFor(4).map((c) => c.rank))).toEqual(new Set([14, 13, 12, 9, 8]));
  });

  it("antes, deals three each, turns up the Retourné and keeps the stub", () => {
    const s = table();
    expect(s.players.map((p) => p.hand.length)).toEqual([3, 3, 3, 3]);
    expect(s.players.map((p) => p.chips)).toEqual([99, 99, 99, 99]);
    expect(s.retourne).not.toBeNull();
    expect(s.stub).toHaveLength(7);
    // a deals; b, on the dealer's left, opens the betting.
    expect(s.dealerId).toBe("a");
    expect(s.currentTurnId).toBe("b");
  });

  it("hides other hands and the stub", () => {
    const v = getBouillotteView(table(), "b");
    expect(v.players.find((p) => p.id === "b")!.hand).toHaveLength(3);
    expect(v.players.filter((p) => p.id !== "b").every((p) => p.hand === null)).toBe(true);
    expect("stub" in v).toBe(false);
    expect(v.stubCount).toBe(7);
  });
});

describe("the carré", () => {
  it("lets the dealer's right post blind, then act last", () => {
    let s = table(["a", "b", "c", "d"], { allowCarre: true });
    expect(s).toMatchObject({ phase: "carre", carreSeatId: "d" });
    expect(s.players.every((p) => p.hand.length === 0)).toBe(true);
    s = act(s, { type: "CARRE", playerId: "d", post: true });
    expect(s.players.find((p) => p.id === "d")!.bet).toBe(4);
    expect(s.currentBet).toBe(4);
    // The first to act is the dealer, so the carré comes round last.
    expect(s.currentTurnId).toBe("a");
    for (const id of ["a", "b", "c"]) s = act(s, { type: "CALL", playerId: id });
    expect(s.currentTurnId).toBe("d");
    expect(getBouillotteLegal(getBouillotteView(s, "d"), "d").canCheck).toBe(true);
  });
});

describe("brélans", () => {
  const R = (id: string) => cards(id)[0];
  it("knows a brélan carré, a natural brélan and a favori", () => {
    expect(brelanOf(cards("KS KH KD"), R("KC"), true)).toEqual({ kind: "carre", rank: 13 });
    expect(brelanOf(cards("9S 9H 9D"), R("AC"), true)).toEqual({ kind: "natural", rank: 9 });
    expect(brelanOf(cards("AS AH 8D"), R("AC"), true)).toEqual({ kind: "favori", rank: 14 });
    expect(brelanOf(cards("AS AH 8D"), R("AC"), false)).toBeNull();
  });

  it("a brélan beats Le Point, and everyone dealt in pays the bonus", () => {
    let s = rig(table(), ["AH KH QH", "9S 9H 9D", "AS KS QS", "AD KD QD"], "8C", "b");
    for (const id of ["b", "c", "d"]) s = act(s, { type: "CHECK", playerId: id });
    s = act(s, { type: "FOLD", playerId: "a" });
    // b, c and d checked; a folded. b's three 9s take the 4-chip pot and a chip from a, c and d.
    expect(s.result!.pots[0]).toMatchObject({ winnerId: "b", by: "brelan", amount: 4 });
    expect(s.result!.bonus).toEqual({ to: "b", each: 1, total: 3 });
    expect(s.players.map((p) => p.chips)).toEqual([98, 106, 98, 98]);
    // Only the hands still in are shown.
    expect(Object.keys(s.result!.revealed).sort()).toEqual(["b", "c", "d"]);
  });
});

describe("Le Point", () => {
  it("adds every suit across all hands, folded ones too", () => {
    const all = cards("AH 9H KS  AS 9S 8C  KH 8H QD  AD KD 9C  QH");
    const totals = suitTotals(all);
    expect(totals).toEqual({ H: 48, S: 30, D: 31, C: 17 });
    expect(suitsByPoints(totals, all)[0]).toBe("H");
  });

  it("goes to the next suit if nobody still in holds the top one", () => {
    const hands = { a: cards("KS 9S 8C"), b: cards("AD 8D 9C") };
    expect(pointWinner(hands, ["a", "b"], ["H", "S", "D", "C"])).toMatchObject({ winnerId: "a", suit: "S", cardId: "KS" });
  });

  it("turns every hand up and pays the highest card of the winning suit", () => {
    let s = rig(table(), ["AD KD 9C", "AH 9H KS", "AS 9S 8C", "KH 8H QD"], "QH", "b");
    s = act(s, { type: "RAISE", playerId: "b", to: 6 });
    s = act(s, { type: "CALL", playerId: "c" });
    s = act(s, { type: "FOLD", playerId: "d" });
    s = act(s, { type: "FOLD", playerId: "a" });
    expect(s.result!.totals!.H).toBe(48);
    expect(s.result!.pots[0]).toMatchObject({ winnerId: "b", by: "point", suit: "H", cardId: "AH", amount: 16 });
    expect(Object.keys(s.result!.revealed)).toHaveLength(4);
  });

  it("everyone folding to one bet wins without a showdown", () => {
    let s = table();
    s = act(s, { type: "RAISE", playerId: "b", to: 3 });
    for (const id of ["c", "d", "a"]) s = act(s, { type: "FOLD", playerId: id });
    expect(s.result!.pots[0]).toMatchObject({ winnerId: "b", by: "fold" });
    expect(s.result!.revealed).toEqual({});
  });
});

describe("betting", () => {
  it("won't let you bet more than you have; va-tout makes side pots", () => {
    let s = rig(table(["a", "b", "c"]), ["AH KH 9H", "AS 8S 8C", "KS 9S 9D"], "KD", "b");
    s.players[1].chips = 5;
    expect(applyBouillotteAction(s, { type: "RAISE", playerId: "b", to: 9 }).ok).toBe(false);
    s = act(s, { type: "ALL_IN", playerId: "b" });
    s = act(s, { type: "RAISE", playerId: "c", to: 20 });
    s = act(s, { type: "CALL", playerId: "a" });
    // Main pot: antes + 5 from each (18); side pot: 15 more each from a and c (30).
    expect(s.result!.pots.map((p) => p.amount)).toEqual([18, 30]);
  });

  it("a short all-in doesn't reopen the raising", () => {
    let s = rig(table(["a", "b", "c"]), ["AH KH 9H", "AS 8S 8C", "KS 9S 9D"], "KD", "b");
    s = act(s, { type: "RAISE", playerId: "b", to: 10 });
    s.players[2].chips = 13;
    s = act(s, { type: "ALL_IN", playerId: "c" });
    s = act(s, { type: "CALL", playerId: "a" });
    // b already acted, and c's raise was short: b may only call or fold.
    expect(getBouillotteLegal(getBouillotteView(s, "b"), "b").canRaise).toBe(false);
  });

  it("whoever runs out of chips is out; the last one with chips wins", () => {
    let s = rig(table(["a", "b", "c"]), ["AH KH 9H", "AS 9C 8C", "KS 9S 9D"], "8H", "b");
    s.players[1].chips = 3;
    s.players[2].chips = 3;
    s = act(s, { type: "ALL_IN", playerId: "b" });
    s = act(s, { type: "ALL_IN", playerId: "c" });
    s = act(s, { type: "CALL", playerId: "a" });
    expect(s).toMatchObject({ phase: "game_over", winnerId: "a" });
  });
});

describe("bots", () => {
  for (const difficulty of ["easy", "medium", "hard"] as const) {
    it(`${difficulty} bots play a game to the end`, () => {
      let s = createBouillotteRoom({ roomId: "t", host: { id: "a", name: "a", isBot: true, botDifficulty: difficulty }, settings: { startingChips: 50 } });
      for (const id of ["b", "c", "d"]) s = act(s, { type: "JOIN_ROOM", player: { id, name: id, isBot: true, botDifficulty: difficulty } });
      s = act(s, { type: "START_GAME", playerId: "a", seed: 2 });
      const rng = seededRandom(9);
      for (let i = 0; i < 4000 && s.phase !== "game_over"; i++) {
        if (s.phase === "hand_over") {
          s = act(s, { type: "NEXT_HAND", playerId: "a" });
          continue;
        }
        const turn = bouillotteBots.pending(s)!;
        s = act(s, bouillotteBots.decide(s, turn.botId, rng)!);
      }
      expect(s.phase).toBe("game_over");
      expect(s.players.reduce((n, p) => n + p.chips, 0)).toBe(200);
    });
  }

  it("decides the same whatever the others hold", () => {
    const s = table();
    s.players = s.players.map((p) => ({ ...p, isBot: true, botDifficulty: "hard" as const }));
    const swapped = structuredClone(s);
    [swapped.players[2].hand, swapped.players[3].hand] = [swapped.players[3].hand, swapped.players[2].hand];
    expect(bouillotteBots.decide(swapped, "b", seededRandom(4))).toEqual(bouillotteBots.decide(s, "b", seededRandom(4)));
  });
});
