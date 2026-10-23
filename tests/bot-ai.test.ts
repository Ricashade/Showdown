import { describe, expect, it } from "vitest";
import type { BsPokerState } from "@/types/bs-poker";
import type { HoldemState } from "@/types/holdem";
import type { BotDifficulty } from "@/types/game";
import { applyAction, createRoom, getPlayerView } from "@/lib/bs-poker-game";
import { applyHoldemAction, createHoldemRoom } from "@/lib/holdem-game";
import { seededRandom } from "@/lib/cards";
import { bsPokerBots, estimateBidProbability, estimateHoldemEquity, holdemBots, observeBsPoker, startingHandScore } from "@/lib/bot-ai";
import { cards } from "@/components/rules/sample-cards";

const DIFFS: BotDifficulty[] = ["easy", "medium", "hard"];

function bsTable(diffs: BotDifficulty[], seed = 5): BsPokerState {
  let s = createRoom({ roomId: "t", host: { id: "b0", name: "B0", isBot: true, botDifficulty: diffs[0] } });
  diffs.slice(1).forEach((d, i) => {
    const r = applyAction(s, { type: "JOIN_ROOM", player: { id: `b${i + 1}`, name: `B${i + 1}`, isBot: true, botDifficulty: d } });
    if (r.ok) s = r.state;
  });
  const r = applyAction(s, { type: "START_GAME", playerId: "b0", seed });
  if (!r.ok) throw new Error(r.error);
  return r.state;
}

function holdemTable(diffs: BotDifficulty[], seed = 5): HoldemState {
  let s = createHoldemRoom({ roomId: "t", host: { id: "b0", name: "B0", isBot: true, botDifficulty: diffs[0] } });
  diffs.slice(1).forEach((d, i) => {
    const r = applyHoldemAction(s, { type: "JOIN_ROOM", player: { id: `b${i + 1}`, name: `B${i + 1}`, isBot: true, botDifficulty: d } });
    if (r.ok) s = r.state;
  });
  const r = applyHoldemAction(s, { type: "START_GAME", playerId: "b0", seed });
  if (!r.ok) throw new Error(r.error);
  return r.state;
}

describe("information isolation", () => {
  it("a BS Poker bot decides the same whatever the others' hidden cards are", () => {
    for (const d of DIFFS) {
      const s = bsTable([d, "medium", "medium"], 11);
      const bot = s.currentTurnPlayerId!;
      // Swap every other player's hidden card for a different unseen one.
      const seen = new Set([...s.tableCards, ...s.players.find((p) => p.id === bot)!.hand].map((c) => c.id));
      const others = s.players.filter((p) => p.id !== bot);
      const spare = cards("2S 3H 4D 5C 6S 7H 8D 9C TS JH QD KC AS 2H 3D").filter((c) => !seen.has(c.id) && !others.some((o) => o.hand.some((h) => h.id === c.id)));
      const swapped: BsPokerState = {
        ...s,
        players: s.players.map((p, i) => (p.id === bot ? p : { ...p, hand: [spare[i]] })),
      };
      const a = bsPokerBots.decide(s, bot, seededRandom(7));
      const b = bsPokerBots.decide(swapped, bot, seededRandom(7));
      expect(b).toEqual(a);
    }
  });

  it("a Hold'em bot decides the same whatever the others' hole cards and the unturned board are", () => {
    for (const d of DIFFS) {
      const s = holdemTable([d, "medium", "medium"], 3);
      const bot = s.currentTurnId!;
      const swapped = structuredClone(s);
      // Rotate everyone else's hole cards and replace the hidden board.
      const others = swapped.players.filter((p) => p.id !== bot);
      const hands = others.map((p) => p.hand);
      others.forEach((p, i) => (p.hand = hands[(i + 1) % hands.length]));
      swapped.boardCards = [...swapped.boardCards].reverse();
      const a = holdemBots.decide(s, bot, seededRandom(9));
      const b = holdemBots.decide(swapped, bot, seededRandom(9));
      expect(b).toEqual(a);
    }
  });
});

