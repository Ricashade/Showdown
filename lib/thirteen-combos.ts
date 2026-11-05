/**
 * 13's plays: reading cards as a single, pair, triple, straight or bomb (Jokers stand in for
 * any card), comparing plays, and finding the bombs in a hand.
 *
 * Ranks climb 3 … Ace, then 2 on top. Suits break ties: ♠ < ♣ < ♦ < ♥. A Joker standing at
 * the top of a play counts below every natural suit there.
 */
import type { Card, Rank, StandardCard, Suit } from "@/types/cards";
import type { BombTiebreaker, Combo, JokerAs } from "@/types/thirteen";
import { rankPlural, rankShort, suitSymbol } from "./cards";

/** 3 low … Ace, then 2 above everything. */
export const power = (r: Rank) => (r === 2 ? 15 : r);
export const SUIT_ORDER: readonly Suit[] = ["S", "C", "D", "H"];
export const suitPower = (s: Suit) => SUIT_ORDER.indexOf(s);
/** Every rank, lowest first. */
export const LADDER: readonly Rank[] = [3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 2];
/** A run goes 3 to Ace; 2s never sit in one. */
const RUN_LOW = 3;
const RUN_HIGH = 14;

const isStandard = (c: Card): c is StandardCard => c.kind === "standard";
const range = (lo: number, hi: number) => Array.from({ length: hi - lo + 1 }, (_, i) => (lo + i) as Rank);

// ---------------------------------------------------------------------------
// The bombs
// ---------------------------------------------------------------------------

export type BombShape = { kind: "kind"; count: number } | { kind: "run"; width: number; length: number } | { kind: "dragon"; suited: boolean };

export interface BombDef {
  tier: number;
  name: string;
  example: string;
  shape: BombShape;
  /** The most 2s it can come down on; Infinity for any number. */
  cap: number;
}

const run = (width: number, length: number): BombShape => ({ kind: "run", width, length });
const kind = (count: number): BombShape => ({ kind: "kind", count });

/** Tier 1 (weakest) to 17 (strongest). A higher tier always wins. */
export const BOMBS: readonly BombDef[] = [
  { tier: 1, name: "3 consecutive pairs", example: "33 44 55", shape: run(2, 3), cap: 1 },
  { tier: 2, name: "Four of a kind", example: "7777", shape: kind(4), cap: 1 },
  { tier: 3, name: "2 consecutive triples", example: "333 444", shape: run(3, 2), cap: 1 },
  { tier: 4, name: "4 consecutive pairs", example: "33 44 55 66", shape: run(2, 4), cap: 2 },
  { tier: 5, name: "Five of a kind", example: "7777 + Joker", shape: kind(5), cap: 2 },
  { tier: 6, name: "5 consecutive pairs", example: "33 to 77", shape: run(2, 5), cap: 3 },
  { tier: 7, name: "3 consecutive triples", example: "333 444 555", shape: run(3, 3), cap: 3 },
  { tier: 8, name: "Six of a kind", example: "7777 + 2 Jokers", shape: kind(6), cap: 3 },
  { tier: 9, name: "6 consecutive pairs", example: "33 to 88", shape: run(2, 6), cap: 4 },
  { tier: 10, name: "Dragon", example: "3 to A, any suits", shape: { kind: "dragon", suited: false }, cap: 4 },
  { tier: 11, name: "2 consecutive quads", example: "7777 8888", shape: run(4, 2), cap: 4 },
  { tier: 12, name: "7 consecutive pairs", example: "33 to 99", shape: run(2, 7), cap: 5 },
  { tier: 13, name: "4 consecutive triples", example: "333 to 666", shape: run(3, 4), cap: 5 },
  { tier: 14, name: "Suited dragon", example: "3 to A, one suit", shape: { kind: "dragon", suited: true }, cap: Infinity },
  { tier: 15, name: "8 consecutive pairs", example: "33 to 10 10", shape: run(2, 8), cap: Infinity },
  { tier: 16, name: "3 consecutive quads", example: "3333 4444 5555", shape: run(4, 3), cap: Infinity },
  { tier: 17, name: "2 consecutive fives", example: "33333 44444", shape: run(5, 2), cap: Infinity },
];

export const bombOf = (tier: number) => BOMBS[tier - 1];
const KIND_TIER: Record<number, number> = { 4: 2, 5: 5, 6: 8 };
const RUN_BOMBS = BOMBS.filter((b): b is BombDef & { shape: { kind: "run"; width: number; length: number } } => b.shape.kind === "run");

// ---------------------------------------------------------------------------
// Reading cards
// ---------------------------------------------------------------------------

/** The best natural suit at `rank` among these cards; -1 if none (a Joker stands there). */
function suitAt(naturals: StandardCard[], rank: Rank) {
  return naturals.reduce((best, c) => (c.rank === rank ? Math.max(best, suitPower(c.suit)) : best), -1);
}

