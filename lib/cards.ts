import type { Card, Rank, RngState, Seed, StandardCard, Suit } from "@/types/cards";

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

// ---------------------------------------------------------------------------
// The deck's randomness: ChaCha20 as a keystream (RFC 8439 block function)
// ---------------------------------------------------------------------------
//
// Every shuffle comes from here. Its state is plain JSON inside the GameState (so reducers stay
// pure and replayable) and never leaves the host. A cryptographic stream with a 256-bit key means
// the cards a player sees can't be used to work out the seed, and with it everyone else's cards
// or the next deal, which a small seed (2^32 possibilities) would allow.

const rotl = (x: number, n: number) => (x << n) | (x >>> (32 - n));

/** One ChaCha20 block (16 words) for a key, block counter and stream. */
export function chachaBlock(key: readonly number[], counter: number, nonce: readonly [number, number, number]): number[] {
  const init = [0x61707865, 0x3320646e, 0x79622d32, 0x6b206574, ...key.map((w) => w | 0), counter | 0, ...nonce.map((w) => w | 0)];
  const x = init.slice();
  const qr = (a: number, b: number, c: number, d: number) => {
    x[a] = (x[a] + x[b]) | 0; x[d] = rotl(x[d] ^ x[a], 16);
    x[c] = (x[c] + x[d]) | 0; x[b] = rotl(x[b] ^ x[c], 12);
    x[a] = (x[a] + x[b]) | 0; x[d] = rotl(x[d] ^ x[a], 8);
    x[c] = (x[c] + x[d]) | 0; x[b] = rotl(x[b] ^ x[c], 7);
  };
  for (let i = 0; i < 10; i++) {
    qr(0, 4, 8, 12); qr(1, 5, 9, 13); qr(2, 6, 10, 14); qr(3, 7, 11, 15);
    qr(0, 5, 10, 15); qr(1, 6, 11, 12); qr(2, 7, 8, 13); qr(3, 4, 9, 14);
  }
  return x.map((w, i) => (w + init[i]) >>> 0);
}

/**
 * The stream for a seed. Online seeds are 8 random words (the key); a 9th word, if given, picks
 * the stream (one per table). A plain number gives a fixed key, for tests and replays.
 */
export function seedRng(seed: Seed): RngState {
  const words = typeof seed === "number" ? [seed >>> 0] : seed.map((w) => (Number.isFinite(w) ? w >>> 0 : 0));
  const k = Array.from({ length: 8 }, (_, i) => words[i] ?? 0);
  return { k, s: words[8] ?? 0, c: 0 };
}

/** Accept a host snapshot saved before the stream existed (a bare number), so a refresh can't crash a game. */
const asRng = (state: RngState | number): RngState => (typeof state === "number" ? seedRng(state) : state);

/** The next number (0 ≤ x < 1) from the deck's stream, and the stream moved on. */
export function nextRandom(state: RngState | number): [value: number, nextState: RngState] {
  const st = asRng(state);
  const word = chachaBlock(st.k, Math.floor(st.c / 16), [st.s, 0, 0])[st.c % 16];
  return [word / 4294967296, { k: st.k, s: st.s, c: st.c + 1 }];
}

/** A fresh online seed: 256 bits from the browser's secure random source. */
export const randomSeed = (): number[] => [...globalThis.crypto.getRandomValues(new Uint32Array(8))];

/** The seed for one table of several, each with its own stream. */
export function tableSeed(seed: Seed, table: number): Seed {
  return typeof seed === "number" ? (seed + table * 7919) >>> 0 : [...seed.slice(0, 8), table];
}

// ---------------------------------------------------------------------------
// Bots' and tests' randomness: fast, repeatable, not secret (mulberry32)
// ---------------------------------------------------------------------------

/** A repeatable random-number function (0 ≤ x < 1) from a seed, for bots and tests. Never for dealing. */
export function seededRandom(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    const a = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    s = a >>> 0;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Fisher–Yates shuffle driven by the deck's stream. */
export function shuffle<T>(items: readonly T[], rngState: RngState | number): { result: T[]; rngState: RngState } {
  const result = items.slice();
  let s = asRng(rngState);
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
