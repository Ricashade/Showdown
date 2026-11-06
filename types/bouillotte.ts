import type { Card, Rank, Suit } from "./cards";
import type { BasePlayer, PlayerSeed } from "./game";

/** "everyone": each player antes. "dealer": the dealer antes for the whole table. */
export type AnteBy = "everyone" | "dealer";

export interface BouillotteSettings {
  /** La cave: each player's chips at the start. */
  startingChips: number;
  ante: number;
  anteBy: AnteBy;
  /** Before the deal, the player to the dealer's right may post a blind carré and act last. */
  allowCarre: boolean;
  /** A pair in hand plus a Retourné of that rank counts as a brélan. */
  brelanFavori: boolean;
}

export interface BouillottePlayer extends BasePlayer {
  chips: number;
  /** "busted": out of chips, no longer dealt in. */
  status: "active" | "busted";
  /** Dealt into the current hand. */
  inHand: boolean;
  /** SECRET: three cards, only the owner sees them (everyone sees them at a Point showdown). */
  hand: Card[];
  folded: boolean;
  allIn: boolean;
  /** Ante (or the dealer's ante for the table) posted this hand. Dead money: it doesn't count as a bet. */
  ante: number;
  /** Bet this hand, carré included. */
  bet: number;
  /** Has acted since the last full raise. */
  acted: boolean;
  /** May still raise (not after a short all-in that didn't reopen the betting). */
  mayRaise: boolean;
}

export type BouillotteMove = "ante" | "carre" | "pass" | "open" | "call" | "raise" | "all_in" | "fold";

/** How a hand at showdown ranks: a brélan, or nothing (then Le Point decides). */
export interface Brelan {
  kind: "carre" | "natural" | "favori";
  rank: Rank;
}

export interface BouillottePotResult {
  amount: number;
  winnerId: string;
  /** Won because everyone else folded, with a brélan, or on Le Point. */
  by: "fold" | "brelan" | "point";
  /** Le Point: the suit that decided this pot, and the card that won it. */
  suit?: Suit;
  cardId?: string;
}

export interface BouillotteResult {
  handNumber: number;
  pots: BouillottePotResult[];
  /** Chips each player took from the pots and bonuses. */
  won: Record<string, number>;
  /** Hands shown: those still in at a showdown, and every hand dealt when Le Point was counted. */
  revealed: Record<string, Card[]>;
  brelans: Record<string, Brelan>;
  /** The main pot's brélan bonus: what each other player paid its winner. */
  bonus: { to: string; each: number; total: number } | null;
  /** Le Point: every suit's total across all hands dealt and the Retourné. */
  totals: Record<Suit, number> | null;
}

export type BouillottePhase = "lobby" | "carre" | "betting" | "hand_over" | "game_over";

export interface BouillotteState {
  mode: "bouillotte";
  roomId: string;
  version: number;
  phase: BouillottePhase;
  settings: BouillotteSettings;
  players: BouillottePlayer[];
  hostId: string;
  /** SECRET: PRNG state. */
  rngState: number;
  handNumber: number;
  dealerId: string | null;
  /** The communal card turned face up. */
  retourne: Card | null;
  /** SECRET: the cards left undealt. */
  stub: Card[];
  /** Who may post a carré this hand, and whether they did. */
  carreSeatId: string | null;
  carrePosted: boolean;
  currentBet: number;
  /** The smallest raise allowed: the last full raise. */
  minRaise: number;
  currentTurnId: string | null;
  lastActions: Record<string, { move: BouillotteMove; amount?: number }>;
  result: BouillotteResult | null;
  winnerId: string | null;
}

export type BouillotteAction =
  | { type: "JOIN_ROOM"; player: PlayerSeed }
  | { type: "LEAVE_ROOM"; playerId: string }
  | { type: "RENAME_PLAYER"; playerId: string; name: string }
  | { type: "UPDATE_SETTINGS"; playerId: string; settings: Partial<BouillotteSettings> }
  | { type: "START_GAME"; playerId: string; seed: number }
  | { type: "CARRE"; playerId: string; post: boolean }
  /** Pass while nobody has opened. */
  | { type: "CHECK"; playerId: string }
  | { type: "CALL"; playerId: string }
  /** Open (nothing bet yet) or raise, to this total bet. */
  | { type: "RAISE"; playerId: string; to: number }
  | { type: "ALL_IN"; playerId: string }
  | { type: "FOLD"; playerId: string }
  /** Host: deal the next hand. */
  | { type: "NEXT_HAND"; playerId: string }
  | { type: "RETURN_TO_LOBBY"; playerId: string };
