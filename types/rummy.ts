import type { Card } from "./cards";
import type { BasePlayer, PlayerSeed } from "./game";

export type RummyVariant = "classic" | "rummy500";

/** "low": A-2-3 only. "both": A-2-3 or Q-K-A. "wrap": K-A-2 too. */
export type AceRule = "low" | "both" | "wrap";

export interface RummySettings {
  variant: RummyVariant;
  aceRule: AceRule;
  /** Points that win the match; null plays a single hand. */
  targetScore: number | null;
  /** Two Jokers per deck, wild in any meld. */
  jokers: boolean;
  /** Cards each with two players (three or more always get 7). */
  twoPlayerHand: 10 | 13;
}

export interface Meld {
  id: string;
  kind: "set" | "run";
  /** In order: runs low to high, Jokers where they stand in. */
  cards: Card[];
  /** Who put each card down (Rummy 500 credits them its points). */
  placedBy: Record<string, string>;
}

export interface RummyPlayer extends BasePlayer {
  /** SECRET: only the owner sees their hand. */
  hand: Card[];
  /** Match score so far. */
  score: number;
  /** Put something on the table on an earlier turn this round (no Rummy bonus then). */
  meldedBefore: boolean;
  /** Has melded or laid off this turn. */
  meldedThisTurn: boolean;
}

export interface RummyRoundResult {
  round: number;
  /** Who went out; null if the cards ran out first. */
  winnerId: string | null;
  /** Went out in one turn without having melded before: double points. */
  rummy: boolean;
  /** Points scored this round, by player (Rummy 500 can be negative). */
  points: Record<string, number>;
  /** What was left in each hand. */
  leftover: Record<string, Card[]>;
}

export type RummyPhase = "lobby" | "playing" | "round_over" | "game_over";

export interface RummyState {
  mode: "rummy";
  roomId: string;
  version: number;
  phase: RummyPhase;
  settings: RummySettings;
  players: RummyPlayer[];
  hostId: string;
  /** SECRET: PRNG state. */
  rngState: number;
  /** SECRET: the draw pile, top card first. */
  stock: Card[];
  /** Face up, oldest first; the last card is the top. */
  discard: Card[];
  melds: Meld[];
  nextMeldId: number;
  round: number;
  dealerId: string | null;
  currentTurnId: string | null;
  step: "draw" | "play";
  /** Rummy 500: a card dug out of the discard pile that must be played this turn. */
  mustPlayId: string | null;
  /** The card each player last took from the discard pile (bots watch these). */
  lastPickup: Record<string, Card>;
  result: RummyRoundResult | null;
  winnerId: string | null;
}

export type RummyAction =
  | { type: "JOIN_ROOM"; player: PlayerSeed }
  | { type: "LEAVE_ROOM"; playerId: string }
  | { type: "RENAME_PLAYER"; playerId: string; name: string }
  | { type: "UPDATE_SETTINGS"; playerId: string; settings: Partial<RummySettings> }
  | { type: "START_GAME"; playerId: string; seed: number }
  | { type: "DRAW_STOCK"; playerId: string }
  /** Take the discard at `index` and everything above it (Classic: only the top card). */
  | { type: "DRAW_DISCARD"; playerId: string; index: number }
  | { type: "MELD"; playerId: string; cardIds: string[] }
  | { type: "LAY_OFF"; playerId: string; cardIds: string[]; meldId: string }
  | { type: "DISCARD"; playerId: string; cardId: string }
  | { type: "NEXT_ROUND"; playerId: string }
  | { type: "RETURN_TO_LOBBY"; playerId: string };
