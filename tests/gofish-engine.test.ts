import { describe, expect, it } from "vitest";
import type { GoFishAction, GoFishSettings, GoFishState } from "@/types/gofish";
import type { Rank } from "@/types/cards";
import { applyGoFishAction, createGoFishRoom, getGoFishLegal, getGoFishView, knownRanks } from "@/lib/gofish-engine";
import { chooseAsk, goFishBots, observeGoFish } from "@/lib/bot-ai";
import { cards } from "@/components/rules/sample-cards";
import { seededRandom } from "@/lib/cards";

function must(r: { ok: boolean; state: GoFishState; error?: string }): GoFishState {
  if (!r.ok) throw new Error(r.error);
  return r.state;
}
const act = (s: GoFishState, a: GoFishAction) => must(applyGoFishAction(s, a));
const ask = (s: GoFishState, playerId: string, targetId: string, rank: Rank) => act(s, { type: "ASK", playerId, targetId, rank });

function game(ids: string[], settings?: Partial<GoFishSettings>, bots: string[] = []) {
  let s = createGoFishRoom({ roomId: "t", host: { id: ids[0], name: ids[0] }, settings });
  for (const id of ids.slice(1)) s = act(s, { type: "JOIN_ROOM", player: { id, name: id } });
  for (const id of bots) s = act(s, { type: "JOIN_ROOM", player: { id, name: id, isBot: true, botDifficulty: "hard" } });
  return act(s, { type: "START_GAME", playerId: ids[0], seed: 4 });
}

/** Set hands, the pond (top first), whose turn it is, and clear books and the log. */
function rig(s: GoFishState, turn: string, hands: Record<string, string>, pond: string): GoFishState {
  const n = structuredClone(s);
  for (const p of n.players) {
    p.hand = cards(hands[p.id] ?? "");
    p.books = [];
  }
  n.pond = cards(pond);
  n.currentTurnId = turn;
  n.log = [];
  return n;
}

describe("dealing", () => {
  it("deals 7 each to two or three players, 5 to more", () => {
    expect(game(["a", "b"]).players.map((p) => p.hand.length + p.books.length * 4)).toEqual([7, 7]);
    const four = game(["a", "b", "c", "d"]);
    expect(four.players.every((p) => p.hand.length + p.books.length * 4 === 5)).toBe(true);
    expect(four.pond.length).toBe(52 - 20);
  });
});

describe("asking", () => {
  it("takes every card of the rank and goes again", () => {
    let s = rig(game(["a", "b"]), "a", { a: "8S 2C", b: "8H 8D 5C" }, "9S 9H");
    s = ask(s, "a", "b", 8);
    expect(s.players[0].hand.map((c) => c.id).sort()).toEqual(["2C", "8D", "8H", "8S"]);
    expect(s.currentTurnId).toBe("a");
    expect(s.log.at(-1)).toMatchObject({ kind: "ask", got: 2, again: true });
  });

  it("only lets you ask for a rank you hold, from someone with cards", () => {
    const s = rig(game(["a", "b", "c"]), "a", { a: "8S", b: "8H", c: "" }, "9S");
    expect(applyGoFishAction(s, { type: "ASK", playerId: "a", targetId: "b", rank: 5 }).ok).toBe(false);
    expect(applyGoFishAction(s, { type: "ASK", playerId: "a", targetId: "c", rank: 8 }).ok).toBe(false);
    expect(applyGoFishAction(s, { type: "ASK", playerId: "b", targetId: "a", rank: 8 }).ok).toBe(false);
    expect(getGoFishLegal(getGoFishView(s, "a"), "a")).toEqual({ isMyTurn: true, targets: ["b"], ranks: [8] });
  });

  it("Go fish: draw one and the turn passes", () => {
    const s = ask(rig(game(["a", "b"]), "a", { a: "8S", b: "5C" }, "9S 9H"), "a", "b", 8);
    expect(s.players[0].hand.map((c) => c.id)).toEqual(["8S", "9S"]);
    expect(s.currentTurnId).toBe("b");
    expect(s.log.at(-1)).toMatchObject({ got: 0, fished: true, lucky: false, shown: null });
  });

  it("Lucky catch: fishing up the rank you asked for earns another turn", () => {
    const s = ask(rig(game(["a", "b"]), "a", { a: "8S", b: "5C" }, "8H 9H"), "a", "b", 8);
    expect(s.currentTurnId).toBe("a");
    expect(s.log.at(-1)).toMatchObject({ lucky: true, again: true, shown: { id: "8H" } });
    const off = ask(rig(game(["a", "b"], { luckyCatch: false }), "a", { a: "8S", b: "5C" }, "8H 9H"), "a", "b", 8);
    expect(off.currentTurnId).toBe("b");
  });
});

