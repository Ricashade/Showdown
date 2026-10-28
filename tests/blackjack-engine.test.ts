import { describe, expect, it } from "vitest";
import type { BlackjackAction, BlackjackState } from "@/types/blackjack";
import {
  applyBlackjackAction,
  blackjackClock,
  createBlackjackRoom,
  dealerShouldHit,
  getBlackjackLegal,
  getBlackjackView,
  handValue,
  SETTLE_MS,
  TURN_SECONDS,
} from "@/lib/blackjack-engine";
import { basicStrategy, blackjackBots, getBlackjackBotAction, observeBlackjack } from "@/lib/bot-ai";
import { cards } from "@/components/rules/sample-cards";

const NOW = 1_000_000;

function must(r: { ok: boolean; state: BlackjackState; error?: string }): BlackjackState {
  if (!r.ok) throw new Error(r.error);
  return r.state;
}

const act = (s: BlackjackState, action: BlackjackAction, now = NOW) => must(applyBlackjackAction(s, action, now));
const play = (s: BlackjackState, ...actions: BlackjackAction[]) => actions.reduce((st, a) => act(st, a), s);

/** A started game in its first betting round. */
function table(ids: string[], opts: { chips?: number; bots?: string[] } = {}) {
  let s = createBlackjackRoom({ roomId: "t", host: { id: ids[0], name: ids[0].toUpperCase() }, settings: { startingChips: opts.chips ?? 1000 } });
  for (const id of ids.slice(1)) s = act(s, { type: "JOIN_ROOM", player: { id, name: id.toUpperCase() } });
  for (const id of opts.bots ?? []) s = act(s, { type: "JOIN_ROOM", player: { id, name: id, isBot: true, botDifficulty: "hard" } });
  return act(s, { type: "START_GAME", playerId: ids[0], seed: 7 });
}

/** Put these cards on top of the shoe, in dealing order (each player, dealer, each player, dealer, then hits). */
function stack(s: BlackjackState, spec: string): BlackjackState {
  return { ...s, shoe: [...cards(spec), ...s.shoe] };
}

/** Stack the shoe and have everyone bet. */
function dealt(s: BlackjackState, spec: string, bets: Record<string, number>) {
  let n = stack(s, spec);
  for (const [playerId, amount] of Object.entries(bets)) n = act(n, { type: "PLACE_BET", playerId, amount });
  return n;
}

const chipsOf = (s: BlackjackState, id: string) => s.players.find((p) => p.id === id)!.chips;

describe("hand values", () => {
  it("counts Aces as 11 until that would bust", () => {
    expect(handValue(cards("AS 6H"))).toEqual({ total: 17, soft: true });
    expect(handValue(cards("AS 6H TD"))).toEqual({ total: 17, soft: false });
    expect(handValue(cards("AS AH 9D"))).toEqual({ total: 21, soft: true });
    expect(handValue(cards("KS QH 5D"))).toEqual({ total: 25, soft: false });
  });

  it("has the dealer hit soft 17 and stand on hard 17", () => {
    expect(dealerShouldHit(cards("AS 6H"))).toBe(true);
    expect(dealerShouldHit(cards("TS 7H"))).toBe(false);
    expect(dealerShouldHit(cards("TS 6H"))).toBe(true);
    expect(dealerShouldHit(cards("AS 7H"))).toBe(false);
  });
});

describe("betting", () => {
  it("opens with a timer and deals once everyone has bet", () => {
    const s = table(["a", "b"]);
    expect(s.phase).toBe("betting");
    expect(s.deadline).toBe(NOW + 15_000);
    const one = act(s, { type: "PLACE_BET", playerId: "a", amount: 50 });
    expect(one.phase).toBe("betting");
    const both = act(one, { type: "PLACE_BET", playerId: "b", amount: 25 });
    expect(both.phase).not.toBe("betting");
    expect(chipsOf(both, "a")).toBe(950);
    expect(both.players.every((p) => p.hands[0].cards.length === 2)).toBe(true);
    expect(both.dealer.cards).toHaveLength(2);
  });

  it("rejects bets under the minimum or over your chips", () => {
    const s = table(["a"]);
    expect(applyBlackjackAction(s, { type: "PLACE_BET", playerId: "a", amount: 5 }, NOW).ok).toBe(false);
    expect(applyBlackjackAction(s, { type: "PLACE_BET", playerId: "a", amount: 1001 }, NOW).ok).toBe(false);
  });

  it("deals whoever bet when time runs out, and only then", () => {
    const s = act(table(["a", "b"]), { type: "PLACE_BET", playerId: "a", amount: 10 });
    expect(applyBlackjackAction(s, { type: "TIME_UP", playerId: "a" }, NOW + 5_000).ok).toBe(false);
    const n = act(s, { type: "TIME_UP", playerId: "a" }, NOW + 15_000);
    expect(n.players.find((p) => p.id === "a")!.hands).toHaveLength(1);
    expect(n.players.find((p) => p.id === "b")!.hands).toHaveLength(0);
  });

  it("starts a fresh timer when nobody bet", () => {
    const n = act(table(["a"]), { type: "TIME_UP", playerId: "a" }, NOW + 15_000);
    expect(n.phase).toBe("betting");
    expect(n.deadline).toBe(NOW + 30_000);
  });

  it("only lets the host's clock call time", () => {
    const s = table(["a", "b"]);
    expect(applyBlackjackAction(s, { type: "TIME_UP", playerId: "b" }, NOW + 20_000).ok).toBe(false);
  });
});

