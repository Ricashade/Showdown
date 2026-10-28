import { describe, expect, it } from "vitest";
import type { GarbageAction, GarbageSettings, GarbageState } from "@/types/garbage";
import { applyGarbageAction, cardRole, createGarbageRoom, getGarbageLegal, getGarbageView, legalSlots, GARBAGE_DEFAULTS } from "@/lib/garbage-engine";
import { chooseWildSlot, garbageBots, observeGarbage } from "@/lib/bot-ai";
import { cards } from "@/components/rules/sample-cards";

function must(r: { ok: boolean; state: GarbageState; error?: string }): GarbageState {
  if (!r.ok) throw new Error(r.error);
  return r.state;
}
const act = (s: GarbageState, a: GarbageAction) => must(applyGarbageAction(s, a));
const play = (s: GarbageState, ...actions: GarbageAction[]) => actions.reduce(act, s);

function game(ids: string[], settings?: Partial<GarbageSettings>) {
  let s = createGarbageRoom({ roomId: "t", host: { id: ids[0], name: ids[0] }, settings });
  for (const id of ids.slice(1)) s = act(s, { type: "JOIN_ROOM", player: { id, name: id } });
  return act(s, { type: "START_GAME", playerId: ids[0], seed: 3 });
}

/**
 * Set up a position. Boards are written slot by slot: "4S" is face down (hidden 4S),
 * "+QH" is face up (a Queen placed there).
 */
function rig(s: GarbageState, opts: { turn: string; boards?: Record<string, string>; stock?: string; discard?: string }): GarbageState {
  const n = structuredClone(s);
  n.currentTurnId = opts.turn;
  n.active = null;
  n.activeFrom = null;
  for (const [id, spec] of Object.entries(opts.boards ?? {})) {
    const p = n.players.find((x) => x.id === id)!;
    p.slots = spec.split(/\s+/).map((t) => (t.startsWith("+") ? { hidden: null, shown: cards(t.slice(1))[0], revealed: null } : { hidden: cards(t)[0], shown: null, revealed: null }));
    p.target = p.slots.length;
  }
  if (opts.stock !== undefined) n.stock = cards(opts.stock);
  if (opts.discard !== undefined) n.discard = cards(opts.discard);
  return n;
}

const QK = GARBAGE_DEFAULTS.faceCards;

describe("cards and slots", () => {
  it("defaults to Queens and Kings wild, Jacks dead; the Jacks preset flips it", () => {
    expect([cardRole(cards("AS")[0], QK), cardRole(cards("TS")[0], QK)]).toEqual([1, 10]);
    expect(cards("JS QS KS").map((c) => cardRole(c, QK))).toEqual(["dead", "wild", "wild"]);
    const s = game(["a", "b"], { faceCardPreset: "jacks" });
    expect(cards("JS QS KS").map((c) => cardRole(c, s.settings.faceCards))).toEqual(["wild", "dead", "dead"]);
  });

  it("lets the host mix custom face-card rules", () => {
    let s = createGarbageRoom({ roomId: "t", host: { id: "a", name: "a" } });
    s = act(s, { type: "UPDATE_SETTINGS", playerId: "a", settings: { faceCardPreset: "custom", faceCards: { J: "wild", Q: "wild", K: "dead" } } });
    expect(s.settings.faceCards).toEqual({ J: "wild", Q: "wild", K: "dead" });
    // Back to a preset: the preset's roles win.
    s = act(s, { type: "UPDATE_SETTINGS", playerId: "a", settings: { faceCardPreset: "queens-kings" } });
    expect(s.settings.faceCards).toEqual(QK);
  });

  it("knows where a card can go", () => {
    const board = [
      { faceDown: true, shown: null },
      { faceDown: false, shown: cards("2H")[0] },
      { faceDown: false, shown: cards("QH")[0] },
      { faceDown: true, shown: null },
    ];
    expect(legalSlots(board, cards("AS")[0], QK)).toEqual([0]);
    expect(legalSlots(board, cards("2S")[0], QK)).toEqual([]); // Already filled.
    expect(legalSlots(board, cards("3S")[0], QK)).toEqual([2]); // Replaces the wild.
    expect(legalSlots(board, cards("7S")[0], QK)).toEqual([]); // No slot 7 on a 4-card board.
    expect(legalSlots(board, cards("KS")[0], QK)).toEqual([0, 3]);
    expect(legalSlots(board, cards("JS")[0], QK)).toEqual([]);
  });
});

