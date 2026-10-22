import { describe, expect, it } from "vitest";
import type { HoldemAction, HoldemState } from "@/types/holdem";
import {
  applyHoldemAction,
  blindsForHand,
  createHoldemRoom,
  getHoldemLegal,
  getHoldemView,
  HOLDEM_DEFAULTS,
  nextBlindRise,
} from "@/lib/holdem-game";
import { cards } from "@/components/rules/sample-cards";

function must(r: { ok: boolean; state: HoldemState; error?: string }): HoldemState {
  if (!r.ok) throw new Error(r.error);
  return r.state;
}

const play = (s: HoldemState, ...actions: HoldemAction[]) => actions.reduce((st, a) => must(applyHoldemAction(st, a)), s);

/** A started game with the button on `button`, optionally with custom stacks. */
function table(ids: string[], opts: { chips?: number[]; button?: string; settings?: Partial<typeof HOLDEM_DEFAULTS> } = {}) {
  let s = createHoldemRoom({ roomId: "t", host: { id: ids[0], name: ids[0].toUpperCase() }, settings: opts.settings });
  for (const id of ids.slice(1)) s = must(applyHoldemAction(s, { type: "JOIN_ROOM", player: { id, name: id.toUpperCase() } }));
  // Find a seed whose random button is the one we want, so blinds and turn order are predictable.
  for (let seed = 1; seed < 500; seed++) {
    const started = must(applyHoldemAction(s, { type: "START_GAME", playerId: ids[0], seed }));
    if (!opts.button || started.buttonId === opts.button) return opts.chips ? withChips(started, opts.chips, ids) : started;
  }
  throw new Error("no seed");
}

/** Give players custom stacks (blinds already posted come out of them). */
function withChips(s: HoldemState, stacks: number[], ids: string[]): HoldemState {
  const n = structuredClone(s);
  ids.forEach((id, i) => {
    const p = n.players.find((x) => x.id === id)!;
    p.chips = stacks[i] - p.totalBet;
  });
  return n;
}

/** Force hole cards and the board. */
function rig(s: HoldemState, hands: Record<string, string>, board: string): HoldemState {
  const n = structuredClone(s);
  for (const [id, spec] of Object.entries(hands)) n.players.find((p) => p.id === id)!.hand = cards(spec);
  n.boardCards = cards(board);
  return n;
}

const chips = (s: HoldemState) => Object.fromEntries(s.players.map((p) => [p.id, p.chips]));
const total = (s: HoldemState) => s.players.reduce((n, p) => n + p.chips + p.totalBet * (s.phase === "betting" ? 1 : 0), 0);

describe("blinds and turn order", () => {
  it("posts blinds left of the button; first to act is left of the big blind", () => {
    const s = table(["a", "b", "c", "d"], { button: "a" });
    expect([s.smallBlindId, s.bigBlindId, s.currentTurnId]).toEqual(["b", "c", "d"]);
    expect(s.players.find((p) => p.id === "b")!.bet).toBe(10);
    expect(s.players.find((p) => p.id === "c")!.bet).toBe(20);
    expect(s.currentBet).toBe(20);
  });

  it("heads-up: the button posts the small blind and acts first before the flop, last after", () => {
    let s = table(["a", "b"], { button: "a" });
    expect([s.smallBlindId, s.bigBlindId, s.currentTurnId]).toEqual(["a", "b", "a"]);
    s = play(s, { type: "CALL", playerId: "a" }, { type: "CHECK", playerId: "b" });
    expect(s.street).toBe("flop");
    expect(s.currentTurnId).toBe("b");
  });

  it("gives the big blind the option when everyone just calls", () => {
    let s = table(["a", "b", "c"], { button: "a" });
    s = play(s, { type: "CALL", playerId: "a" }, { type: "CALL", playerId: "b" });
    expect(s.street).toBe("preflop");
    expect(s.currentTurnId).toBe("c");
    expect(getHoldemLegal(getHoldemView(s, "c"), "c")).toMatchObject({ canCheck: true, canRaise: true });
  });

  it("moves the button each hand", () => {
    let s = table(["a", "b", "c"], { button: "a" });
    s = play(s, { type: "FOLD", playerId: "a" }, { type: "FOLD", playerId: "b" });
    expect(s.phase).toBe("hand_over");
    s = play(s, { type: "NEXT_HAND", playerId: "a" });
    expect(s.buttonId).toBe("b");
    expect([s.smallBlindId, s.bigBlindId]).toEqual(["c", "a"]);
  });
});