describe("playing a round", () => {
  it("pays a natural 3:2", () => {
    // a: A K = blackjack; dealer 9 7.
    const s = dealt(table(["a"]), "AS 9H KS 7D", { a: 100 });
    expect(s.phase).toBe("dealer");
    const done = play(s, { type: "DEALER_STEP", playerId: "a" });
    expect(done.phase).toBe("settled");
    expect(done.players[0].hands[0].outcome).toBe("blackjack");
    expect(chipsOf(done, "a")).toBe(1150);
    expect(done.result!.net.a).toBe(150);
    expect(done.deadline).toBe(NOW + SETTLE_MS);
  });

  it("busts a player who goes over 21 and moves on", () => {
    // a: T 6, b: 9 9; dealer T 7. a hits a King.
    let s = dealt(table(["a", "b"]), "TS 9S TH 6D 9D 7C KC", { a: 10, b: 10 });
    expect(s.currentTurnId).toBe("a");
    expect(s.deadline).toBe(NOW + TURN_SECONDS * 1000);
    s = act(s, { type: "HIT", playerId: "a" });
    expect(s.players[0].hands[0].done).toBe(true);
    expect(s.currentTurnId).toBe("b");
    s = play(s, { type: "STAND", playerId: "b" }, { type: "DEALER_STEP", playerId: "a" });
    // Dealer stands on hard 17: a busted, b's 18 wins.
    expect(s.phase).toBe("settled");
    expect(s.players[0].hands[0].outcome).toBe("bust");
    expect(s.players[1].hands[0].outcome).toBe("win");
    expect(s.result!.net).toEqual({ a: -10, b: 10 });
  });

  it("has the dealer hit soft 17, bust, and pay everyone still standing", () => {
    // a: T 8; dealer A 6 (soft 17) draws 6 (13), then T (23).
    let s = dealt(table(["a"]), "TS AH 8D 6C 6S TD", { a: 20 });
    expect(s.phase).toBe("insurance");
    s = play(
      s,
      { type: "INSURANCE", playerId: "a", take: false },
      { type: "STAND", playerId: "a" },
      { type: "DEALER_STEP", playerId: "a" },
      { type: "DEALER_STEP", playerId: "a" },
    );
    expect(s.phase).toBe("dealer");
    s = act(s, { type: "DEALER_STEP", playerId: "a" });
    expect(s.result!.dealerBust).toBe(true);
    expect(s.result!.dealerTotal).toBe(23);
    expect(chipsOf(s, "a")).toBe(1020);
  });

  it("pushes on a tie", () => {
    const s = play(dealt(table(["a"]), "TS 9H 8D 9C", { a: 40 }), { type: "STAND", playerId: "a" }, { type: "DEALER_STEP", playerId: "a" });
    expect(s.players[0].hands[0].outcome).toBe("push");
    expect(chipsOf(s, "a")).toBe(1000);
  });

  it("doubles: twice the bet, exactly one card, then stands", () => {
    // a: 6 5 = 11, doubles into a 9; dealer T 8.
    let s = dealt(table(["a"]), "6S TH 5D 8C 9S", { a: 50 });
    s = act(s, { type: "DOUBLE", playerId: "a" });
    const hand = s.players[0].hands[0];
    expect(hand.cards).toHaveLength(3);
    expect(hand.bet).toBe(100);
    expect(hand.done).toBe(true);
    expect(s.phase).toBe("dealer");
    s = act(s, { type: "DEALER_STEP", playerId: "a" });
    expect(s.result!.net.a).toBe(100);
  });

  it("splits a pair into two hands with matching bets", () => {
    // a: 8 8, dealer 6 T; split hands draw 3 and K.
    let s = dealt(table(["a"]), "8S 6H 8D TC 3S KD", { a: 25 });
    expect(getBlackjackLegal(getBlackjackView(s, "a"), "a").canSplit).toBe(true);
    s = act(s, { type: "SPLIT", playerId: "a" });
    const [h1, h2] = s.players[0].hands;
    expect(h1.cards.map((c) => c.id)).toEqual(["8S", "3S"]);
    expect(h2.cards.map((c) => c.id)).toEqual(["8D", "KD"]);
    expect(h1.bet + h2.bet).toBe(50);
    expect(chipsOf(s, "a")).toBe(950);
    expect(s.currentHand).toBe(0);
    s = act(s, { type: "STAND", playerId: "a" });
    expect(s.currentHand).toBe(1);
  });

  it("gives split Aces one card each, and 21 there isn't a blackjack", () => {
    let s = dealt(table(["a"]), "AS 9H AD 8C KS 5D", { a: 10 });
    s = act(s, { type: "SPLIT", playerId: "a" });
    expect(s.players[0].hands.every((h) => h.done && h.cards.length === 2)).toBe(true);
    s = act(s, { type: "DEALER_STEP", playerId: "a" });
    // Dealer 17 stands. A K = 21 wins 1:1; A 5 = 16 loses.
    expect(s.players[0].hands.map((h) => h.outcome)).toEqual(["win", "lose"]);
    expect(s.result!.net.a).toBe(0);
  });

  it("won't split two different ten-cards", () => {
    const s = dealt(table(["a"]), "KS 9H QD 8C", { a: 10 });
    expect(applyBlackjackAction(s, { type: "SPLIT", playerId: "a" }, NOW).ok).toBe(false);
  });

  it("stands for you when your turn times out", () => {
    const s = dealt(table(["a", "b"]), "TS 9S TH 6D 9D 7C", { a: 10, b: 10 });
    const n = act(s, { type: "TIME_UP", playerId: "a" }, NOW + TURN_SECONDS * 1000);
    expect(n.players[0].hands[0].done).toBe(true);
    expect(n.currentTurnId).toBe("b");
  });
});

