import { describe, expect, it } from "vitest";
import type { BsPokerState } from "@/types/bs-poker";
import type { Card, Rank, Suit } from "@/types/cards";
import { applyAction, createRoom, getLegalActions, getPlayerView } from "@/lib/bs-poker-game";

function must(r: { ok: boolean; state: BsPokerState; error?: string }): BsPokerState {
  if (!r.ok) throw new Error(r.error);
  return r.state;
}

function setup(n = 3, settings = {}) {
  let s = createRoom({ roomId: "test", host: { id: "p1", name: "P1" }, settings });
  for (let i = 2; i <= n; i++) s = must(applyAction(s, { type: "JOIN_ROOM", player: { id: `p${i}`, name: `P${i}` } }));
  return must(applyAction(s, { type: "START_GAME", playerId: "p1", seed: 12345 }));
}

/** Overwrite hands (and the table, empty unless given) for deterministic scenarios. */
function withHands(s: BsPokerState, hands: Record<string, Card[]>, tableCards: Card[] = []): BsPokerState {
  return { ...s, tableCards, players: s.players.map((p) => (hands[p.id] ? { ...p, hand: hands[p.id] } : p)) };
}

const c = (id: string, rank: Rank, suit: Suit): Card => ({ id, kind: "standard", rank, suit });