describe("betting rules", () => {
  it("enforces the minimum raise: the size of the last raise", () => {
    let s = table(["a", "b", "c"], { button: "a" });
    // a is first to act preflop (3-handed: left of the big blind is the button).
    expect(applyHoldemAction(s, { type: "RAISE", playerId: "a", to: 30 }).ok).toBe(false);
    s = play(s, { type: "RAISE", playerId: "a", to: 60 }); // raise of 40
    expect(applyHoldemAction(s, { type: "RAISE", playerId: "b", to: 90 }).ok).toBe(false);
    s = play(s, { type: "RAISE", playerId: "b", to: 100 });
    expect(s.minRaise).toBe(40);
    expect(s.currentBet).toBe(100);
  });

  it("a short all-in doesn't reopen betting for players who already acted", () => {
    // c (big blind) has only 70 total.
    let s = table(["a", "b", "c"], { button: "a", chips: [1000, 1000, 70] });
    s = play(s, { type: "RAISE", playerId: "a", to: 50 }, { type: "CALL", playerId: "b" });
    s = play(s, { type: "ALL_IN", playerId: "c" }); // to 70: +20, less than a full raise of 30
    expect(s.currentBet).toBe(70);
    expect(s.currentTurnId).toBe("a");
    const legal = getHoldemLegal(getHoldemView(s, "a"), "a");
    expect(legal.canRaise).toBe(false);
    expect(legal.callAmount).toBe(20);
    expect(applyHoldemAction(s, { type: "RAISE", playerId: "a", to: 200 }).ok).toBe(false);
  });

  it("can't check facing a bet, or act out of turn", () => {
    const s = table(["a", "b", "c"], { button: "a" });
    expect(applyHoldemAction(s, { type: "CHECK", playerId: "a" }).ok).toBe(false);
    expect(applyHoldemAction(s, { type: "CALL", playerId: "b" }).ok).toBe(false);
  });

  it("everyone folding to a bet wins the pot without showing cards", () => {
    let s = table(["a", "b", "c"], { button: "a" });
    s = play(s, { type: "RAISE", playerId: "a", to: 80 }, { type: "FOLD", playerId: "b" }, { type: "FOLD", playerId: "c" });
    expect(s.phase).toBe("hand_over");
    expect(s.result!.uncontested).toBe(true);
    expect(s.result!.revealed).toEqual({});
    expect(chips(s)).toEqual({ a: 1030, b: 990, c: 980 });
  });
});

describe("showdown", () => {
  it("plays every street and pays the best hand", () => {
    let s = table(["a", "b"], { button: "a" });
    s = rig(s, { a: "AS AH", b: "KS KH" }, "2C 7D 9H JS 3C");
    s = play(s, { type: "CALL", playerId: "a" }, { type: "CHECK", playerId: "b" });
    for (const street of ["flop", "turn", "river"]) {
      expect(s.street).toBe(street);
      s = play(s, { type: "CHECK", playerId: "b" }, { type: "CHECK", playerId: "a" });
    }
    expect(s.phase).toBe("hand_over");
    expect(s.result!.best.a.label).toBe("Pair of Aces");
    expect(chips(s)).toEqual({ a: 1020, b: 980 });
  });

  it("splits a tied pot (board plays) and kickers decide otherwise", () => {
    let s = table(["a", "b", "c"], { button: "a" });
    s = rig(s, { a: "2S 3D", b: "4H 5C", c: "KS 2H" }, "AS KD QC JH TS");
    s = play(s, { type: "CALL", playerId: "a" }, { type: "CALL", playerId: "b" }, { type: "CHECK", playerId: "c" });
    for (let i = 0; i < 3; i++) s = play(s, { type: "CHECK", playerId: "b" }, { type: "CHECK", playerId: "c" }, { type: "CHECK", playerId: "a" });
    expect(s.result!.pots[0].winnerIds.sort()).toEqual(["a", "b", "c"]);
    expect(chips(s)).toEqual({ a: 1000, b: 1000, c: 1000 });

    let k = table(["a", "b"], { button: "a" });
    k = rig(k, { a: "9S AD", b: "9H KC" }, "9D 7C 4S 3H 2D");
    k = play(k, { type: "CALL", playerId: "a" }, { type: "CHECK", playerId: "b" });
    for (let i = 0; i < 3; i++) k = play(k, { type: "CHECK", playerId: "b" }, { type: "CHECK", playerId: "a" });
    expect(k.result!.pots[0].winnerIds).toEqual(["a"]); // Ace kicker beats King kicker
  });

  it("gives an odd chip to the first winner left of the button", () => {
    // Button a, small blind b (5, folded), big blind c. Pot = 31 + 5 + 31 = 67, split between a and c.
    let o = table(["a", "b", "c"], { button: "a", settings: { smallBlind: 5 } });
    o = rig(o, { a: "2S 3D", b: "4H 5C", c: "6D 7S" }, "AS KD QC JH TS");
    o = play(o, { type: "RAISE", playerId: "a", to: 31 }, { type: "FOLD", playerId: "b" }, { type: "CALL", playerId: "c" });
    for (let i = 0; i < 3; i++) o = play(o, { type: "CHECK", playerId: "c" }, { type: "CHECK", playerId: "a" });
    expect(o.result!.pots[0].amount).toBe(67);
    // c sits closer to the button's left than a, so c gets the odd chip.
    expect(o.result!.pots[0].shares).toEqual({ c: 34, a: 33 });
    expect(chips(o)).toEqual({ a: 1002, b: 995, c: 1003 });
  });

  it("builds side pots when a short stack is all in", () => {
    // a has 100, b and c have 1000.
    let s = table(["a", "b", "c"], { button: "c", chips: [100, 1000, 1000] });
    // Button c, sb a, bb b. First to act: c.
    s = rig(s, { a: "AS AH", b: "KS KH", c: "QS QH" }, "2C 7D 9H JS 3C");
    s = play(s, { type: "RAISE", playerId: "c", to: 300 }, { type: "ALL_IN", playerId: "a" }, { type: "CALL", playerId: "b" });
    expect(s.street).toBe("flop");
    for (let i = 0; i < 3; i++) s = play(s, { type: "CHECK", playerId: "b" }, { type: "CHECK", playerId: "c" });
    const pots = s.result!.pots;
    expect(pots[0]).toMatchObject({ amount: 300, winnerIds: ["a"] }); // main pot: 100 × 3
    expect(pots[1]).toMatchObject({ amount: 400, winnerIds: ["b"] }); // side pot: 200 × 2
    expect(chips(s)).toEqual({ a: 300, b: 1100, c: 700 });
  });

  it("returns an unmatched all-in to the bigger stack and runs out the board", () => {
    let s = table(["a", "b"], { button: "a", chips: [300, 1000] });
    s = rig(s, { a: "KS KH", b: "AS AH" }, "2C 7D 9H JS 3C");
    s = play(s, { type: "ALL_IN", playerId: "a" }, { type: "ALL_IN", playerId: "b" });
    expect(s.phase).toBe("game_over");
    expect(s.result!.pots).toHaveLength(1);
    expect(s.result!.pots[0].amount).toBe(600);
    expect(chips(s)).toEqual({ a: 0, b: 1300 });
    expect(s.winnerId).toBe("b");
    expect(s.players.find((p) => p.id === "a")!.status).toBe("busted");
  });
});

