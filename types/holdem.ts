import type { Card } from "./cards";
import type { BasePlayer, PlayerSeed } from "./game";

export interface BlindIncrease {
  /** "never" keeps the blinds where they started. */
  mode: "never" | "every_n_hands";
  everyHands: number;
  multiplier: number;
}

export interface HoldemSettings {
  startingChips: number;
  /** The big blind is always twice the small blind. */
  smallBlind: number;
  blindIncrease: BlindIncrease;
}

export type Street = "preflop" | "flop" | "turn" | "river";

export interface HoldemPlayer extends BasePlayer {
  /** Chips behind, not yet put in. */
  chips: number;
  hand: Card[];
  status: "active" | "busted";
  /** Dealt into the current hand. */
  inHand: boolean;
  folded: boolean;
  allIn: boolean;
  /** Put in on the current street. */
  bet: number;
  /** Put in over the whole hand (what side pots are built from). */
  totalBet: number;
  /** Has acted since the last full raise on this street. */
  hasActed: boolean;
  bustedInHand?: number;
}

export type HoldemMove = "fold" | "check" | "call" | "bet" | "raise" | "all_in" | "small_blind" | "big_blind";

export interface LastAction {
  playerId: string;
  move: HoldemMove;
  /** Street total after the move, for bets, raises, blinds and all-ins. */
  amount?: number;
}

export interface PotResult {
  amount: number;
  eligibleIds: string[];
  winnerIds: string[];
  shares: Record<string, number>;
}

export interface HandResult {
  handNumber: number;
  /** True when everyone else folded: no cards are shown. */
  uncontested: boolean;
  pots: PotResult[];
  /** Hole cards turned over at showdown (players who didn't fold). */
  revealed: Record<string, Card[]>;
  /** Each shown player's best five cards and their name. */
  best: Record<string, { label: string; cardIds: string[] }>;
  /** Chips won this hand, by player. */
  won: Record<string, number>;
}

export type HoldemPhase = "lobby" | "betting" | "hand_over" | "game_over";

export interface HoldemState {
  mode: "texas-holdem";
  roomId: string;
  version: number;
  phase: HoldemPhase;
  settings: HoldemSettings;
  players: HoldemPlayer[];
  hostId: string;
  /** SECRET: PRNG state. */
  rngState: number;
  handNumber: number;
  buttonId: string | null;
  smallBlindId: string | null;
  bigBlindId: string | null;
  /** Blinds for the current hand. */
  smallBlind: number;
  bigBlind: number;
  street: Street;
  /** SECRET: all five board cards, drawn at the start of the hand. */
  boardCards: Card[];
  /** How many board cards are face up (0, 3, 4 or 5). */
  boardShown: number;
  /** SECRET: burned cards; views only get how many have been burned. */
  burnCards: Card[];
  burnsShown: number;
  currentTurnId: string | null;
  /** Highest street bet so far. */
  currentBet: number;
  /** Size of the last full raise: the smallest legal raise on top of `currentBet`. */
  minRaise: number;
  lastActions: Record<string, LastAction>;
  result: HandResult | null;
  winnerId: string | null;
}

export type HoldemAction =
  | { type: "JOIN_ROOM"; player: PlayerSeed }
  | { type: "LEAVE_ROOM"; playerId: string }
  | { type: "RENAME_PLAYER"; playerId: string; name: string }
  | { type: "UPDATE_SETTINGS"; playerId: string; settings: Partial<HoldemSettings> }
  | { type: "START_GAME"; playerId: string; seed: number }
  | { type: "FOLD"; playerId: string }
  | { type: "CHECK"; playerId: string }
  | { type: "CALL"; playerId: string }
  /** Bet or raise so your street total becomes `to`. */
  | { type: "RAISE"; playerId: string; to: number }
  | { type: "ALL_IN"; playerId: string }
  | { type: "NEXT_HAND"; playerId: string }
  | { type: "RETURN_TO_LOBBY"; playerId: string };
