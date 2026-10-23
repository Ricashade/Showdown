/**
 * BS Poker bots. Everything here works from a `BsObservation`: only what that bot can see.
 */
import type { Card, Rank } from "@/types/cards";
import type { Bid, BidEntry, BsPokerAction, BsPokerSettings, HandType } from "@/types/bs-poker";
import type { BotDifficulty } from "@/types/game";
import { bidsEqual, compareBids, doesHandExistInPool, HAND_TYPE_ORDER, isWildCard } from "@/lib/bs-poker-engine";
import { createDeck } from "@/lib/cards";
import { getLegalActions, type BsPokerView } from "@/lib/bs-poker-game";

/** Everything a BS Poker bot is allowed to know. No other player's hidden cards. */
export interface BsObservation {
  myId: string;
  myHand: Card[];
  /** Face-up cards everyone can see. */
  tableCards: Card[];
  /** Active players in seat order with how many cards each holds. */
  totalCardsPerPlayer: { id: string; cardCount: number }[];
  bidHistoryThisRound: BidEntry[];
  currentBid: BidEntry | null;
  lobbySettings: BsPokerSettings;
  disabledHandTypes: HandType[];
  legalBids: Bid[];
  canCallBS: boolean;
  /** Who acts after this bot. */
  nextPlayerId: string | null;
}

/** Build the observation from the bot's own redacted view. */
export function observeBsPoker(view: BsPokerView, botId: string): BsObservation | null {
  const me = view.players.find((p) => p.id === botId);
  const legal = getLegalActions(view, botId);
  if (!me?.hand || !legal.isMyTurn) return null;
  const active = view.players.filter((p) => p.status === "active");
  const i = active.findIndex((p) => p.id === botId);
  return {
    myId: botId,
    myHand: me.hand,
    tableCards: view.tableCards,
    totalCardsPerPlayer: active.map((p) => ({ id: p.id, cardCount: p.cardCount })),
    bidHistoryThisRound: view.bidHistory,
    currentBid: view.currentBid,
    lobbySettings: view.settings,
    disabledHandTypes: view.disabledHandTypes,
    legalBids: legal.legalBids,
    canCallBS: legal.canCallBS,
    nextPlayerId: active.length > 1 ? active[(i + 1) % active.length].id : null,
  };
}

// ---------------------------------------------------------------------------
// Monte Carlo
// ---------------------------------------------------------------------------

/** The rank a bid is "about" — what a bidder most likely holds. */
export function bidKeyRank(bid: Bid): Rank {
  switch (bid.type) {
    case "TWO_PAIR":
    case "STRAIGHT":
    case "FLUSH":
    case "STRAIGHT_FLUSH":
      return bid.high;
    case "FULL_HOUSE":
      return bid.trips;
    default:
      return bid.rank;
  }
}

export interface Inference {
  playerId: string;
  /** This player probably holds at least one card of this rank… */
  rank: Rank;
  /** …with this probability. */
  likelihood: number;
}

export interface RolloutOptions {
  rollouts: number;
  rng: () => number;
  /** Hard bots read earlier bids: bidders probably hold a card of what they bid. */
  inferences?: Inference[];
}

/**
 * Sample the hidden cards `rollouts` times (each opponent dealt their real hand size from
 * the cards this bot can't see) and return the full pools: known cards + one sample.
 */