/** Strongest first: bombs by tier, then by top card. */
export function compareStrength(a: Combo, b: Combo) {
  return b.tier - a.tier || power(b.top) - power(a.top) || b.topSuit - a.topSuit || b.size - a.size;
}

/** Every way these cards make a play, strongest first. Empty when they make nothing. */
export function readCombos(cards: readonly Card[]): Combo[] {
  const naturals = cards.filter(isStandard);
  const j = cards.length - naturals.length;
  const n = cards.length;
  if (n === 0) return [];
  const ranks = new Set(naturals.map((c) => c.rank));
  const out: Combo[] = [];
  const add = (c: Omit<Combo, "size" | "jokers">) => out.push({ ...c, size: n, jokers: j });

  // All one rank (Jokers alone can be any rank).
  if (ranks.size <= 1 && n <= 6) {
    const options = ranks.size ? [...ranks] : [...LADDER].reverse();
    for (const r of options) {
      const type = n === 1 ? "single" : n === 2 ? "pair" : n === 3 ? "triple" : "bomb";
      add({ type, top: r, low: r, topSuit: suitAt(naturals, r), tier: KIND_TIER[n] ?? 0, jokerAs: Array.from({ length: j }, () => ({ rank: r })) });
    }
  }

  // One of each rank in a row: a straight, or all twelve for a dragon.
  if (n >= 3 && ranks.size === naturals.length && !ranks.has(2)) {
    for (let low = RUN_LOW; low + n - 1 <= RUN_HIGH; low++) {
      const high = (low + n - 1) as Rank;
      if (naturals.some((c) => c.rank < low || c.rank > high)) continue;
      const missing = range(low, high).filter((r) => !ranks.has(r));
      const base = { top: high, low: low as Rank, topSuit: suitAt(naturals, high) };
      if (n < 12) {
        add({ ...base, type: "straight", tier: 0, jokerAs: missing.map((rank) => ({ rank })) });
        continue;
      }
      add({ ...base, type: "bomb", tier: 10, jokerAs: missing.map((rank) => ({ rank })) });
      const suits = new Set(naturals.map((c) => c.suit));
      if (suits.size === 1 && naturals.length > 0) {
        const suit = naturals[0].suit;
        add({ ...base, type: "bomb", tier: 14, jokerAs: missing.map((rank) => ({ rank, suit })) });
      }
    }
  }

  // Consecutive pairs, triples, quads or fives.
  if (!ranks.has(2)) {
    const count = new Map<Rank, number>();
    for (const c of naturals) count.set(c.rank, (count.get(c.rank) ?? 0) + 1);
    for (const b of RUN_BOMBS) {
      const { width, length } = b.shape;
      if (width * length !== n || [...count.values()].some((x) => x > width)) continue;
      for (let low = RUN_LOW; low + length - 1 <= RUN_HIGH; low++) {
        const high = (low + length - 1) as Rank;
        if (naturals.some((c) => c.rank < low || c.rank > high)) continue;
        const jokerAs: JokerAs[] = [];
        for (const r of range(low, high)) for (let k = count.get(r) ?? 0; k < width; k++) jokerAs.push({ rank: r });
        if (jokerAs.length !== j) continue;
        add({ type: "bomb", top: high, low: low as Rank, topSuit: suitAt(naturals, high), tier: b.tier, jokerAs });
      }
    }
  }

  return out.sort(compareStrength);
}

/** Identifies one reading of a set of cards (how its Jokers count). */
export const comboKey = (c: Combo) => `${c.type}${c.size}:${c.tier}:${c.low}-${c.top}:${c.jokerAs.map((x) => `${x.rank}${x.suit ?? ""}`).join(".")}`;

// ---------------------------------------------------------------------------
// Beating a play
// ---------------------------------------------------------------------------

/** How many 2s a play is made of (a single, pair or triple of 2s); 0 otherwise. */
export const twosIn = (c: Combo) => (c.type !== "bomb" && c.type !== "straight" && c.top === 2 ? c.size : 0);

/** A bomb can come down on this: 2s, or another bomb. */
export const isBombable = (c: Combo) => c.type === "bomb" || twosIn(c) > 0;

function bombBeats(a: Combo, b: Combo, tiebreak: BombTiebreaker) {
  if (a.tier !== b.tier) return a.tier > b.tier;
  if (a.top !== b.top) return power(a.top) > power(b.top);
  if (tiebreak === "strict") return false;
  if (tiebreak === "challenger") return true;
  if ((a.jokers === 0) !== (b.jokers === 0)) return a.jokers === 0;
  return a.topSuit > b.topSuit;
}

