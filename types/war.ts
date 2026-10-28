import type { Card } from "./cards";
import type { BasePlayer, PlayerSeed } from "./game";

/** "classic": flip the top card. "tactical": hold three cards and pick one each battle. */
export type WarMode = "classic" | "tactical";

/** "domination": take every card. "forty": first to 40. "blitz": most cards after 50 battles. */
export type WarWinCondition = "domination" | "forty" | "blitz";

export interface WarSettings {
  mode: WarMode;
  /** Face-down cards each side puts in a War before the deciding card. */
  bounty: 1 | 2 | 3;
  winCondition: WarWinCondition;
  /** Two Jokers that beat everything. */
  jokers: boolean;
  /** The two players who duel; everyone else watches. Null picks the first two seats. */
  duelistIds: [string, string] | null;
}

export type WarPlayer = BasePlayer;

/** One duelist's cards. */
export interface WarSide {
  id: string;
  /** SECRET: face down, top card first. */
  draw: Card[];
  /** SECRET order: cards won, shuffled into `draw` when it runs out. */
  won: Card[];
  /** Tactical only. SECRET: only the owner sees it. */
  hand: Card[];
  /** Committed to the current flip. Tactical: which card (SECRET until both have played). */
  ready: boolean;
  playedId: string | null;
}

/** A card on the table, in the order it was laid. */
export interface Laid {
  card: Card;
  faceUp: boolean;
  /** Settled battles only: it went down face down as War bounty. */
  bounty?: boolean;
}

/** What happened in the last battle, for everyone to see (bounty cards turned up). */
export interface WarClash {
  number: number;
  /** Each side's cards, in the order laid; War bounties included, all face up now. */
  laid: Record<string, Laid[]>;
  /** Wars it took to settle (0 for a plain battle). */
  wars: number;
  winnerId: string;
  cards: number;
}

export type WarPhase = "lobby" | "playing" | "game_over";

export interface WarState {
  mode: "war";
  roomId: string;
  version: number;
  phase: WarPhase;
  settings: WarSettings;
  players: WarPlayer[];
  hostId: string;
  /** SECRET: PRNG state. */
  rngState: number;
  sides: [WarSide, WarSide] | null;
  /** "battle": waiting for both to flip. "war": a tie is on the table; flip again to settle it. */
  stage: "battle" | "war";
  /** Cards on the table right now, by side. Face-down bounties are SECRET until settled. */
  table: Record<string, Laid[]>;
  /** Wars stacked up in the current battle. */
  wars: number;
  /** Battles settled so far. */
  battles: number;
  last: WarClash | null;
  winnerId: string | null;
}

export type WarAction =
  | { type: "JOIN_ROOM"; player: PlayerSeed }
  | { type: "LEAVE_ROOM"; playerId: string }
  | { type: "RENAME_PLAYER"; playerId: string; name: string }
  | { type: "UPDATE_SETTINGS"; playerId: string; settings: Partial<WarSettings> }
  | { type: "START_GAME"; playerId: string; seed: number }
  /** Classic: flip your top card (or, in a War, your bounty and deciding card). */
  | { type: "FLIP"; playerId: string }
  /** Tactical: play this card from your hand. */
  | { type: "PLAY"; playerId: string; cardId: string }
  | { type: "RETURN_TO_LOBBY"; playerId: string };
