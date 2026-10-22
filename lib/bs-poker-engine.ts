/**
 * BS Poker engine — pure, dependency-free logic for bids and pool evaluation.
 *
 * Bid semantics ("does this hand exist in the combined pool?"):
 * - HIGH_CARD r        → at least one r
 * - PAIR / TRIPS / QUADS r → at least 2 / 3 / 4 cards of rank r
 * - TWO_PAIR h,l       → 2× h and 2× l   (h > l)
 * - FULL_HOUSE t,p     → 3× t and 2× p   (t ≠ p)
 * - STRAIGHT h         → one card of each rank h-4..h (h=5 means A-2-3-4-5)
 * - FLUSH h            → five cards of ONE suit whose top card is exactly h
 * - STRAIGHT_FLUSH h   → ranks h-4..h all in ONE suit (h=14 is a Royal Flush)
 *
 * Only the cards a hand requires need to exist; the pool can be any size.
 * Wild cards (Jokers, and 2s when deuces are wild) can stand in for any card.
 * When deuces are wild a natural 2 is ONLY counted as a wild — since a wild can
 * always be a 2, this never makes a hand harder to find.
 */
import type { Card, Rank, StandardCard, Suit } from "@/types/cards";
import type {
  Bid,
  BidEvaluation,
  BsPokerSettings,
  HandType,
  RestrictableHand,
  WildAssignment,
} from "@/types/bs-poker";
import { RANKS, SUITS, rankName, rankPlural, rankShort, suitName, suitSymbol } from "./cards";

// ---------------------------------------------------------------------------
// Hand type metadata
// ---------------------------------------------------------------------------

export const HAND_TYPE_ORDER: readonly HandType[] = [
  "HIGH_CARD",
  "PAIR",
  "TWO_PAIR",
  "THREE_OF_A_KIND",
  "STRAIGHT",
  "FLUSH",
  "FULL_HOUSE",
  "FOUR_OF_A_KIND",
  "STRAIGHT_FLUSH",
];

export const HAND_TYPE_LABEL: Record<HandType, string> = {
  HIGH_CARD: "High card",
  PAIR: "One pair",
  TWO_PAIR: "Two pair",
  THREE_OF_A_KIND: "Three of a kind",
  STRAIGHT: "Straight",
  FLUSH: "Flush",
  FULL_HOUSE: "Full house",
  FOUR_OF_A_KIND: "Four of a kind",
  STRAIGHT_FLUSH: "Straight flush",
};

/** Plural names, for "Straights are banned this round". */
export const HAND_TYPE_PLURAL: Record<HandType, string> = {
  HIGH_CARD: "High cards",
  PAIR: "Pairs",
  TWO_PAIR: "Two pairs",
  THREE_OF_A_KIND: "Three of a kinds",
  STRAIGHT: "Straights",
  FLUSH: "Flushes",
  FULL_HOUSE: "Full houses",
  FOUR_OF_A_KIND: "Four of a kinds",
  STRAIGHT_FLUSH: "Straight flushes",
};

/** The hands a host can switch off, each with its own rule. */
export const RESTRICTABLE_HANDS: readonly RestrictableHand[] = ["STRAIGHT", "FLUSH", "STRAIGHT_FLUSH"];

/** Valid `high` values for 5-card sequence/suit hands. */
export const STRAIGHT_HIGHS: readonly Rank[] = [5, 6, 7, 8, 9, 10, 11, 12, 13, 14];
export const FLUSH_HIGHS: readonly Rank[] = [6, 7, 8, 9, 10, 11, 12, 13, 14];

export const DEFAULT_SETTINGS: BsPokerSettings = {
  deucesWild: false,
  includeJokers: false,
  handRules: {
    STRAIGHT: { mode: "enabled", threshold: 3 },
    FLUSH: { mode: "enabled", threshold: 3 },
    STRAIGHT_FLUSH: { mode: "enabled", threshold: 3 },
  },
  startingCards: 1,
  maxCards: 6,
};

// ---------------------------------------------------------------------------
// Bid shape validation, ordering & comparison
// ---------------------------------------------------------------------------

const isRank = (n: unknown): n is Rank => typeof n === "number" && Number.isInteger(n) && n >= 2 && n <= 14;