describe("insurance and the dealer's peek", () => {
  it("pays insurance 2:1 when the dealer has blackjack", () => {
    // a: T 9 for 100; dealer A K.
    let s = dealt(table(["a"]), "TS AH 9D KC", { a: 100 });
    expect(getBlackjackLegal(getBlackjackView(s, "a"), "a").insuranceOffer).toBe(50);
    s = act(s, { type: "INSURANCE", playerId: "a", take: true });
    expect(s.phase).toBe("settled");
    expect(s.dealer.holeRevealed).toBe(true);
    expect(s.result!.dealerBlackjack).toBe(true);
    expect(s.result!.insuranceWon.a).toBe(150);
    expect(s.result!.net.a).toBe(0);
    expect(chipsOf(s, "a")).toBe(1000);
  });

  it("loses the insurance when the dealer doesn't have it, then play goes on", () => {
    let s = dealt(table(["a"]), "TS AH 9D 7C", { a: 100 });
    s = act(s, { type: "INSURANCE", playerId: "a", take: true });
    expect(s.phase).toBe("playing");
    expect(s.dealer.holeRevealed).toBe(false);
    s = play(s, { type: "STAND", playerId: "a" }, { type: "DEALER_STEP", playerId: "a" });
    // Dealer soft 18 stands; 19 wins 100, insurance cost 50.
    expect(s.result!.net.a).toBe(50);
  });

  it("checks under a ten for blackjack and ends the round at once", () => {
    const s = dealt(table(["a", "b"]), "TS AS KH 9D KD AC", { a: 10, b: 10 });
    expect(s.phase).toBe("settled");
    expect(s.players[0].hands[0].outcome).toBe("lose");
    // b's own natural pushes against the dealer's.
    expect(s.players[1].hands[0].outcome).toBe("push");
  });

  it("closes insurance for anyone who didn't answer in time", () => {
    const s = dealt(table(["a"]), "TS AH 9D 7C", { a: 100 });
    const n = act(s, { type: "TIME_UP", playerId: "a" }, NOW + 15_000);
    expect(n.players[0].insurance).toBe(0);
    expect(n.phase).toBe("playing");
  });
});

describe("rounds and the end of the game", () => {
  it("only the host deals the next round, which reopens betting", () => {
    const s = play(dealt(table(["a", "b"]), "TS 9S TH 6D 9D 7C KC", { a: 10, b: 10 }), { type: "STAND", playerId: "a" }, { type: "STAND", playerId: "b" }, { type: "DEALER_STEP", playerId: "a" });
    expect(applyBlackjackAction(s, { type: "NEXT_ROUND", playerId: "b" }, NOW).ok).toBe(false);
    const n = act(s, { type: "NEXT_ROUND", playerId: "a" }, NOW + SETTLE_MS);
    expect(n.phase).toBe("betting");
    expect(n.roundNumber).toBe(2);
    expect(n.players.every((p) => p.hands.length === 0)).toBe(true);
    expect(n.players[0].lastBet).toBe(10);
  });

  it("ends the game when nobody can cover the minimum bet", () => {
    const s = play(dealt(table(["a"], { chips: 100 }), "TS 9H 6D TD KC", { a: 100 }), { type: "HIT", playerId: "a" });
    expect(s.phase).toBe("dealer");
    const n = act(s, { type: "DEALER_STEP", playerId: "a" });
    expect(n.phase).toBe("game_over");
    expect(n.players[0].status).toBe("busted");
    expect(n.players[0].bustedInRound).toBe(1);
  });
});

