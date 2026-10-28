/**
 * Rummy melds: what counts as a set or a run, laying off, finding melds in a hand, and points.
 * Jokers (when used) are wild: they stand in for any card a meld needs.
 */
import type { Card, StandardCard } from "@/types/cards";
import type { AceRule, Meld, RummyVariant } from "@/types/rummy";

const isJoker = (c: Card) => c.kind === "joker";
const range = (a: number, b: number) => Array.from({ length: b - a + 1 }, (_, i) => a + i);
const naturalsOf = (cards: readonly Card[]) => cards.filter((c): c is StandardCard => c.kind === "standard");

export interface MeldShape {
  kind: "set" | "run";
  /** Cards in table order: runs low to high, with Jokers in the gaps they fill. */
  ordered: Card[];
}

/** 3 or 4 of a rank, all different suits. */
function asSet(cards: readonly Card[]): MeldShape | null {
  const nat = naturalsOf(cards);
  if (cards.length < 3 || cards.length > 4 || nat.length === 0) return null;
  if (nat.some((c) => c.rank !== nat[0].rank)) return null;
  if (new Set(nat.map((c) => c.suit)).size !== nat.length) return null;
  return { kind: "set", ordered: [...nat, ...cards.filter(isJoker)] };
}

/** Lay the naturals out on a line of positions, Jokers filling gaps, then the ends. */
function layOut(byPos: Map<number, Card>, jokers: Card[], lo: number, hi: number, min: number, max: number): Card[] | null {
  const gaps = hi - lo + 1 - byPos.size;
  if (gaps > jokers.length) return null;
  let extra = jokers.length - gaps;
  let start = lo;
  let end = hi;
  // Spare Jokers go on the high end, then the low end.
  while (extra > 0 && end < max) (end++, extra--);
  while (extra > 0 && start > min) (start--, extra--);
  if (extra > 0) return null;
  const pool = [...jokers];
  const out: Card[] = [];
  for (let p = start; p <= end; p++) out.push(byPos.get(p) ?? pool.shift()!);
  return out;
}

/** 3+ in a row of one suit. Aces follow `aceRule`. */
function asRun(cards: readonly Card[], aceRule: AceRule): MeldShape | null {
  const nat = naturalsOf(cards);
  const jokers = cards.filter(isJoker);
  if (cards.length < 3 || cards.length > 13 || nat.length === 0) return null;
  if (nat.some((c) => c.suit !== nat[0].suit)) return null;
  if (new Set(nat.map((c) => c.rank)).size !== nat.length) return null;

  if (aceRule === "wrap") {
    // Ranks round a clock face (A, 2 … K, A): start just after the biggest gap.
    const pos = (c: StandardCard) => (c.rank === 14 ? 0 : c.rank - 1);
    const sorted = [...nat].sort((a, b) => pos(a) - pos(b));
    let bestStart = 0;
    let bestGap = -1;
    sorted.forEach((c, i) => {
      const next = sorted[(i + 1) % sorted.length];
      const gap = (pos(next) - pos(c) + 13) % 13 || 13;
      if (gap > bestGap) {
        bestGap = gap;
        bestStart = (i + 1) % sorted.length;
      }
    });
    const base = pos(sorted[bestStart]);
    const byPos = new Map(sorted.map((c) => [(pos(c) - base + 13) % 13, c] as [number, Card]));
    const hi = Math.max(...byPos.keys());
    const line = layOut(byPos, jokers, 0, hi, 0, 12);
    return line ? { kind: "run", ordered: line } : null;
  }

  const aceValues = aceRule === "low" ? [1] : [1, 14];
  for (const ace of aceValues) {
    const value = (c: StandardCard) => (c.rank === 14 ? ace : c.rank);
    const byPos = new Map(nat.map((c) => [value(c), c] as [number, Card]));
    const vals = [...byPos.keys()];
    const line = layOut(byPos, jokers, Math.min(...vals), Math.max(...vals), ace === 1 ? 1 : 2, ace === 1 ? 13 : 14);
    if (line) return { kind: "run", ordered: line };
  }
  return null;
}

/** Is this a legal meld? Prefers a set when the cards could be either. */
export function validateMeld(cards: readonly Card[], aceRule: AceRule, kind?: "set" | "run"): MeldShape | null {
  if (kind !== "run") {
    const set = asSet(cards);
    if (set) return set;
  }
  return kind === "set" ? null : asRun(cards, aceRule);
}

/** Can these cards go onto this meld? Returns the meld's new layout. */
export function layOffShape(meld: Pick<Meld, "cards" | "kind">, cards: readonly Card[], aceRule: AceRule): MeldShape | null {
  return validateMeld([...meld.cards, ...cards], aceRule, meld.kind);
}

/**
 * Could this card be played right now: laid off on a table meld, or melded with two cards from
 * `pool`? (Any meld containing it has a three-card piece containing it, so pairs are enough.)
 */
export function isPlayable(card: Card, pool: readonly Card[], melds: readonly Meld[], aceRule: AceRule): boolean {
  if (melds.some((m) => layOffShape(m, [card], aceRule))) return true;
  const others = pool.filter((c) => c.id !== card.id);
  for (let i = 0; i < others.length; i++) for (let j = i + 1; j < others.length; j++) if (validateMeld([card, others[i], others[j]], aceRule)) return true;
  return false;
}