describe("BS Poker estimates", () => {
  it("knows what it holds, and doubts what nobody could have", () => {
    const s = bsTable(["medium", "medium", "medium"], 2);
    const bot = s.currentTurnPlayerId!;
    const obs = observeBsPoker(getPlayerView(s, bot), bot)!;
    const mine = obs.myHand[0];
    if (mine.kind !== "standard") throw new Error("expected a standard card");
    const rng = seededRandom(1);
    expect(estimateBidProbability({ type: "HIGH_CARD", rank: mine.rank }, obs, { rollouts: 200, rng })).toBe(1);
    expect(estimateBidProbability({ type: "STRAIGHT_FLUSH", high: 14 }, obs, { rollouts: 200, rng })).toBeLessThan(0.05);
  });

  it("hard bots read earlier bids as information", () => {
    const s = bsTable(["hard", "hard", "hard"], 4);
    const bot = s.currentTurnPlayerId!;
    const obs = observeBsPoker(getPlayerView(s, bot), bot)!;
    const other = obs.totalCardsPerPlayer.find((p) => p.id !== bot)!.id;
    const seenRanks = new Set([...obs.myHand, ...obs.tableCards].flatMap((c) => (c.kind === "standard" ? [c.rank] : [])));
    const rank = ([14, 13, 12, 11, 10, 9, 8, 7] as const).find((r) => !seenRanks.has(r))!;
    const bid = { type: "HIGH_CARD" as const, rank };
    const plain = estimateBidProbability(bid, obs, { rollouts: 400, rng: seededRandom(3) });
    const inferred = estimateBidProbability(bid, obs, { rollouts: 400, rng: seededRandom(3), inferences: [{ playerId: other, rank, likelihood: 0.65 }] });
    expect(inferred).toBeGreaterThan(plain + 0.2);
  });

  it("medium and hard bots call BS on an impossible-looking bid", () => {
    for (const d of ["medium", "hard"] as const) {
      let s = bsTable([d, d, d], 6);
      const first = s.currentTurnPlayerId!;
      const r = applyAction(s, { type: "PLACE_BID", playerId: first, bid: { type: "STRAIGHT_FLUSH", high: 13 } });
      if (!r.ok) throw new Error(r.error);
      s = r.state;
      expect(bsPokerBots.decide(s, s.currentTurnPlayerId!, seededRandom(2))).toEqual({ type: "CALL_BS", playerId: s.currentTurnPlayerId });
    }
  });
});

describe("Hold'em estimates", () => {
  it("scores starting hands like the Chen formula", () => {
    expect(startingHandScore(cards("AS AH"))).toBe(20);
    expect(startingHandScore(cards("KS KH"))).toBe(16);
    expect(startingHandScore(cards("AS KS"))).toBe(12);
    expect(startingHandScore(cards("7S 2H"))).toBe(-1);
  });

  it("estimates equity close to known values", () => {
    const aces = estimateHoldemEquity(cards("AS AH"), [], 1, 3000, seededRandom(1));
    const junk = estimateHoldemEquity(cards("7S 2H"), [], 1, 3000, seededRandom(1));
    expect(aces).toBeGreaterThan(0.81);
    expect(aces).toBeLessThan(0.89);
    expect(junk).toBeGreaterThan(0.28);
    expect(junk).toBeLessThan(0.4);
    // The nuts on the river can't lose.
    expect(estimateHoldemEquity(cards("AS KS"), cards("QS JS TS 2H 3D"), 3, 200, seededRandom(1))).toBe(1);
  });
});

describe("all-bot games", () => {
  it("BS Poker bots only make legal moves and finish the game", () => {
    let s = bsTable(["easy", "medium", "hard", "medium"], 21);
    const rng = seededRandom(99);
    for (let step = 0; step < 2000 && s.phase !== "game_over"; step++) {
      if (s.phase === "showdown") {
        const r = applyAction(s, { type: "NEXT_ROUND", playerId: s.hostId });
        if (!r.ok) throw new Error(r.error);
        s = r.state;
        continue;
      }
      const pending = bsPokerBots.pending(s)!;
      const action = bsPokerBots.decide(s, pending.botId, rng)!;
      const r = applyAction(s, action);
      if (!r.ok) throw new Error(`${pending.botId}: ${JSON.stringify(action)} → ${r.error}`);
      s = r.state;
    }
    expect(s.phase).toBe("game_over");
  });

  it("Hold'em bots only make legal moves and never create or lose chips", () => {
    let s = holdemTable(["easy", "medium", "hard", "hard"], 8);
    const rng = seededRandom(5);
    const total = s.players.reduce((n, p) => n + p.chips + p.totalBet, 0);
    let hands = 0;
    for (let step = 0; step < 4000 && s.phase !== "game_over" && hands < 40; step++) {
      if (s.phase === "hand_over") {
        expect(s.players.reduce((n, p) => n + p.chips, 0)).toBe(total);
        const r = applyHoldemAction(s, { type: "NEXT_HAND", playerId: s.hostId });
        if (!r.ok) throw new Error(r.error);
        s = r.state;
        hands++;
        continue;
      }
      const pending = holdemBots.pending(s)!;
      const action = holdemBots.decide(s, pending.botId, rng)!;
      const r = applyHoldemAction(s, action);
      if (!r.ok) throw new Error(`${pending.botId}: ${JSON.stringify(action)} → ${r.error}`);
      s = r.state;
    }
    expect(hands).toBeGreaterThan(5);
  });
});
