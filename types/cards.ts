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
