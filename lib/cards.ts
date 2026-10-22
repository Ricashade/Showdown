import type { Card, Rank, StandardCard, Suit } from "@/types/cards";

export const SUITS: readonly Suit[] = ["S", "H", "D", "C"];
export const RANKS: readonly Rank[] = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14];

const RANK_SHORT: Record<Rank, string> = {
  2: "2", 3: "3", 4: "4", 5: "5", 6: "6", 7: "7", 8: "8", 9: "9", 10: "10",
  11: "J", 12: "Q", 13: "K", 14: "A",
};

const RANK_NAME: Record<Rank, string> = {
  2: "Two", 3: "Three", 4: "Four", 5: "Five", 6: "Six", 7: "Seven", 8: "Eight",
  9: "Nine", 10: "Ten", 11: "Jack", 12: "Queen", 13: "King", 14: "Ace",
};

const RANK_PLURAL: Record<Rank, string> = {
  2: "Twos", 3: "Threes", 4: "Fours", 5: "Fives", 6: "Sixes", 7: "Sevens", 8: "Eights",
  9: "Nines", 10: "Tens", 11: "Jacks", 12: "Queens", 13: "Kings", 14: "Aces",
};

const SUIT_SYMBOL: Record<Suit, string> = { S: "♠", H: "♥", D: "♦", C: "♣" };
const SUIT_NAME: Record<Suit, string> = { S: "Spades", H: "Hearts", D: "Diamonds", C: "Clubs" };

export const rankShort = (r: Rank) => RANK_SHORT[r];
export const rankName = (r: Rank) => RANK_NAME[r];
export const rankPlural = (r: Rank) => RANK_PLURAL[r];
export const suitSymbol = (s: Suit) => SUIT_SYMBOL[s];
export const suitName = (s: Suit) => SUIT_NAME[s];
export const isRedSuit = (s: Suit) => s === "H" || s === "D";

export function cardLabel(card: Card): string {
  return card.kind === "joker" ? "Joker" : `${rankShort(card.rank)}${suitSymbol(card.suit)}`;
}

export function createDeck(includeJokers: boolean): Card[] {
  const deck: Card[] = [];
  for (const suit of SUITS) {
    for (const rank of RANKS) {
      deck.push({ id: `${RANK_SHORT[rank]}${suit}`, kind: "standard", rank, suit } satisfies StandardCard);
    }
  }
  if (includeJokers) {
    deck.push({ id: "JK1", kind: "joker" }, { id: "JK2", kind: "joker" });
  }
  return deck;
}

export const deckSize = (includeJokers: boolean) => (includeJokers ? 54 : 52);

/**
 * Seeded PRNG (mulberry32). State is a plain uint32 so it lives inside the
 * serializable GameState and reducers stay pure + replayable.
 */
export function nextRandom(state: number): [value: number, nextState: number] {
  const a = (state + 0x6d2b79f5) | 0;
  let t = Math.imul(a ^ (a >>> 15), 1 | a);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return [((t ^ (t >>> 14)) >>> 0) / 4294967296, a >>> 0];
}

/** Fisher–Yates shuffle driven by the seeded PRNG. */
export function shuffle<T>(items: readonly T[], rngState: number): { result: T[]; rngState: number } {
  const result = items.slice();
  let s = rngState;
  for (let i = result.length - 1; i > 0; i--) {
    const [r, next] = nextRandom(s);
    s = next;
    const j = Math.floor(r * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return { result, rngState: s };
}

/** Sort for display: high rank first, jokers last. */
export function sortCards(cards: readonly Card[]): Card[] {
  return cards.slice().sort((a, b) => {
    if (a.kind === "joker") return b.kind === "joker" ? 0 : 1;
    if (b.kind === "joker") return -1;
    return b.rank - a.rank || SUITS.indexOf(a.suit) - SUITS.indexOf(b.suit);
  });
}