describe("game loop", () => {
  it("deals starting cards, 5 table cards, and picks a starter", () => {
    const s = setup();
    expect(s.phase).toBe("bidding");
    expect(s.players.every((p) => p.hand.length === 1)).toBe(true);
    expect(s.tableCards).toHaveLength(5);
    const ids = new Set([...s.tableCards, ...s.players.flatMap((p) => p.hand)].map((c) => c.id));
    expect(ids.size).toBe(8);
    expect(s.currentTurnPlayerId).toBe(s.roundStarterId);
  });

  it("burns 3 cards each round and never shows them", () => {
    const s = setup(3);
    expect(s.burnCards).toHaveLength(3);
    const ids = new Set([...s.burnCards, ...s.tableCards, ...s.players.flatMap((p) => p.hand)].map((x) => x.id));
    expect(ids.size).toBe(3 + 5 + 3);
    for (const viewer of ["p1", "god"] as const) {
      const v = getPlayerView(s, viewer);
      expect("burnCards" in v).toBe(false);
      expect(v.burnCount).toBe(3);
    }
  });

  it("counts the table cards in the pool", () => {
    let s = setup(2);
    s = withHands({ ...s, currentTurnPlayerId: "p1" }, { p1: [c("2S", 2, "S")], p2: [c("3S", 3, "S")] }, [
      c("9H", 9, "H"), c("TC", 10, "C"), c("JD", 11, "D"), c("QS", 12, "S"), c("KH", 13, "H"),
    ]);
    s = must(applyAction(s, { type: "PLACE_BID", playerId: "p1", bid: { type: "STRAIGHT", high: 13 } }));
    s = must(applyAction(s, { type: "CALL_BS", playerId: "p2" }));
    expect(s.showdown!.evaluation.exists).toBe(true);
    expect(s.showdown!.loserId).toBe("p2");
    expect(s.showdown!.tableCards.map((x) => x.id)).toEqual(["9H", "TC", "JD", "QS", "KH"]);
  });

  it("deals fresh table cards each round", () => {
    let s = setup(2);
    const first = s.tableCards.map((x) => x.id);
    s = must(applyAction(s, { type: "PLACE_BID", playerId: s.currentTurnPlayerId!, bid: { type: "FOUR_OF_A_KIND", rank: 14 } }));
    s = must(applyAction(s, { type: "CALL_BS", playerId: s.currentTurnPlayerId! }));
    s = must(applyAction(s, { type: "NEXT_ROUND", playerId: "p1" }));
    expect(s.tableCards).toHaveLength(5);
    expect(s.tableCards.map((x) => x.id)).not.toEqual(first);
  });

  it("is deterministic for a seed", () => {
    expect(setup().players.map((p) => p.hand[0].id)).toEqual(setup().players.map((p) => p.hand[0].id));
  });

  it("enforces turn order and rising bids", () => {
    let s = setup();
    const first = s.currentTurnPlayerId!;
    const other = s.players.find((p) => p.id !== first)!.id;
    expect(applyAction(s, { type: "CALL_BS", playerId: first }).ok).toBe(false); // nothing to call
    expect(applyAction(s, { type: "PLACE_BID", playerId: other, bid: { type: "PAIR", rank: 5 } }).ok).toBe(false);
    s = must(applyAction(s, { type: "PLACE_BID", playerId: first, bid: { type: "PAIR", rank: 5 } }));
    const second = s.currentTurnPlayerId!;
    expect(second).not.toBe(first);
    expect(applyAction(s, { type: "PLACE_BID", playerId: second, bid: { type: "PAIR", rank: 5 } }).ok).toBe(false);
    expect(applyAction(s, { type: "PLACE_BID", playerId: second, bid: { type: "HIGH_CARD", rank: 14 } }).ok).toBe(false);
    expect(applyAction(s, { type: "PLACE_BID", playerId: second, bid: { type: "PAIR", rank: 6 } }).ok).toBe(true);
  });

  it("bidder loses when the hand is missing; caller when it exists", () => {
    let s = setup(2);
    s = { ...s, currentTurnPlayerId: "p1" };
    s = withHands(s, { p1: [c("KH", 13, "H")], p2: [c("3S", 3, "S")] });

    const bluff = must(applyAction(s, { type: "PLACE_BID", playerId: "p1", bid: { type: "PAIR", rank: 13 } }));
    const called = must(applyAction(bluff, { type: "CALL_BS", playerId: "p2" }));
    expect(called.phase).toBe("showdown");
    expect(called.showdown!.loserId).toBe("p1");
    expect(called.players.find((p) => p.id === "p1")!.cardCount).toBe(2);

    const honest = must(applyAction(s, { type: "PLACE_BID", playerId: "p1", bid: { type: "HIGH_CARD", rank: 3 } }));
    const wrongCall = must(applyAction(honest, { type: "CALL_BS", playerId: "p2" }));
    expect(wrongCall.showdown!.loserId).toBe("p2");
  });

  it("loser opens the next round with one more card", () => {
    let s = setup(3);
    s = withHands({ ...s, currentTurnPlayerId: "p1" }, {});
    s = must(applyAction(s, { type: "PLACE_BID", playerId: "p1", bid: { type: "FOUR_OF_A_KIND", rank: 14 } }));
    s = must(applyAction(s, { type: "CALL_BS", playerId: "p2" }));
    s = must(applyAction(s, { type: "NEXT_ROUND", playerId: "p3" }));
    expect(s.round).toBe(2);
    expect(s.currentTurnPlayerId).toBe("p1");
    expect(s.players.find((p) => p.id === "p1")!.hand.length).toBe(2);
  });

  it("busts a player who loses at max cards and ends the game", () => {
    let s = setup(2, { maxCards: 2 });
    s = { ...s, currentTurnPlayerId: "p1", players: s.players.map((p) => (p.id === "p1" ? { ...p, cardCount: 2 } : p)) };
    s = must(applyAction(s, { type: "PLACE_BID", playerId: "p1", bid: { type: "FOUR_OF_A_KIND", rank: 14 } }));
    s = must(applyAction(s, { type: "CALL_BS", playerId: "p2" }));
    expect(s.showdown!.loserBusted).toBe(true);
    expect(s.phase).toBe("game_over");
    expect(s.winnerId).toBe("p2");
  });

  it("bans each hand type at its own threshold", () => {
    let s = setup(2, {
      handRules: {
        STRAIGHT: { mode: "enabled", threshold: 3 },
        FLUSH: { mode: "threshold", threshold: 2 },
        STRAIGHT_FLUSH: { mode: "disabled", threshold: 3 },
      },
    });
    expect(s.disabledHandTypes).toEqual(["STRAIGHT_FLUSH"]);
    s = { ...s, currentTurnPlayerId: "p1" };
    expect(applyAction(s, { type: "PLACE_BID", playerId: "p1", bid: { type: "STRAIGHT_FLUSH", high: 9 } }).ok).toBe(false);
    s = must(applyAction(s, { type: "PLACE_BID", playerId: "p1", bid: { type: "FOUR_OF_A_KIND", rank: 14 } }));
    s = must(applyAction(s, { type: "CALL_BS", playerId: "p2" }));
    s = must(applyAction(s, { type: "NEXT_ROUND", playerId: "p1" }));
    expect(s.disabledHandTypes).toEqual(["FLUSH", "STRAIGHT_FLUSH"]);
    const turn = s.currentTurnPlayerId!;
    expect(applyAction(s, { type: "PLACE_BID", playerId: turn, bid: { type: "FLUSH", high: 9 } })).toMatchObject({
      ok: false,
      error: "Flushes are banned this round",
    });
    expect(applyAction(s, { type: "PLACE_BID", playerId: turn, bid: { type: "STRAIGHT", high: 9 } }).ok).toBe(true);
  });

  it("clamps hand-rule thresholds to the max hand size", () => {
    const s = createRoom({
      roomId: "t",
      host: { id: "p1", name: "P1" },
      settings: { maxCards: 4, handRules: { STRAIGHT: { mode: "threshold", threshold: 9 }, FLUSH: { mode: "enabled", threshold: 0 }, STRAIGHT_FLUSH: { mode: "enabled", threshold: 3 } } },
    });
    expect(s.settings.handRules.STRAIGHT.threshold).toBe(4);
    expect(s.settings.handRules.FLUSH.threshold).toBe(1);
  });

  it("hides other hands and the RNG from player views", () => {
    const s = setup(3);
    const v = getPlayerView(s, "p1");
    expect("rngState" in v).toBe(false);
    expect(v.players.find((p) => p.id === "p1")!.hand).not.toBeNull();
    expect(v.players.find((p) => p.id === "p2")!.hand).toBeNull();
    expect(getPlayerView(s, "god").players.every((p) => p.hand !== null)).toBe(true);
    // Table cards are face up for everyone.
    expect(getPlayerView(s, "p2").tableCards).toEqual(s.tableCards);
  });

  it("legal actions", () => {
    const s = setup(2);
    const la = getLegalActions(s, s.currentTurnPlayerId);
    expect(la.isMyTurn).toBe(true);
    expect(la.canCallBS).toBe(false);
    expect(la.legalBids.length).toBeGreaterThan(300);
  });

  it("caps the table by deck size", () => {
    let s = createRoom({ roomId: "t", host: { id: "p1", name: "P1" } });
    for (let i = 2; i <= 8; i++) s = must(applyAction(s, { type: "JOIN_ROOM", player: { id: `p${i}`, name: `P${i}` } }));
    // 52 cards − 5 on the table = 47, so 8 players can hold at most 5 each.
    expect(s.settings.maxCards).toBe(5);
    expect(applyAction(s, { type: "JOIN_ROOM", player: { id: "p9", name: "P9" } }).ok).toBe(false);
  });
});
