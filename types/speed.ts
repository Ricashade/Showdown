import type { Card, RngState, Seed } from "./cards";
import type { BasePlayer, PlayerSeed } from "./game";

/** "empty": the last card wins on its own. "slap": then race to hit Speed. */
export type SpeedWinBy = "empty" | "slap";

export interface SpeedSettings {
  /** Your hand fills back up to five by itself; otherwise you draw when you choose. */
  autoDraw: boolean;
  /** A card of the same rank as the top card also goes on. */
  allowSameRank: boolean;
  /** Two to four of a rank go down together in one move. */
  allowDoubles: boolean;
  winBy: SpeedWinBy;
  /** The two who play; everyone else watches. Null picks the first two seats. */
  duelistIds: [string, string] | null;
  /** After a game, the winner keeps their seat and the next player in line takes them on. */
  winnerStaysOn: boolean;
}

export type SpeedPlayer = BasePlayer;

export const HAND_SLOTS = 5;

/** One player's cards. */
export interface SpeedSide {
  id: string;
  /** SECRET: five slots, empty ones null. Only the owner sees them. */
  hand: (Card | null)[];
  /** SECRET order: face down, drawn from the end. */
  stock: Card[];
  /** Asked to flip new cards onto the middle. */
  flipVote: boolean;
  /** Host clock: their last card down (bots pace themselves from it). */
  lastPlayAt: number;
}

export type SpeedEvent =
  | { n: number; kind: "play"; by: string; cards: Card[]; pile: 0 | 1; at: number }
  /** New cards turned onto both piles; `reshuffled` when the spares were rebuilt from the piles first. */
  | { n: number; kind: "flip"; reshuffled: boolean; at: number }
  /** Someone slapped Speed before the player who went out did: they take a pile back. */
  | { n: number; kind: "caught"; by: string; caught: string; cards: number; at: number };

/**
 * "countdown": the piles are face down until 3, 2, 1. "live": everyone plays at once.
 * "stalled": nobody can go; new cards flip in a moment. "slap": someone went out; first to slap Speed decides it.
 */
export type SpeedPhase = "lobby" | "countdown" | "live" | "stalled" | "slap" | "game_over";

export interface SpeedState {
  mode: "speed";
  roomId: string;
  version: number;
  phase: SpeedPhase;
  settings: SpeedSettings;
  players: SpeedPlayer[];
  hostId: string;
  /** SECRET: PRNG state. */
  rngState: RngState;
  sides: [SpeedSide, SpeedSide] | null;
  /** The two piles in the middle, top card last. Face down during the countdown. */
  piles: [Card[], Card[]];
  /** SECRET order: the face-down spares either side, turned over when everyone is stuck. */
  spares: [Card[], Card[]];
  /** Host clock: when the countdown ends or a stall flips. */
  clockAt: number | null;
  /** Host clock: when the top of either pile last changed. */
  boardAt: number;
  /** Who just went out, while everyone races to slap Speed. */
  emptyId: string | null;
  /** The latest events, newest last (older ones are dropped). */
  log: SpeedEvent[];
  winnerIds: string[];
}

export type SpeedAction =
  | { type: "JOIN_ROOM"; player: PlayerSeed }
  | { type: "LEAVE_ROOM"; playerId: string }
  | { type: "RENAME_PLAYER"; playerId: string; name: string }
  | { type: "UPDATE_SETTINGS"; playerId: string; settings: Partial<SpeedSettings> }
  | { type: "START_GAME"; playerId: string; seed: Seed }
  /** Slam these cards (one, or a set of one rank) onto a pile, as it looked when you moved. */
  | { type: "PLAY"; playerId: string; cardIds: string[]; pile: 0 | 1; expectedTopId: string }
  /** Fill empty hand slots from your stock (when the hand doesn't refill itself). */
  | { type: "DRAW"; playerId: string }
  /** Ask (or stop asking) to flip new cards onto the middle. */
  | { type: "VOTE_FLIP"; playerId: string }
  | { type: "SLAP"; playerId: string }
  /** The host's clock: the countdown is over. */
  | { type: "GO"; playerId: string }
  /** The host's clock: turn new cards onto the piles. */
  | { type: "FLIP"; playerId: string }
  | { type: "RETURN_TO_LOBBY"; playerId: string };
