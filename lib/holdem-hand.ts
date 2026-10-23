/**
 * Texas Hold'em hand evaluation: the best 5 of up to 7 cards, compared with full kickers.
 */
import type { Card, Rank, StandardCard } from "@/types/cards";
import { rankName, rankPlural } from "./cards";

export const HOLDEM_CATEGORY = [
  "High card",
  "Pair",
  "Two pair",
  "Three of a kind",
  "Straight",
  "Flush",
  "Full house",
  "Four of a kind",
  "Straight flush",
] as const;

export interface HandValue {
  /** 0 = high card … 8 = straight flush. */
  category: number;
  /** Tiebreakers in order of importance (pair rank, then kickers, …). */
  ranks: number[];
  /** The five cards that make the hand. */
  cards: StandardCard[];
  label: string;
}

/** >0 if a beats b, <0 if b beats a, 0 for an exact tie (split pot). */
export function compareHands(a: HandValue, b: HandValue): number {
  if (a.category !== b.category) return a.category - b.category;
  for (let i = 0; i < Math.max(a.ranks.length, b.ranks.length); i++) {
    const d = (a.ranks[i] ?? 0) - (b.ranks[i] ?? 0);
    if (d !== 0) return d;
  }
  return 0;
}

/** Top card of a straight in these ranks, or 0. Handles the wheel (A-2-3-4-5 is 5-high). */
function straightHigh(ranks: number[]): number {
  const set = new Set(ranks);
  if (set.has(14)) set.add(1);
  for (let high = 14; high >= 5; high--) {
    let ok = true;
    for (let r = high; r > high - 5; r--) if (!set.has(r)) ok = false;
    if (ok) return high;
  }
  return 0;
}

function label(category: number, ranks: number[]): string {
  const n = (r: number) => rankName(r as Rank);
  const p = (r: number) => rankPlural(r as Rank);
  switch (category) {
    case 8:
      return ranks[0] === 14 ? "Royal flush" : `Straight flush, ${n(ranks[0])} high`;
    case 7:
      return `Four ${p(ranks[0])}`;
    case 6:
      return `${p(ranks[0])} full of ${p(ranks[1])}`;
    case 5:
      return `Flush, ${n(ranks[0])} high`;
    case 4:
      return `Straight, ${n(ranks[0])} high`;
    case 3:
      return `Three ${p(ranks[0])}`;
    case 2:
      return `Two pair, ${p(ranks[0])} and ${p(ranks[1])}`;
    case 1:
      return `Pair of ${p(ranks[0])}`;
    default:
      return `${n(ranks[0])} high`;
  }
}

/** Value of exactly five standard cards. */
export function evaluateFive(cards: StandardCard[]): HandValue {
  const byRank = new Map<number, number>();
  for (const c of cards) byRank.set(c.rank, (byRank.get(c.rank) ?? 0) + 1);
  // Groups sorted by size, then rank: e.g. full house → [[10,3],[4,2]].
  const groups = [...byRank.entries()].sort((a, b) => b[1] - a[1] || b[0] - a[0]);
  const desc = cards.map((c) => c.rank as number).sort((a, b) => b - a);
  const flush = cards.every((c) => c.suit === cards[0].suit);
  const high = straightHigh(desc);
  // Order the cards so the "important" ones come first (nice for display).
  const ordered = [...cards].sort((a, b) => (byRank.get(b.rank)! - byRank.get(a.rank)!) || b.rank - a.rank);

  let category: number;
  let ranks: number[];
  if (flush && high) [category, ranks] = [8, [high]];
  else if (groups[0][1] === 4) [category, ranks] = [7, [groups[0][0], groups[1][0]]];
  else if (groups[0][1] === 3 && groups[1][1] === 2) [category, ranks] = [6, [groups[0][0], groups[1][0]]];
  else if (flush) [category, ranks] = [5, desc];
  else if (high) [category, ranks] = [4, [high]];
  else if (groups[0][1] === 3) [category, ranks] = [3, groups.map((g) => g[0])];
  else if (groups[0][1] === 2 && groups[1][1] === 2) [category, ranks] = [2, groups.map((g) => g[0])];
  else if (groups[0][1] === 2) [category, ranks] = [1, groups.map((g) => g[0])];
  else [category, ranks] = [0, desc];

  return { category, ranks, cards: ordered, label: label(category, ranks) };
}