describe("books", () => {
  it("four of a kind goes down as a book", () => {
    const s = ask(rig(game(["a", "b"]), "a", { a: "TS TH AD", b: "TD TC 5C" }, "9S"), "a", "b", 10);
    expect(s.players[0].books).toEqual([10]);
    expect(s.players[0].hand.map((c) => c.id)).toEqual(["AD"]);
    expect(s.log.some((e) => e.kind === "book" && e.rank === 10)).toBe(true);
  });

  it("pairs variant: two of a kind is a book", () => {
    const s = ask(rig(game(["a", "b"], { bookSize: 2 }), "a", { a: "TS AD", b: "TD TC 5C" }, "9S"), "a", "b", 10);
    // Three 10s: one pair booked, one left over.
    expect(s.players[0].books).toEqual([10]);
    expect(s.players[0].hand.map((c) => c.id).sort()).toEqual(["AD", "TC"]);
  });

  it("an empty hand draws from the pond", () => {
    // b gives away its only card; a books with its last cards. Both draw.
    const s = ask(rig(game(["a", "b"]), "a", { a: "TS TH TD", b: "TC" }, "9S 9H 4C"), "a", "b", 10);
    expect(s.players.map((p) => p.hand.length)).toEqual([1, 1]);
    expect(s.log.filter((e) => e.kind === "refill")).toHaveLength(2);
    const five = ask(rig(game(["a", "b"], { refill: 5 }), "a", { a: "TS TH TD", b: "TC" }, "2S 3S 4S 5S 6S 7S 8S 9S JS QS"), "a", "b", 10);
    expect(five.players.map((p) => p.hand.length)).toEqual([5, 5]);
  });

  it("ends when every card is booked; most books wins", () => {
    let s = rig(game(["a", "b"]), "a", { a: "TS TH TD", b: "TC" }, "");
    s.players[0].books = [2, 3, 4];
    s.players[1].books = [5, 6, 7, 8, 9, 11, 12, 13, 14];
    s = ask(s, "a", "b", 10);
    expect(s.phase).toBe("game_over");
    expect(s.winnerIds).toEqual(["b"]);
  });
});

describe("what players see", () => {
  it("hides other hands and the pond, but not a lucky catch", () => {
    const s = rig(game(["a", "b"]), "a", { a: "8S", b: "5C KD" }, "9H");
    const json = JSON.stringify(getGoFishView(s, "a"));
    for (const id of ["5C", "KD", "9H"]) expect(json).not.toContain(`"${id}"`);
    expect(getGoFishView(s, "a").players[1].handCount).toBe(2);
  });

  it("remembers who holds what from the public record", () => {
    let s = rig(game(["a", "b", "c"]), "a", { a: "8S QS", b: "5C", c: "QH 7D" }, "9H 2C 3C");
    s = ask(s, "a", "b", 8); // Go fish: a holds 8s.
    s = ask(s, "b", "c", 5); // Go fish: b holds 5s, c has no 5s.
    const known = knownRanks(s.log);
    expect([...known.a]).toEqual([8]);
    expect([...known.b]).toEqual([5]);
    s = ask(s, "c", "a", 12); // c takes a's Queen: c holds Queens, a doesn't.
    const after = knownRanks(s.log);
    expect(after.c.has(12)).toBe(true);
    expect(after.a.has(12)).toBe(false);
    // Remembering only the last ask, nothing is known about a's 8s any more.
    expect(knownRanks(s.log, 1).a?.has(8) ?? false).toBe(false);
  });
});

describe("go fish bots", () => {
  it("Medium and Hard go after a rank someone just asked for", () => {
    let s = rig(game(["a", "c"], {}, ["bot"]), "a", { a: "KS 2C", c: "5D", bot: "KD 9C 4H" }, "7C 8C 9D");
    s = ask(s, "a", "c", 13); // a goes fishing for Kings.
    s.currentTurnId = "bot";
    const obs = observeGoFish(getGoFishView(s, "bot"), "bot")!;
    expect(chooseAsk(obs, "medium", Math.random)).toEqual({ targetId: "a", rank: 13 });
    expect(chooseAsk(obs, "hard", Math.random)).toEqual({ targetId: "a", rank: 13 });
  });

  it("Hard asks for the rank it's closest to booking", () => {
    const s = rig(game(["a"], {}, ["bot"]), "bot", { a: "5D 6D 7D", bot: "9C 9H 9S 4H" }, "7C");
    const obs = observeGoFish(getGoFishView(s, "bot"), "bot")!;
    expect(chooseAsk(obs, "hard", Math.random).rank).toBe(9);
  });

  it("bots play a whole table to the end", () => {
    for (let seed = 1; seed <= 8; seed++) {
      let s = createGoFishRoom({ roomId: "t", host: { id: "e", name: "e", isBot: true, botDifficulty: "easy" }, settings: { bookSize: seed % 3 === 0 ? 2 : 4, refill: seed % 2 ? 1 : 5 } });
      for (const [id, d] of [["m", "medium"], ["h", "hard"]] as const) s = act(s, { type: "JOIN_ROOM", player: { id, name: id, isBot: true, botDifficulty: d } });
      s = act(s, { type: "START_GAME", playerId: "e", seed });
      const rng = seededRandom(seed);
      for (let i = 0; i < 2000 && s.phase === "playing"; i++) s = act(s, goFishBots.decide(s, goFishBots.pending(s)!.botId, rng)!);
      expect(s.phase).toBe("game_over");
      const size = s.settings.bookSize;
      expect(s.players.reduce((n, p) => n + p.books.length * size, 0)).toBe(52);
    }
  });
});
