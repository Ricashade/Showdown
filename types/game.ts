/**
 * Mode-agnostic types shared by every game mode (BS Poker now, Texas Hold'em later).
 */

export type GameMode = "bs-poker" | "texas-holdem";

export type BotDifficulty = "easy" | "medium" | "hard";

/** What a client sends to join a room. */
export interface PlayerSeed {
  id: string;
  name: string;
  isBot?: boolean;
  botDifficulty?: BotDifficulty;
}

/** Base player shape every mode extends. */
export interface BasePlayer {
  id: string;
  name: string;
  isBot: boolean;
  botDifficulty?: BotDifficulty;
  isHost: boolean;
}

export type ActionResult<S> =
  | { ok: true; state: S }
  | { ok: false; error: string; state: S };