export function samplePools(obs: BsObservation, { rollouts, rng, inferences = [] }: RolloutOptions): Card[][] {
  const known = [...obs.myHand, ...obs.tableCards];
  const knownIds = new Set(known.map((c) => c.id));
  const unseen = createDeck(obs.lobbySettings.includeJokers).filter((c) => !knownIds.has(c.id));
  const opponents = obs.totalCardsPerPlayer.filter((p) => p.id !== obs.myId);
  const pools: Card[][] = [];

  for (let n = 0; n < rollouts; n++) {
    const deck = unseen.slice();
    let left = deck.length;
    const draw = (index: number) => {
      const card = deck[index];
      deck[index] = deck[--left];
      return card;
    };
    const pool = known.slice();
    for (const opp of opponents) {
      let need = opp.cardCount;
      const hint = inferences.find((h) => h.playerId === opp.id);
      if (hint && need > 0 && rng() < hint.likelihood) {
        // Give this bidder a card of the rank they bid, if one is still out there.
        const matches: number[] = [];
        for (let k = 0; k < left; k++) {
          const c = deck[k];
          if (c.kind === "standard" && c.rank === hint.rank) matches.push(k);
        }
        if (matches.length) {
          pool.push(draw(matches[Math.floor(rng() * matches.length)]));
          need--;
        }
      }
      for (let k = 0; k < need && left > 0; k++) pool.push(draw(Math.floor(rng() * left)));
    }
    pools.push(pool);
  }
  return pools;
}

/** Share of sampled tables where the bid's hand exists. */
export function probabilityIn(bid: Bid, pools: Card[][], obs: BsObservation): number {
  if (pools.length === 0) return 0;
  const ctx = { disabledHandTypes: obs.disabledHandTypes };
  let hits = 0;
  for (const pool of pools) if (doesHandExistInPool(bid, pool, obs.lobbySettings, ctx)) hits++;
  return hits / pools.length;
}

/**
 * Chance the bid exists, given this bot's hand, the table, and `totalUnseenCards` dealt at
 * random to the others (optionally assuming earlier bidders hold what they bid).
 */
export function estimateBidProbability(
  bid: Bid,
  obs: BsObservation,
  opts: RolloutOptions,
): number {
  return probabilityIn(bid, samplePools(obs, opts), obs);
}

// ---------------------------------------------------------------------------
// Decisions
// ---------------------------------------------------------------------------

const pick = <T>(list: readonly T[], rng: () => number) => list[Math.floor(rng() * list.length)];

/** Ranks this bot can see: its own hand and the table (wilds don't count as a rank). */
function seenRanks(obs: BsObservation): Set<number> {
  const ranks = new Set<number>();
  for (const c of [...obs.myHand, ...obs.tableCards]) {
    if (c.kind === "standard" && !isWildCard(c, obs.lobbySettings)) ranks.add(c.rank);
  }
  return ranks;
}

/** The next few legal bids, plus ones built on ranks this bot can see. */
function candidateBids(obs: BsObservation, max: number): Bid[] {
  const ranks = seenRanks(obs);
  const out: Bid[] = obs.legalBids.slice(0, 4);
  for (const b of obs.legalBids.slice(0, 60)) {
    if (out.length >= max) break;
    if (ranks.has(bidKeyRank(b)) && !out.some((o) => bidsEqual(o, b))) out.push(b);
  }
  return out.slice(0, max).sort(compareBids);
}

const callBS = (obs: BsObservation): BsPokerAction => ({ type: "CALL_BS", playerId: obs.myId });
const placeBid = (obs: BsObservation, bid: Bid): BsPokerAction => ({ type: "PLACE_BID", playerId: obs.myId, bid });

/** Cards a hand needs (how "big" a claim it is). */
const CARDS_NEEDED: Record<HandType, number> = {
  HIGH_CARD: 1, PAIR: 2, TWO_PAIR: 4, THREE_OF_A_KIND: 3, STRAIGHT: 5, FLUSH: 5, FULL_HOUSE: 5, FOUR_OF_A_KIND: 4, STRAIGHT_FLUSH: 5,
};