/** Returns an error message, or null if the bid is well-formed. */
export function validateBidShape(bid: Bid): string | null {
  switch (bid.type) {
    case "HIGH_CARD":
    case "PAIR":
    case "THREE_OF_A_KIND":
    case "FOUR_OF_A_KIND":
      return isRank(bid.rank) ? null : "Invalid rank";
    case "TWO_PAIR":
      if (!isRank(bid.high) || !isRank(bid.low)) return "Invalid rank";
      return bid.high > bid.low ? null : "High pair must outrank low pair";
    case "FULL_HOUSE":
      if (!isRank(bid.trips) || !isRank(bid.pair)) return "Invalid rank";
      return bid.trips !== bid.pair ? null : "Trips and pair must be different ranks";
    case "STRAIGHT":
    case "STRAIGHT_FLUSH":
      return STRAIGHT_HIGHS.includes(bid.high) ? null : "Straights run from 5-high to Ace-high";
    case "FLUSH":
      return FLUSH_HIGHS.includes(bid.high) ? null : "Flushes run from 6-high to Ace-high";
    default:
      return "Unknown hand type";
  }
}

/** Lexicographic strength key: [category, ...tiebreakers]. */
export function bidKey(bid: Bid): number[] {
  const cat = HAND_TYPE_ORDER.indexOf(bid.type);
  switch (bid.type) {
    case "HIGH_CARD":
    case "PAIR":
    case "THREE_OF_A_KIND":
    case "FOUR_OF_A_KIND":
      return [cat, bid.rank];
    case "TWO_PAIR":
      return [cat, bid.high, bid.low];
    case "FULL_HOUSE":
      return [cat, bid.trips, bid.pair];
    case "STRAIGHT":
    case "FLUSH":
    case "STRAIGHT_FLUSH":
      return [cat, bid.high];
  }
}

/** <0 if a is lower, 0 if equal, >0 if a is higher. */
export function compareBids(a: Bid, b: Bid): number {
  const ka = bidKey(a);
  const kb = bidKey(b);
  for (let i = 0; i < Math.max(ka.length, kb.length); i++) {
    const d = (ka[i] ?? 0) - (kb[i] ?? 0);
    if (d !== 0) return d;
  }
  return 0;
}

/**
 * Is `newBid` a legal raise over `currentBid`? Bids of a hand type that is banned this
 * round are never legal, so the ladder simply skips them.
 */
export function isBidHigher(newBid: Bid, currentBid: Bid | null, disabledHandTypes: readonly HandType[] = []): boolean {
  if (validateBidShape(newBid) || disabledHandTypes.includes(newBid.type)) return false;
  return currentBid === null || compareBids(newBid, currentBid) > 0;
}

export const bidsEqual = (a: Bid, b: Bid) => compareBids(a, b) === 0;

// ---------------------------------------------------------------------------
// Hand rules (straights, flushes, straight flushes)
// ---------------------------------------------------------------------------

/** Hand types that are banned this round, given the settings and active players' hand sizes. */
export function getDisabledHandTypes(settings: Pick<BsPokerSettings, "handRules">, activeCardCounts: readonly number[]): HandType[] {
  return RESTRICTABLE_HANDS.filter((type) => {
    const rule = settings.handRules[type];
    if (rule.mode === "disabled") return true;
    if (rule.mode === "threshold") return activeCardCounts.some((n) => n >= rule.threshold);
    return false;
  });
}

export const isHandTypeAllowed = (type: HandType, disabledHandTypes: readonly HandType[]) => !disabledHandTypes.includes(type);

// ---------------------------------------------------------------------------
// Bid enumeration (the whole ladder is only ~315 bids)
// ---------------------------------------------------------------------------

function buildLadder(): Bid[] {
  const bids: Bid[] = [];
  for (const rank of RANKS) bids.push({ type: "HIGH_CARD", rank });
  for (const rank of RANKS) bids.push({ type: "PAIR", rank });
  for (const high of RANKS) for (const low of RANKS) if (low < high) bids.push({ type: "TWO_PAIR", high, low });
  for (const rank of RANKS) bids.push({ type: "THREE_OF_A_KIND", rank });
  for (const high of STRAIGHT_HIGHS) bids.push({ type: "STRAIGHT", high });
  for (const high of FLUSH_HIGHS) bids.push({ type: "FLUSH", high });
  for (const trips of RANKS) for (const pair of RANKS) if (trips !== pair) bids.push({ type: "FULL_HOUSE", trips, pair });
  for (const rank of RANKS) bids.push({ type: "FOUR_OF_A_KIND", rank });
  for (const high of STRAIGHT_HIGHS) bids.push({ type: "STRAIGHT_FLUSH", high });
  return bids.sort(compareBids);
}