/**
 * Melds you could put down from this hand, without sharing cards: biggest sets and runs first,
 * then Jokers to finish pairs and near-runs.
 */
export function findMelds(hand: readonly Card[], aceRule: AceRule): Card[][] {
  const nat = naturalsOf(hand);
  const candidates: Card[][] = [];

  // Sets: one card per suit of a rank.
  const byRank = new Map<number, StandardCard[]>();
  for (const c of nat) {
    const list = byRank.get(c.rank) ?? [];
    if (!list.some((x) => x.suit === c.suit)) list.push(c);
    byRank.set(c.rank, list);
  }
  for (const list of byRank.values()) if (list.length >= 3) candidates.push(list.slice(0, 4));

  // Runs: every unbroken stretch of 3+ within a suit. Ranks are laid out on a line (Ace at
  // 1, and at 14 too when it can play high); for wrap-around runs the line goes round twice.
  const line = aceRule === "low" ? range(1, 13) : aceRule === "both" ? range(1, 14) : [...range(1, 13), ...range(1, 13)];
  const seenRuns = new Set<string>();
  for (const suit of ["S", "H", "D", "C"] as const) {
    const at = new Map<number, StandardCard>();
    for (const c of nat) if (c.suit === suit) at.set(c.rank === 14 ? 1 : c.rank, c);
    if (at.has(1)) at.set(14, at.get(1)!);
    let run: Card[] = [];
    const flush = () => {
      const key = run.map((c) => c.id).sort().join();
      if (run.length >= 3 && !seenRuns.has(key) && validateMeld(run, aceRule)) {
        seenRuns.add(key);
        candidates.push(run);
      }
      run = [];
    };
    for (const v of line) {
      const c = at.get(v);
      if (!c || run.includes(c) || run.length === 13) flush();
      if (c && !run.includes(c)) run.push(c);
    }
    flush();
  }

  // Smaller pieces too (three of a four-card set, part of a run), so a set and a run that
  // share a card can both be made.
  const pieces: Card[][] = [];
  for (const m of candidates) {
    pieces.push(m);
    if (validateMeld(m, aceRule)?.kind === "set") {
      if (m.length === 4) for (let skip = 0; skip < 4; skip++) pieces.push(m.filter((_, i) => i !== skip));
    } else {
      for (let len = 3; len < m.length; len++) for (let at = 0; at + len <= m.length; at++) pieces.push(m.slice(at, at + len));
    }
  }
  pieces.sort((a, b) => b.length - a.length);

  // The combination of pieces that melds the most cards.
  let best: Card[][] = [];
  let bestCount = 0;
  const search = (from: number, used: Set<string>, chosen: Card[][], count: number) => {
    if (count > bestCount) {
      bestCount = count;
      best = [...chosen];
    }
    for (let i = from; i < pieces.length; i++) {
      const m = pieces[i];
      if (m.some((c) => used.has(c.id))) continue;
      // Even taking every free card couldn't beat the best: stop.
      if (count + (nat.length - used.size) <= bestCount) return;
      m.forEach((c) => used.add(c.id));
      chosen.push(m);
      search(i + 1, used, chosen, count + m.length);
      chosen.pop();
      m.forEach((c) => used.delete(c.id));
    }
  };
  search(0, new Set(), [], 0);
  const melds = best;
  const used = new Set(best.flat().map((c) => c.id));

  // Jokers finish pairs and near-runs from what's left.
  const jokers = hand.filter((c) => isJoker(c) && !used.has(c.id));
  const left = nat.filter((c) => !used.has(c.id));
  for (const joker of jokers) {
    let done = false;
    for (let i = 0; i < left.length && !done; i++) {
      for (let j = i + 1; j < left.length && !done; j++) {
        if (used.has(left[i].id) || used.has(left[j].id)) continue;
        const trio = [left[i], left[j], joker];
        if (validateMeld(trio, aceRule)) {
          melds.push(trio);
          trio.forEach((c) => used.add(c.id));
          done = true;
        }
      }
    }
  }
  return melds;
}

/** Card points. Classic: A 1, 2–10 face value, J/Q/K 10. Rummy 500: 2–9 are 5, 10–K 10, A 15. Jokers 15. */
export function cardPoints(card: Card, variant: RummyVariant): number {
  if (card.kind === "joker") return 15;
  if (variant === "classic") return card.rank === 14 ? 1 : Math.min(card.rank, 10);
  if (card.rank === 14) return 15;
  return card.rank >= 10 ? 10 : 5;
}

/** Points for a card on the table: in Rummy 500 an Ace played low (A-2-3) is only 5. */
export function meldCardPoints(meld: Pick<Meld, "cards" | "kind">, card: Card, variant: RummyVariant): number {
  if (variant === "rummy500" && card.kind === "standard" && card.rank === 14 && meld.kind === "run") {
    const i = meld.cards.findIndex((c) => c.id === card.id);
    const next = meld.cards[i + 1];
    if (next?.kind === "standard" && next.rank === 2) return 5;
  }
  return cardPoints(card, variant);
}

export const handPoints = (hand: readonly Card[], variant: RummyVariant) => hand.reduce((n, c) => n + cardPoints(c, variant), 0);
