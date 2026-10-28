/**
 * Mode-agnostic types shared by every game mode.
 */

export type GameMode = "bs-poker" | "texas-holdem" | "blackjack" | "garbage" | "rummy" | "war";

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
