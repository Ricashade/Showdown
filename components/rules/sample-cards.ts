import type { Card, Rank, Suit } from "@/types/cards";

const RANK: Record<string, Rank> = {
  A: 14, K: 13, Q: 12, J: 11, T: 10, "9": 9, "8": 8, "7": 7, "6": 6, "5": 5, "4": 4, "3": 3, "2": 2,
};

/** "KS 9D" → cards, for rules examples and the demo. */
export function cards(spec: string): Card[] {
  return spec
    .split(/\s+/)
    .filter(Boolean)
    .map((t) => ({ id: t, kind: "standard", rank: RANK[t[0]], suit: t[1] as Suit }));
}