describe("blind increases", () => {
  it("never rise by default", () => {
    expect(blindsForHand(HOLDEM_DEFAULTS, 50)).toEqual({ small: 10, big: 20 });
    expect(nextBlindRise(HOLDEM_DEFAULTS, 3)).toBeNull();
  });

  it("double every N hands when switched on", () => {
    const settings = { ...HOLDEM_DEFAULTS, blindIncrease: { mode: "every_n_hands" as const, everyHands: 2, multiplier: 2 } };
    expect([1, 2, 3, 4, 5].map((h) => blindsForHand(settings, h).small)).toEqual([10, 10, 20, 20, 40]);
    expect(nextBlindRise(settings, 1)).toEqual({ handsLeft: 2, small: 20, big: 40 });
    expect(nextBlindRise(settings, 2)).toEqual({ handsLeft: 1, small: 20, big: 40 });
  });

  it("applies the new blinds when the hand starts", () => {
    let s = table(["a", "b", "c"], { button: "a", settings: { blindIncrease: { mode: "every_n_hands", everyHands: 1, multiplier: 2 } } });
    expect(s.bigBlind).toBe(20);
    s = play(s, { type: "FOLD", playerId: "a" }, { type: "FOLD", playerId: "b" }, { type: "NEXT_HAND", playerId: "a" });
    expect([s.smallBlind, s.bigBlind]).toEqual([20, 40]);
  });
});

describe("views and hosting", () => {
  it("hides other hands, the unturned board and the burns", () => {
    const s = table(["a", "b", "c"], { button: "a" });
    const v = getHoldemView(s, "a");
    expect(v.players.find((p) => p.id === "a")!.hand).toHaveLength(2);
    expect(v.players.find((p) => p.id === "b")!.hand).toBeNull();
    expect(v.board).toEqual([]);
    expect("boardCards" in v || "burnCards" in v || "rngState" in v).toBe(false);
  });

  it("only the host deals the next hand", () => {
    let s = table(["a", "b", "c"], { button: "a" });
    s = play(s, { type: "FOLD", playerId: "a" }, { type: "FOLD", playerId: "b" });
    expect(applyHoldemAction(s, { type: "NEXT_HAND", playerId: "b" }).ok).toBe(false);
  });

  it("never creates or destroys chips over many random hands", () => {
    let s = table(["a", "b", "c", "d"]);
    const start = 4000;
    for (let hand = 0; hand < 60 && s.phase !== "game_over"; hand++) {
      let guard = 0;
      while (s.phase === "betting" && guard++ < 200) {
        const id = s.currentTurnId!;
        const legal = getHoldemLegal(getHoldemView(s, id), id);
        const roll = (hand * 7 + guard * 13) % 10;
        const action: HoldemAction =
          roll < 2 && !legal.canCheck
            ? { type: "FOLD", playerId: id }
            : roll < 4 && legal.canRaise
              ? { type: "RAISE", playerId: id, to: legal.minRaiseTo }
              : roll < 5
                ? { type: "ALL_IN", playerId: id }
                : legal.canCheck
                  ? { type: "CHECK", playerId: id }
                  : { type: "CALL", playerId: id };
        const r = applyHoldemAction(s, action);
        s = r.ok ? r.state : must(applyHoldemAction(s, legal.canCheck ? { type: "CHECK", playerId: id } : { type: "CALL", playerId: id }));
      }
      expect(total(s)).toBe(start);
      if (s.phase === "hand_over") s = play(s, { type: "NEXT_HAND", playerId: "a" });
    }
  });
});