describe("what players see", () => {
  it("never shows the hole card or the shoe until the dealer turns it", () => {
    const s = dealt(table(["a"]), "TS 9H 8D 7C", { a: 10 });
    for (const viewer of ["a", "god"]) {
      const v = getBlackjackView(s, viewer);
      expect(v.dealer.cards[0]?.id).toBe("9H");
      expect(v.dealer.cards[1]).toBeNull();
      expect("shoe" in v).toBe(false);
      expect("rngState" in v).toBe(false);
      expect(JSON.stringify(v)).not.toContain('"7C"');
    }
    const after = play(s, { type: "STAND", playerId: "a" }, { type: "DEALER_STEP", playerId: "a" });
    expect(getBlackjackView(after, "a").dealer.cards[1]?.id).toBe("7C");
  });
});

describe("the host's clock", () => {
  it("times bets, the dealer's draws, and the next round", () => {
    const s = table(["a"]);
    expect(blackjackClock(s)).toEqual({ at: NOW + 15_000, action: { type: "TIME_UP", playerId: "a" } });
    const dealer = act(dealt(s, "TS 9H 8D 8C", { a: 10 }), { type: "STAND", playerId: "a" });
    expect(blackjackClock(dealer)?.action.type).toBe("DEALER_STEP");
    const settled = act(dealer, { type: "DEALER_STEP", playerId: "a" });
    expect(blackjackClock(settled)).toEqual({ at: NOW + SETTLE_MS, action: { type: "NEXT_ROUND", playerId: "a" } });
  });
});

describe("blackjack bots", () => {
  const up = (r: string) => {
    const c = cards(r)[0];
    return c.kind === "standard" ? (c.rank === 14 ? 11 : Math.min(c.rank, 10)) : 0;
  };
  const all = { double: true, split: true };

  it("play basic strategy", () => {
    expect(basicStrategy(cards("TS 6H"), up("6D"), all)).toBe("stand");
    expect(basicStrategy(cards("TS 6H"), up("7D"), all)).toBe("hit");
    expect(basicStrategy(cards("TS 2H"), up("3D"), all)).toBe("hit");
    expect(basicStrategy(cards("6S 5H"), up("AD"), all)).toBe("double");
    expect(basicStrategy(cards("6S 5H"), up("AD"), { double: false, split: false })).toBe("hit");
    expect(basicStrategy(cards("8S 8H"), up("TD"), all)).toBe("split");
    expect(basicStrategy(cards("TS KH"), up("6D"), all)).toBe("stand");
    expect(basicStrategy(cards("AS 7H"), up("9D"), all)).toBe("hit");
    expect(basicStrategy(cards("AS 7H"), up("4D"), { double: false, split: false })).toBe("stand");
  });

  it("decide from their own view: the hole card doesn't change what they do", () => {
    const base = dealt(table(["a"], { bots: ["bot"] }), "TS 6S 9H TD 5D 7C", { a: 10, bot: 10 });
    const s = act(base, { type: "STAND", playerId: "a" });
    expect(blackjackBots.pending(s)?.botId).toBe("bot");
    const swapped = { ...s, dealer: { ...s.dealer, cards: [s.dealer.cards[0], cards("AS")[0]] } };
    const rng = () => 0.5;
    expect(blackjackBots.decide(s, "bot", rng)).toEqual(blackjackBots.decide(swapped, "bot", rng));
    expect(observeBlackjack(getBlackjackView(s, "bot"), "bot")!.hand.map((c) => c.id)).toEqual(["6S", "5D"]);
  });

  it("bet within their chips and turn down insurance", () => {
    const s = table(["a"], { bots: ["bot"] });
    const obs = observeBlackjack(getBlackjackView(s, "bot"), "bot")!;
    for (const d of ["easy", "medium", "hard"] as const) {
      const a = getBlackjackBotAction(obs, d, () => 0.99);
      expect(a?.type).toBe("PLACE_BET");
      if (a?.type === "PLACE_BET") expect(a.amount).toBeGreaterThanOrEqual(10);
    }
    const ins = dealt(s, "TS 9S AH 5D 7C", { a: 10, bot: 10 });
    expect(ins.phase).toBe("insurance");
    const iobs = observeBlackjack(getBlackjackView(ins, "bot"), "bot")!;
    expect(getBlackjackBotAction(iobs, "hard")).toEqual({ type: "INSURANCE", playerId: "bot", take: false });
  });
});
