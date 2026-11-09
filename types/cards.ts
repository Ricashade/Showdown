export type Suit = "S" | "H" | "D" | "C";

/** 2–10 are face value, J=11, Q=12, K=13, A=14. */
export type Rank = 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | 14;

export interface StandardCard {
  id: string;
  kind: "standard";
  rank: Rank;
  suit: Suit;
}

export interface JokerCard {
  id: string;
  kind: "joker";
}

export type Card = StandardCard | JokerCard;

/**
 * What a deal is shuffled from. Online, the host passes 8 random 32-bit words (256 bits) from
 * `crypto`, so nobody can work the deck out from the cards they see. A plain number is for
 * tests and replays only.
 */
export type Seed = number | readonly number[];

/** The deck's random stream: a ChaCha20 key, which stream, and how far into it we are. Host only. */
export interface RngState {
  k: number[];
  s: number;
  c: number;
}
