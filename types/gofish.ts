import type { Card, Rank } from "./cards";
import type { BasePlayer, PlayerSeed } from "./game";

export interface GoFishSettings {
  /** Fishing up the rank you just asked for earns another turn. */
  luckyCatch: boolean;
  /** 4: books are four of a kind. 2: the pairs variant. */
  bookSize: 2 | 4;
  /** Cards an empty hand draws from the pond. */
  refill: 1 | 5;
  /** Show the ranks you know each player holds, from what they've asked for and taken. */
  memoryHelper: boolean;
}

export interface GoFishPlayer extends BasePlayer {
  /** SECRET: only the owner sees it. */
  hand: Card[];
  /** Ranks booked, in the order they were made (a rank can appear twice in the pairs variant). */
  books: Rank[];
}

/** Something that happened at the table, for the feed and for memory. */
export type GoFishEvent =
  | {
      n: number;
      kind: "ask";
      askerId: string;
      targetId: string;
      rank: Rank;
      /** Cards handed over; 0 means "Go fish!". */
      got: number;
      /** Went fishing and drew a card (the pond had one). */
      fished: boolean;
      /** Fished up the very rank asked for (only then is the drawn card shown). */
      lucky: boolean;
      /** The card a lucky catch turned up; any other draw stays private. */
      shown: Card | null;
      /** The asker goes again. */
      again: boolean;
    }
  | { n: number; kind: "book"; playerId: string; rank: Rank }
  /** An empty hand drew from the pond. */
  | { n: number; kind: "refill"; playerId: string; count: number };

export type GoFishPhase = "lobby" | "playing" | "game_over";

export interface GoFishState {
  mode: "go-fish";
  roomId: string;
  version: number;
  phase: GoFishPhase;
  settings: GoFishSettings;
  players: GoFishPlayer[];
  hostId: string;
  /** SECRET: PRNG state. */
  rngState: number;
  /** SECRET: the draw pile ("the pond"), top card first. */
  pond: Card[];
  currentTurnId: string | null;
  /** Everything so far, oldest first. */
  log: GoFishEvent[];
  /** Most books (more than one on a tie). */
  winnerIds: string[];
  /** The winner when there's exactly one. */
  winnerId: string | null;
}

export type GoFishAction =
  | { type: "JOIN_ROOM"; player: PlayerSeed }
  | { type: "LEAVE_ROOM"; playerId: string }
  | { type: "RENAME_PLAYER"; playerId: string; name: string }
  | { type: "UPDATE_SETTINGS"; playerId: string; settings: Partial<GoFishSettings> }
  | { type: "START_GAME"; playerId: string; seed: number }
  /** Ask another player for every card of a rank you hold. */
  | { type: "ASK"; playerId: string; targetId: string; rank: Rank }
  | { type: "RETURN_TO_LOBBY"; playerId: string };