describe("dealing", () => {
  it("uses one deck for two players and two for three or more", () => {
    const two = game(["a", "b"]);
    expect(two.players.every((p) => p.slots.length === 10 && p.slots.every((x) => x.hidden && !x.shown))).toBe(true);
    expect(two.stock.length).toBe(52 - 20 - 1);
    expect(two.discard).toHaveLength(1);
    expect(game(["a", "b", "c"]).stock.length).toBe(104 - 30 - 1);
  });

  it("rebuilds an empty draw pile from the discards, keeping the top card", () => {
    let s = rig(game(["a", "b"]), { turn: "a", stock: "", discard: "9C 8C 7C JD" });
    s = act(s, { type: "DRAW", playerId: "a", source: "stock" });
    expect(s.discard.map((c) => c.id)).toEqual(["JD"]);
    expect(s.stock).toHaveLength(2);
    expect(s.active).not.toBeNull();
  });
});

describe("a turn", () => {
  it("chains: 4 into slot 4, flip a Queen, wild into slot 7, flip a Jack, discard", () => {
    let s = rig(game(["a", "b"]), {
      turn: "a",
      boards: { a: "2C 3C 5C QH 6C 7C JD 8C 9C TC" },
      stock: "4S 2D",
    });
    s = act(s, { type: "DRAW", playerId: "a", source: "stock" });
    expect(getGarbageLegal(getGarbageView(s, "a"), "a").slots).toEqual([3]);
    s = act(s, { type: "PLACE", playerId: "a", slot: 3 });
    expect(s.active?.id).toBe("QH");
    expect(s.activeFrom).toEqual({ source: "slot", slot: 3 });
    // A wild fits any face-down slot.
    expect(getGarbageLegal(getGarbageView(s, "a"), "a").slots).toEqual([0, 1, 2, 4, 5, 6, 7, 8, 9]);
    s = act(s, { type: "PLACE", playerId: "a", slot: 6 });
    expect(s.active?.id).toBe("JD");
    expect(getGarbageLegal(getGarbageView(s, "a"), "a").mustDiscard).toBe(true);
    s = act(s, { type: "DISCARD", playerId: "a" });
    expect(s.currentTurnId).toBe("b");
    expect(s.discard.at(-1)?.id).toBe("JD");
    const a = s.players[0];
    expect([a.slots[3].shown?.id, a.slots[6].shown?.id]).toEqual(["4S", "QH"]);
  });

  it("won't let you throw away a card you can play, or take one you can't", () => {
    const s = rig(game(["a", "b"]), { turn: "a", boards: { a: "2C 3C 5C QH 6C 7C JD 8C 9C TC" }, stock: "4S", discard: "JS" });
    expect(applyGarbageAction(s, { type: "DRAW", playerId: "a", source: "discard" }).ok).toBe(false);
    const drawn = act(s, { type: "DRAW", playerId: "a", source: "stock" });
    expect(applyGarbageAction(drawn, { type: "DISCARD", playerId: "a" }).ok).toBe(false);
  });

  it("takes a playable card off the discard pile", () => {
    const s = rig(game(["a", "b"]), { turn: "a", boards: { a: "2C 3C 5C QH 6C 7C JD 8C 9C TC" }, discard: "9H 6S" });
    const n = act(s, { type: "DRAW", playerId: "a", source: "discard" });
    expect(n.active?.id).toBe("6S");
    expect(n.discard.map((c) => c.id)).toEqual(["9H"]);
  });

  it("swaps a natural card for the wild in its slot, and the wild moves on", () => {
    let s = rig(game(["a", "b"]), { turn: "a", boards: { a: "2C 3C 5C +KH 6C" }, stock: "4S" });
    s = play(s, { type: "DRAW", playerId: "a", source: "stock" }, { type: "PLACE", playerId: "a", slot: 3 });
    expect(s.active?.id).toBe("KH");
    expect(s.players[0].slots[3].shown?.id).toBe("4S");
    expect(getGarbageLegal(getGarbageView(s, "a"), "a").slots).toEqual([0, 1, 2, 4]);
  });
});