function easyBot(obs: BsObservation, rng: () => number): BsPokerAction {
  if (obs.legalBids.length === 0) return callBS(obs);
  const inPlay = obs.tableCards.length + obs.totalCardsPerPlayer.reduce((n, p) => n + p.cardCount, 0);
  if (obs.currentBid && obs.canCallBS) {
    // Gut feel: the bigger the hand relative to the cards out, the more suspicious.
    const bid = obs.currentBid.bid;
    const category = HAND_TYPE_ORDER.indexOf(bid.type);
    const comfortable = Math.min(8, Math.floor(inPlay / 2)) + Math.floor(rng() * 3) - 1;
    const holdsIt = seenRanks(obs).has(bidKeyRank(bid));
    if (category > comfortable || (CARDS_NEEDED[bid.type] >= 3 && !holdsIt && rng() < 0.3)) return callBS(obs);
  }
  if (rng() < 0.25) return placeBid(obs, pick(obs.legalBids.slice(0, 25), rng)); // Random bluff.
  const ranks = seenRanks(obs);
  const anchored = obs.legalBids.slice(0, 15).filter((b) => ranks.has(bidKeyRank(b)));
  return placeBid(obs, anchored.length ? pick(anchored.slice(0, 2), rng) : obs.legalBids[Math.min(1, obs.legalBids.length - 1)]);
}

interface Thresholds {
  rollouts: number;
  callBelow: number;
  /** Opening/raising: prefer the biggest candidate at least this likely. */
  confident: number;
}

function simulatingBot(obs: BsObservation, rng: () => number, t: Thresholds, hard: boolean): BsPokerAction {
  const inferences: Inference[] = hard
    ? obs.bidHistoryThisRound.filter((e) => e.playerId !== obs.myId).map((e) => ({ playerId: e.playerId, rank: bidKeyRank(e.bid), likelihood: 0.65 }))
    : [];
  const pools = samplePools(obs, { rollouts: t.rollouts, rng, inferences });
  const candidates = candidateBids(obs, 8);
  const scored = candidates.map((bid) => ({ bid, p: probabilityIn(bid, pools, obs) }));

  if (obs.currentBid && obs.canCallBS) {
    const pCurrent = probabilityIn(obs.currentBid.bid, pools, obs);
    let callBelow = t.callBelow;
    if (hard) {
      // A bidder about to go out bluffs out of desperation; trust them less.
      const bidder = obs.totalCardsPerPlayer.find((p) => p.id === obs.currentBid!.playerId);
      if (bidder && bidder.cardCount >= obs.lobbySettings.maxCards - 1) callBelow += 0.05;
    }
    if (pCurrent < callBelow) return callBS(obs);
    const best = Math.max(0, ...scored.map((s) => s.p));
    // A hard bot would rather call a shaky bid than raise into something worse.
    if (hard && best < 0.3 && pCurrent < 0.45) return callBS(obs);
    if (!scored.length) return callBS(obs);
  }
  if (!scored.length) return callBS(obs);

  if (hard && rng() < 0.2) {
    // Pressure play: if the next player has few cards (little to go on), jump to a bid that
    // echoes what the table already claimed, as long as it's believable.
    const next = obs.totalCardsPerPlayer.find((p) => p.id === obs.nextPlayerId);
    const tableTypes = new Set(obs.bidHistoryThisRound.map((e) => e.bid.type));
    if (next && next.cardCount <= 2) {
      const jumps = obs.legalBids.slice(2, 16).filter((b) => tableTypes.has(b.type));
      const believable = jumps.map((bid) => ({ bid, p: probabilityIn(bid, pools, obs) })).filter((s) => s.p >= 0.35);
      if (believable.length) return placeBid(obs, pick(believable, rng).bid);
    }
  }

  // The biggest bid we're confident in; otherwise the likeliest one.
  const confident = scored.filter((s) => s.p >= t.confident);
  const choice = confident.length
    ? confident[confident.length - 1]
    : scored.reduce((a, b) => (b.p > a.p ? b : a));
  return placeBid(obs, choice.bid);
}

export function getBSPokerBotAction(obs: BsObservation, difficulty: BotDifficulty, rng: () => number = Math.random): BsPokerAction {
  switch (difficulty) {
    case "easy":
      return easyBot(obs, rng);
    case "medium":
      return simulatingBot(obs, rng, { rollouts: 100, callBelow: 0.22, confident: 0.7 }, false);
    case "hard":
      return simulatingBot(obs, rng, { rollouts: 350, callBelow: 0.28, confident: 0.75 }, true);
  }
}