const LADDER: readonly Bid[] = buildLadder();

/** Every bid that may be made on top of `currentBid`, ascending. */
export function getLegalBids(currentBid: Bid | null, disabledHandTypes: readonly HandType[] = []): Bid[] {
  return LADDER.filter((b) => isBidHigher(b, currentBid, disabledHandTypes));
}

export function getMinimumBid(currentBid: Bid | null, disabledHandTypes: readonly HandType[] = []): Bid | null {
  return getLegalBids(currentBid, disabledHandTypes)[0] ?? null;
}

// ---------------------------------------------------------------------------
// Labels
// ---------------------------------------------------------------------------

export function bidLabel(bid: Bid): string {
  switch (bid.type) {
    case "HIGH_CARD":
      return `${bid.rank === 14 || bid.rank === 8 ? "An" : "A"} ${rankName(bid.rank)}`;
    case "PAIR":
      return `Pair of ${rankPlural(bid.rank)}`;
    case "TWO_PAIR":
      return `Two pair, ${rankPlural(bid.high)} and ${rankPlural(bid.low)}`;
    case "THREE_OF_A_KIND":
      return `Three ${rankPlural(bid.rank)}`;
    case "STRAIGHT":
      return `${rankName(bid.high)}-high straight`;
    case "FLUSH":
      return `${rankName(bid.high)}-high flush`;
    case "FULL_HOUSE":
      return `${rankPlural(bid.trips)} full of ${rankPlural(bid.pair)}`;
    case "FOUR_OF_A_KIND":
      return `Four ${rankPlural(bid.rank)}`;
    case "STRAIGHT_FLUSH":
      return bid.high === 14 ? "Royal flush" : `${rankName(bid.high)}-high straight flush`;
  }
}

/** The bid as it reads mid-sentence: "Bid a Two", "bid pair of Tens", "bid three Kings". */
export function bidPhrase(bid: Bid): string {
  const label = bidLabel(bid);
  return /^(A |An |Pair |Two pair|Three |Four |Royal )/.test(label) ? label.charAt(0).toLowerCase() + label.slice(1) : label;
}

/** Ranks a straight with this top card needs (5-high is the wheel A-2-3-4-5). */
export function straightRanks(high: Rank): Rank[] {
  if (high === 5) return [14, 2, 3, 4, 5];
  return [0, 1, 2, 3, 4].map((i) => (high - 4 + i) as Rank);
}

// ---------------------------------------------------------------------------
// Pool evaluation
// ---------------------------------------------------------------------------

export function isWildCard(card: Card, settings: Pick<BsPokerSettings, "deucesWild">): boolean {
  return card.kind === "joker" || (settings.deucesWild && card.rank === 2);
}

interface PoolIndex {
  wilds: Card[];
  byRank: Map<Rank, StandardCard[]>;
  bySuit: Map<Suit, Map<Rank, StandardCard>>;
}

function indexPool(pool: readonly Card[], settings: Pick<BsPokerSettings, "deucesWild">): PoolIndex {
  const idx: PoolIndex = { wilds: [], byRank: new Map(), bySuit: new Map() };
  for (const s of SUITS) idx.bySuit.set(s, new Map());
  for (const card of pool) {
    if (card.kind === "joker" || isWildCard(card, settings)) {
      idx.wilds.push(card);
      continue;
    }
    const list = idx.byRank.get(card.rank) ?? [];
    list.push(card);
    idx.byRank.set(card.rank, list);
    idx.bySuit.get(card.suit)!.set(card.rank, card);
  }
  return idx;
}

/** A "slot" is one card the hand needs; filled by a natural card, or else needs a wild. */
interface Slot {
  rank: Rank;
  suit?: Suit;
  natural: StandardCard | null;
}