describe("rounds and winning", () => {
  it("with the last lap off, ends the round as soon as a board is cleared", () => {
    let s = rig(game(["a", "b"], { lastTurn: false }), { turn: "a", boards: { a: "+AS +2S 3C", b: "2D 3D 4D" }, stock: "3S" });
    s = play(s, { type: "DRAW", playerId: "a", source: "stock" }, { type: "PLACE", playerId: "a", slot: 2 });
    expect(s.phase).toBe("round_over");
    expect(s.result).toMatchObject({ finisherIds: ["a"], nextTargets: { a: 2, b: 3 } });
    // The card picked up from the last slot went on the discard pile.
    expect(s.discard.at(-1)?.id).toBe("3C");
    expect(applyGarbageAction(s, { type: "NEXT_ROUND", playerId: "b" }).ok).toBe(false);
    const next = act(s, { type: "NEXT_ROUND", playerId: "a" });
    expect(next.players.map((p) => p.slots.length)).toEqual([2, 3]);
    expect(next.starterId).not.toBe(s.starterId);
  });

  it("gives everyone else a last turn by default, then a reveal", () => {
    let s = rig(game(["a", "b", "c"]), { turn: "a", boards: { a: "+AS 2C", b: "AD 3D", c: "AH 2H" }, stock: "2S 7D 8D" });
    s = play(s, { type: "DRAW", playerId: "a", source: "stock" }, { type: "PLACE", playerId: "a", slot: 1 });
    expect(s.phase).toBe("playing");
    expect(s.lastLap).toEqual(["b", "c"]);
    expect(s.currentTurnId).toBe("b");
    s = play(s, { type: "DRAW", playerId: "b", source: "stock" }, { type: "DISCARD", playerId: "b" });
    expect(s.currentTurnId).toBe("c");
    s = play(s, { type: "DRAW", playerId: "c", source: "stock" }, { type: "DISCARD", playerId: "c" });
    expect(s.phase).toBe("reveal");
    // b turned over AD and 3D; c turned over AH and 2H. a already finished.
    expect(s.players.map((p) => p.revealDone)).toEqual([true, false, false]);
    expect(s.players[1].slots.map((x) => x.revealed?.id)).toEqual(["AD", "3D"]);
    s = play(s, { type: "REVEAL_DONE", playerId: "b" }, { type: "REVEAL_DONE", playerId: "c" });
    expect(s.phase).toBe("round_over");
    // c's revealed Ace and 2 were already in place: that clears c's board too.
    expect(s.result).toMatchObject({ finisherIds: ["a", "c"], revealClearIds: ["c"], nextTargets: { a: 1, b: 2, c: 1 } });
  });

  it("lets you swap revealed cards into place to clear your board", () => {
    // a clears; b gets a last turn (draws a garbage Jack), then reveals 2D, AD, QS.
    let s = rig(game(["a", "b"]), { turn: "a", boards: { a: "+AS 2C", b: "2D AD QS" }, stock: "2S JD" });
    s = play(s, { type: "DRAW", playerId: "a", source: "stock" }, { type: "PLACE", playerId: "a", slot: 1 });
    s = play(s, { type: "DRAW", playerId: "b", source: "stock" }, { type: "DISCARD", playerId: "b" });
    expect(s.phase).toBe("reveal");
    expect(getGarbageLegal(getGarbageView(s, "b"), "b").canRearrange).toBe(true);
    expect(applyGarbageAction(s, { type: "SWAP_REVEALED", playerId: "a", from: 0, to: 1 }).ok).toBe(false);
    s = act(s, { type: "SWAP_REVEALED", playerId: "b", from: 0, to: 1 });
    expect(s.players[1].slots.map((x) => x.revealed?.id)).toEqual(["AD", "2D", "QS"]);
    s = act(s, { type: "REVEAL_DONE", playerId: "b" });
    expect(s.result).toMatchObject({ finisherIds: ["a", "b"], revealClearIds: ["b"], nextTargets: { a: 1, b: 2 } });
  });

  it("doesn't count a revealed board that won't fill, and the host can end the reveal", () => {
    let s = rig(game(["a", "b"]), { turn: "a", boards: { a: "+AS 2C", b: "2D 9D JS" }, stock: "2S JD" });
    s = play(s, { type: "DRAW", playerId: "a", source: "stock" }, { type: "PLACE", playerId: "a", slot: 1 });
    s = play(s, { type: "DRAW", playerId: "b", source: "stock" }, { type: "DISCARD", playerId: "b" });
    expect(applyGarbageAction(s, { type: "FINISH_REVEAL", playerId: "b" }).ok).toBe(false);
    s = act(s, { type: "FINISH_REVEAL", playerId: "a" });
    expect(s.result).toMatchObject({ finisherIds: ["a"], revealClearIds: [], nextTargets: { a: 1, b: 3 } });
  });

  it("the first to clear a one-slot board wins", () => {
    let s = rig(game(["a", "b"]), { turn: "a", boards: { a: "9C", b: "2D 3D" }, stock: "AS" });
    s = play(s, { type: "DRAW", playerId: "a", source: "stock" }, { type: "PLACE", playerId: "a", slot: 0 });
    expect(s.phase).toBe("game_over");
    expect(s.winnerId).toBe("a");
  });
});