/** Whether `next` beats `current`: the same kind and size but higher, or a bomb on 2s or on a weaker bomb. */
export function beats(next: Combo, current: Combo, tiebreak: BombTiebreaker): boolean {
  if (current.type === "bomb") return next.type === "bomb" && bombBeats(next, current, tiebreak);
  if (next.type === "bomb") {
    const twos = twosIn(current);
    return twos > 0 && twos <= bombOf(next.tier).cap;
  }
  if (next.type !== current.type || next.size !== current.size) return false;
  return power(next.top) > power(current.top) || (next.top === current.top && next.topSuit > current.topSuit);
}

// ---------------------------------------------------------------------------
// Finding bombs in a hand
// ---------------------------------------------------------------------------

export interface FoundPlay {
  combo: Combo;
  cards: Card[];
}

/** Every bomb this hand can make (one way each, best suits first), strongest first. */
export function findBombs(hand: readonly Card[]): FoundPlay[] {
  const jokers = hand.filter((c) => c.kind === "joker");
  const byRank = new Map<Rank, StandardCard[]>();
  for (const c of hand.filter(isStandard).sort((a, b) => suitPower(b.suit) - suitPower(a.suit))) {
    byRank.set(c.rank, [...(byRank.get(c.rank) ?? []), c]);
  }
  const count = (r: Rank) => byRank.get(r)?.length ?? 0;
  const take = (r: Rank, k: number) => (byRank.get(r) ?? []).slice(0, k);
  const out: FoundPlay[] = [];
  const keep = (cards: Card[], tier: number) => {
    const combo = readCombos(cards).find((c) => c.tier === tier);
    if (combo) out.push({ combo, cards });
  };

  for (const r of LADDER) {
    for (const k of [4, 5, 6]) {
      const nat = Math.min(count(r), k);
      if (nat > 0 && k - nat <= jokers.length) keep([...take(r, nat), ...jokers.slice(0, k - nat)], KIND_TIER[k]);
    }
  }

  for (const b of RUN_BOMBS) {
    const { width, length } = b.shape;
    for (let low = RUN_LOW; low + length - 1 <= RUN_HIGH; low++) {
      const window = range(low, low + length - 1);
      const need = window.reduce((n, r) => n + Math.max(0, width - count(r)), 0);
      if (need > jokers.length) continue;
      keep([...window.flatMap((r) => take(r, width)), ...jokers.slice(0, need)], b.tier);
    }
  }

  const all = range(RUN_LOW, RUN_HIGH);
  const missing = all.filter((r) => count(r) === 0).length;
  if (missing <= jokers.length) keep([...all.flatMap((r) => take(r, 1)), ...jokers.slice(0, missing)], 10);
  for (const suit of SUIT_ORDER) {
    const own = all.map((r) => byRank.get(r)?.find((c) => c.suit === suit)).filter((c): c is StandardCard => !!c);
    const gaps = all.length - own.length;
    if (gaps <= jokers.length && own.length > 0) keep([...own, ...jokers.slice(0, gaps)], 14);
  }

  return out.sort((a, b) => compareStrength(a.combo, b.combo) || a.combo.jokers - b.combo.jokers);
}

// ---------------------------------------------------------------------------
// Words
// ---------------------------------------------------------------------------

const span = (c: Combo) => `${rankShort(c.low)} to ${rankShort(c.top)}`;
const RUN_WORD: Record<number, string> = { 2: "Pairs", 3: "Triples", 4: "Quads", 5: "Fives" };
/** "8s", "Queens". */
const plural = (r: Rank) => (r >= 11 ? rankPlural(r) : `${rankShort(r)}s`);

/** "Pair of 9s", "6-card straight to J", "Four Jacks", "Pairs 3 to 5". */
export function describeCombo(c: Combo): string {
  switch (c.type) {
    case "single":
      return c.topSuit < 0 ? `Joker as ${rankShort(c.top)}` : `${rankShort(c.top)}${suitSymbol(SUIT_ORDER[c.topSuit])}`;
    case "pair":
      return `Pair of ${plural(c.top)}`;
    case "triple":
      return `Three ${plural(c.top)}`;
    case "straight":
      return `${c.size}-card straight to ${rankShort(c.top)}`;
    case "bomb": {
      const shape = bombOf(c.tier).shape;
      if (shape.kind === "kind") return `${["", "", "", "", "Four", "Five", "Six"][shape.count]} ${plural(c.top)}`;
      if (shape.kind === "run") return `${RUN_WORD[shape.width]} ${span(c)}`;
      const suit = c.jokerAs[0]?.suit;
      return shape.suited ? `Suited dragon${suit ? ` ${suitSymbol(suit)}` : ""}` : "Dragon";
    }
  }
}

/** "chops one 2", "chops up to three 2s", "chops any 2s". */
export function chopWords(tier: number): string {
  const cap = bombOf(tier).cap;
  if (cap === Infinity) return "chops any 2s";
  return cap === 1 ? "chops one 2" : `chops up to ${["", "one", "two", "three", "four", "five"][cap]} 2s`;
}