/** Turn slots into an evaluation by handing out wilds to empty slots. */
function resolveSlots(slots: Slot[], idx: PoolIndex): Omit<BidEvaluation, "summary"> {
  const cardIds: string[] = [];
  const wildAssignments: WildAssignment[] = [];
  let wildCursor = 0;
  let wildsNeeded = 0;
  for (const slot of slots) {
    if (slot.natural) {
      cardIds.push(slot.natural.id);
      continue;
    }
    wildsNeeded++;
    const wild = idx.wilds[wildCursor];
    if (wild) {
      wildCursor++;
      cardIds.push(wild.id);
      wildAssignments.push({ cardId: wild.id, rank: slot.rank, ...(slot.suit ? { suit: slot.suit } : {}) });
    }
  }
  return {
    exists: wildsNeeded <= idx.wilds.length,
    cardIds,
    wildAssignments,
    wildsNeeded,
    wildsAvailable: idx.wilds.length,
  };
}

/** Slots for "n cards of rank r" groups (pairs, trips, two pair, full house…). */
function rankGroupSlots(idx: PoolIndex, groups: { rank: Rank; count: number }[]): Slot[] {
  const slots: Slot[] = [];
  for (const { rank, count } of groups) {
    const naturals = idx.byRank.get(rank) ?? [];
    for (let i = 0; i < count; i++) slots.push({ rank, natural: naturals[i] ?? null });
  }
  return slots;
}

function straightSlots(idx: PoolIndex, high: Rank): Slot[] {
  return straightRanks(high).map((rank) => ({ rank, natural: idx.byRank.get(rank)?.[0] ?? null }));
}

function straightFlushSlots(idx: PoolIndex, high: Rank, suit: Suit): Slot[] {
  const inSuit = idx.bySuit.get(suit)!;
  return straightRanks(high).map((rank) => ({ rank, suit, natural: inSuit.get(rank) ?? null }));
}

/** Exactly-`high`-topped flush in one suit: the top card plus the 4 best lower cards of that suit. */
function flushSlots(idx: PoolIndex, high: Rank, suit: Suit): Slot[] {
  const inSuit = idx.bySuit.get(suit)!;
  const slots: Slot[] = [{ rank: high, suit, natural: inSuit.get(high) ?? null }];
  const lowerRanks = RANKS.filter((r) => r < high).slice().reverse();
  const naturalLower = lowerRanks.filter((r) => inSuit.has(r)).slice(0, 4);
  for (const r of naturalLower) slots.push({ rank: r, suit, natural: inSuit.get(r)! });
  // Wilds fill the highest lower ranks not already covered (always enough room since high >= 6).
  for (const r of lowerRanks) {
    if (slots.length >= 5) break;
    if (!naturalLower.includes(r)) slots.push({ rank: r, suit, natural: null });
  }
  return slots;
}

/** Pick the suit needing the fewest wilds. */
function bestSuit(make: (suit: Suit) => Slot[], idx: PoolIndex): { suit: Suit; slots: Slot[] } {
  let best: { suit: Suit; slots: Slot[]; missing: number } | null = null;
  for (const suit of SUITS) {
    const slots = make(suit);
    const missing = slots.filter((s) => !s.natural).length;
    if (!best || missing < best.missing) best = { suit, slots, missing };
  }
  return best!;
}

const plural = (n: number, word: string) => `${n === 0 ? "no" : n} ${word}${n === 1 ? "" : "s"}`;