/** The best five-card hand from 5–7 cards. */
export function bestHand(cards: readonly Card[]): HandValue {
  const std = cards.filter((c): c is StandardCard => c.kind === "standard");
  if (std.length < 5) throw new Error("Need at least five cards to make a hand");
  let best: HandValue | null = null;
  const n = std.length;
  for (let a = 0; a < n; a++)
    for (let b = a + 1; b < n; b++)
      for (let c = b + 1; c < n; c++)
        for (let d = c + 1; d < n; d++)
          for (let e = d + 1; e < n; e++) {
            const v = evaluateFive([std[a], std[b], std[c], std[d], std[e]]);
            if (!best || compareHands(v, best) > 0) best = v;
          }
  return best!;
}

// ---------------------------------------------------------------------------
// Fast scoring (for simulations)
// ---------------------------------------------------------------------------

const BIT = (r: number) => 1 << r;

/** Top card of a straight inside a rank bitmask (bit r = rank r present), or 0. */
function straightHighFromMask(mask: number): number {
  const m = mask & BIT(14) ? mask | BIT(1) : mask; // Ace plays low too.
  for (let high = 14; high >= 5; high--) {
    const need = 0b11111 << (high - 4);
    if ((m & need) === need) return high;
  }
  return 0;
}

/** Highest `n` ranks in a mask, descending. */
function topRanks(mask: number, n: number, skip: number[] = []): number[] {
  const out: number[] = [];
  for (let r = 14; r >= 2 && out.length < n; r--) if (mask & BIT(r) && !skip.includes(r)) out.push(r);
  return out;
}

/**
 * One number per hand: bigger is better, equal means a split. Same ordering as
 * `compareHands(bestHand(a), bestHand(b))` but with no combinations or labels, so
 * equity simulations can score thousands of hands quickly.
 */
export function handScore(cards: readonly Card[]): number {
  const counts = new Array<number>(15).fill(0);
  const suitMask: Record<string, number> = { S: 0, H: 0, D: 0, C: 0 };
  const suitCount: Record<string, number> = { S: 0, H: 0, D: 0, C: 0 };
  let all = 0;
  for (const c of cards) {
    if (c.kind !== "standard") continue;
    counts[c.rank]++;
    suitMask[c.suit] |= BIT(c.rank);
    suitCount[c.suit]++;
    all |= BIT(c.rank);
  }
  const encode = (category: number, ranks: number[]) => {
    let v = category;
    for (let i = 0; i < 5; i++) v = v * 15 + (ranks[i] ?? 0);
    return v;
  };

  const flushSuit = (["S", "H", "D", "C"] as const).find((s) => suitCount[s] >= 5);
  if (flushSuit) {
    const sf = straightHighFromMask(suitMask[flushSuit]);
    if (sf) return encode(8, [sf]);
  }
  const quads: number[] = [];
  const trips: number[] = [];
  const pairs: number[] = [];
  for (let r = 14; r >= 2; r--) {
    if (counts[r] === 4) quads.push(r);
    else if (counts[r] === 3) trips.push(r);
    else if (counts[r] === 2) pairs.push(r);
  }
  if (quads.length) return encode(7, [quads[0], ...topRanks(all, 1, [quads[0]])]);
  if (trips.length && (trips.length > 1 || pairs.length)) {
    const pair = Math.max(trips[1] ?? 0, pairs[0] ?? 0);
    return encode(6, [trips[0], pair]);
  }
  if (flushSuit) return encode(5, topRanks(suitMask[flushSuit], 5));
  const straight = straightHighFromMask(all);
  if (straight) return encode(4, [straight]);
  if (trips.length) return encode(3, [trips[0], ...topRanks(all, 2, [trips[0]])]);
  if (pairs.length >= 2) return encode(2, [pairs[0], pairs[1], ...topRanks(all, 1, [pairs[0], pairs[1]])]);
  if (pairs.length) return encode(1, [pairs[0], ...topRanks(all, 3, [pairs[0]])]);
  return encode(0, topRanks(all, 5));
}