describe("what players see", () => {
  it("keeps face-down cards and the draw pile hidden from everyone, owner included", () => {
    const s = rig(game(["a", "b"]), { turn: "a", boards: { a: "2C 3C 5C", b: "9D 8D 7D" }, stock: "4S" });
    for (const viewer of ["a", "b", "god"]) {
      const v = getGarbageView(s, viewer);
      const json = JSON.stringify(v);
      for (const id of ["2C", "3C", "5C", "9D", "4S"]) expect(json).not.toContain(`"${id}"`);
      expect(v.stockCount).toBe(1);
      expect(v.players[0].slots[0]).toEqual({ faceDown: true, shown: null, revealed: null });
    }
  });
});

describe("garbage bots", () => {
  const withBot = () => {
    let s = createGarbageRoom({ roomId: "t", host: { id: "a", name: "a" } });
    s = act(s, { type: "JOIN_ROOM", player: { id: "bot", name: "Bot", isBot: true, botDifficulty: "hard" } });
    return act(s, { type: "START_GAME", playerId: "a", seed: 3 });
  };

  it("take a playable discard and throw away what they can't use", () => {
    let s = rig(withBot(), { turn: "bot", boards: { bot: "2C 3C 5C" }, discard: "3H", stock: "JS" });
    expect(garbageBots.decide(s, "bot")).toEqual({ type: "DRAW", playerId: "bot", source: "discard" });
    s = rig(s, { turn: "bot", discard: "9H", stock: "JS" });
    expect(garbageBots.decide(s, "bot")).toEqual({ type: "DRAW", playerId: "bot", source: "stock" });
    s = act(s, { type: "DRAW", playerId: "bot", source: "stock" });
    expect(garbageBots.decide(s, "bot")).toEqual({ type: "DISCARD", playerId: "bot" });
    expect(garbageBots.pending(s)?.pace).toBe(900);
  });

  it("put a wild where the number is hardest to find (Hard) or the first gap (Easy)", () => {
    // Three 4s are already showing, so slot 4 is the hard one to fill.
    const s = act(
      rig(withBot(), { turn: "bot", boards: { bot: "2C 3C 5C 6C 7C", a: "+4D 2H 3H" }, discard: "4H 4S", stock: "KS" }),
      { type: "DRAW", playerId: "bot", source: "stock" },
    );
    const obs = observeGarbage(getGarbageView(s, "bot"), "bot")!;
    expect(chooseWildSlot(obs, obs.legal.slots, "hard")).toBe(3);
    expect(chooseWildSlot(obs, obs.legal.slots, "medium")).toBe(3);
    expect(chooseWildSlot(obs, obs.legal.slots, "easy")).toBe(0);
  });

  it("swap their revealed cards into the best layout, then finish", () => {
    let s = rig(withBot(), { turn: "a", boards: { a: "+AS 2C", bot: "QS 3D AD" }, stock: "2S 9C" });
    s = play(s, { type: "DRAW", playerId: "a", source: "stock" }, { type: "PLACE", playerId: "a", slot: 1 });
    s = play(s, { type: "DRAW", playerId: "bot", source: "stock" }, { type: "DISCARD", playerId: "bot" });
    expect(s.phase).toBe("reveal");
    for (let i = 0; i < 5 && s.phase === "reveal"; i++) s = act(s, garbageBots.decide(s, "bot")!);
    // A in A, 3 in 3, the Queen fills the 2.
    expect(s.players[1].slots.map((x) => x.revealed?.id)).toEqual(["AD", "QS", "3D"]);
    expect(s.result?.revealClearIds).toEqual(["bot"]);
  });

  it("decide from their own view: what's face down doesn't change their move", () => {
    const s = act(rig(withBot(), { turn: "bot", boards: { bot: "2C 3C 5C 6C 7C" }, stock: "KS" }), { type: "DRAW", playerId: "bot", source: "stock" });
    const other = rig(s, { turn: "bot", boards: { bot: "9D 8D 7D 6D 5D" } });
    other.active = s.active;
    expect(garbageBots.decide(s, "bot", () => 0.3)).toEqual(garbageBots.decide(other, "bot", () => 0.3));
  });
});