/** "no Tens", "1 Ten", "2 Tens" */
function countOf(n: number, rank: Rank): string {
  return n === 0 ? `no ${rankPlural(rank)}` : n === 1 ? `1 ${rankName(rank)}` : `${n} ${rankPlural(rank)}`;
}

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** "7 and 8", "7, 8 and 9" */
function listJoin(items: string[]): string {
  return items.length <= 1 ? items.join("") : `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

function wildNote(result: Omit<BidEvaluation, "summary">): string {
  const used = Math.min(result.wildsNeeded, result.wildsAvailable);
  return used > 0 ? ` (using ${plural(used, "wild")})` : "";
}

export interface EvaluationContext {
  /** Hand types banned this round: a bid of one can never exist (it was illegal to make). */
  disabledHandTypes?: readonly HandType[];
}

/**
 * Full evaluation of a bid against the combined pool — whether it exists, which cards
 * make it (or the closest attempt), how wilds were assigned, and a human-readable summary.
 */
export function evaluateBid(
  bid: Bid,
  pool: readonly Card[],
  settings: Pick<BsPokerSettings, "deucesWild">,
  ctx: EvaluationContext = {},
): BidEvaluation {
  const idx = indexPool(pool, settings);
  const label = bidLabel(bid);
  const W = idx.wilds.length;

  const shapeError = validateBidShape(bid);
  if (shapeError) {
    return { exists: false, cardIds: [], wildAssignments: [], wildsNeeded: 0, wildsAvailable: W, summary: shapeError };
  }
  if (ctx.disabledHandTypes?.includes(bid.type)) {
    return {
      exists: false, cardIds: [], wildAssignments: [], wildsNeeded: 0, wildsAvailable: W,
      summary: `${HAND_TYPE_PLURAL[bid.type]} are banned this round.`,
    };
  }

  const ok = (r: Omit<BidEvaluation, "summary">): BidEvaluation => ({ ...r, summary: `${label} is on the table${wildNote(r)}.` });

  switch (bid.type) {
    case "HIGH_CARD":
    case "PAIR":
    case "TWO_PAIR":
    case "THREE_OF_A_KIND":
    case "FULL_HOUSE":
    case "FOUR_OF_A_KIND": {
      const groups =
        bid.type === "TWO_PAIR" ? [{ rank: bid.high, count: 2 }, { rank: bid.low, count: 2 }]
        : bid.type === "FULL_HOUSE" ? [{ rank: bid.trips, count: 3 }, { rank: bid.pair, count: 2 }]
        : [{ rank: bid.rank, count: { HIGH_CARD: 1, PAIR: 2, THREE_OF_A_KIND: 3, FOUR_OF_A_KIND: 4 }[bid.type] }];
      const r = resolveSlots(rankGroupSlots(idx, groups), idx);
      if (r.exists) return ok(r);
      const found = groups.map((g) => countOf(idx.byRank.get(g.rank)?.length ?? 0, g.rank));
      const allZero = groups.every((g) => !idx.byRank.get(g.rank)?.length) && W === 0;
      return { ...r, summary: `${allZero ? "" : "Only "}${listJoin([...found, plural(W, "wild")])} on the table.`.replace(/^n/, "N") };
    }

    case "STRAIGHT": {
      const r = resolveSlots(straightSlots(idx, bid.high), idx);
      if (r.exists) return ok(r);
      const missing = straightRanks(bid.high).filter((rank) => !idx.byRank.get(rank)?.length).map(rankShort);
      return { ...r, summary: `Missing ${listJoin(missing)}, with ${plural(W, "wild")} to fill the gap${missing.length === 1 ? "" : "s"}.` };
    }

    case "FLUSH":
    case "STRAIGHT_FLUSH": {
      const make = (suit: Suit) =>
        bid.type === "FLUSH" ? flushSlots(idx, bid.high, suit) : straightFlushSlots(idx, bid.high, suit);
      const { suit, slots } = bestSuit(make, idx);
      const r = resolveSlots(slots, idx);
      if (r.exists) return ok(r);
      const have = slots.filter((s) => s.natural).length;
      const detail =
        bid.type === "STRAIGHT_FLUSH"
          ? `missing ${listJoin(slots.filter((s) => !s.natural).map((s) => `${rankShort(s.rank)}${suitSymbol(suit)}`))}`
          : `${have} of the 5 cards${slots[0].natural ? "" : ` and no ${rankShort(bid.high)}${suitSymbol(suit)}`}`;
      return { ...r, summary: capitalize(`closest is ${suitName(suit)}: ${detail}, with ${plural(W, "wild")}.`) };
    }
  }
}

/** Does the bid hand exist in the combined pool of every dealt card? */
export function doesHandExistInPool(
  bid: Bid,
  allCards: readonly Card[],
  settings: Pick<BsPokerSettings, "deucesWild">,
  ctx: EvaluationContext = {},
): boolean {
  return evaluateBid(bid, allCards, settings, ctx).exists;
}
