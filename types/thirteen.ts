import type { Card, Rank, Suit } from "./cards";
import type { BasePlayer, PlayerSeed } from "./game";

/**
 * Two bombs of the same tier and top rank (only possible with Jokers, or pairs split by suit):
 * "natural": a bomb without Jokers wins, then the highest suit in the top rank.
 * "strict": neither beats the other. "challenger": the later one wins.
 */
export type BombTiebreaker = "natural" | "strict" | "challenger";

export interface ThirteenSettings {
  /** Someone who passed can still come back into the trick with a bomb. */
  bombAfterPass: boolean;
  bombTiebreaker: BombTiebreaker;
  /** The 3♠ opens every hand; otherwise the last hand's winner leads anything. */
  threeSpadesEveryHand: boolean;
  /** The three who play; everyone else watches. Null picks the first three seats. */
  seatIds: [string, string, string] | null;
  /** After a hand, the winner keeps their seat and whoever held the most cards makes way for the next in line. */
  winnerStaysOn: boolean;
}

export type ThirteenPlayer = BasePlayer;

/** One of the three playing. */
export interface ThirteenSeat {
  id: string;
  /** SECRET: only the owner sees it. */
  hand: Card[];
  /** Passed in this trick: locked out of it (bombs aside, if the house allows). */
  passed: boolean;
}

export type ComboType = "single" | "pair" | "triple" | "straight" | "bomb";

/** What a Joker stands for in a play: a rank, and a suit in a suited dragon. */
export interface JokerAs {
  rank: Rank;
  suit?: Suit;
}

/** One way to read a set of cards as a play. */
export interface Combo {
  type: ComboType;
  size: number;
  /** Highest rank in it (Ace in a run; 2 tops everything). */
  top: Rank;
  /** Lowest rank: where a run starts. */
  low: Rank;
  /** Suit strength (♠ 0 … ♥ 3) of the best natural card at the top rank; -1 when only Jokers stand there. */
  topSuit: number;
  jokers: number;
  /** Bombs only: 1 (weakest) to 17 (strongest); 0 for everything else. */
  tier: number;
  /** What each Joker in the play stands for, in the order the Jokers appear. */
  jokerAs: JokerAs[];
}

export interface ThirteenPlay {
  by: string;
  cards: Card[];
  combo: Combo;
  /** It came down on 2s or on a weaker bomb. */
  chop: "twos" | "bomb" | null;
}

export type ThirteenEvent =
  | ({ n: number; kind: "play" } & ThirteenPlay)
  | { n: number; kind: "pass"; by: string }
  /** Everyone else passed: the trick is cleared and `leader` leads the next. */
  | { n: number; kind: "clear"; leader: string };

export type ThirteenPhase = "lobby" | "playing" | "game_over";

export interface ThirteenState {
  mode: "thirteen";
  roomId: string;
  version: number;
  phase: ThirteenPhase;
  settings: ThirteenSettings;
  players: ThirteenPlayer[];
  hostId: string;
  /** SECRET: PRNG state. */
  rngState: number;
  /** The three at the table, in turn order. */
  seats: ThirteenSeat[] | null;
  currentTurnId: string | null;
  /** Plays in the current trick, oldest first. Empty: the player to act leads. */
  trick: ThirteenPlay[];
  /** Passes in a row since the last play; the trick clears when everyone else has passed. */
  passStreak: number;
  /** The hand's first play must include the 3♠. */
  openWith3S: boolean;
  log: ThirteenEvent[];
  winnerId: string | null;
  /** Who won the last hand at this table; they lead the next one (unless the 3♠ always opens). */
  lastWinnerId: string | null;
}

export type ThirteenAction =
  | { type: "JOIN_ROOM"; player: PlayerSeed }
  | { type: "LEAVE_ROOM"; playerId: string }
  | { type: "RENAME_PLAYER"; playerId: string; name: string }
  | { type: "UPDATE_SETTINGS"; playerId: string; settings: Partial<ThirteenSettings> }
  | { type: "START_GAME"; playerId: string; seed: number }
  /** Play these cards. `read` picks how Jokers count (a `comboKey`); left out, the strongest reading that's allowed. */
  | { type: "PLAY"; playerId: string; cardIds: string[]; read?: string }
  | { type: "PASS"; playerId: string }
  | { type: "RETURN_TO_LOBBY"; playerId: string };
