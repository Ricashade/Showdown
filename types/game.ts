/**
 * Mode-agnostic types shared by every game mode.
 */

export type GameMode = "bs-poker" | "texas-holdem" | "blackjack" | "garbage" | "rummy" | "war" | "go-fish" | "thirteen" | "speed" | "bouillotte";

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

/**
 * Ask a view function for everything (every hand, the whole board): solo tables and tests only.
 * A symbol, so it can never arrive over the network the way a player id can.
 */
export const GOD_VIEW: unique symbol = Symbol("god-view");
export type ViewerId = string | typeof GOD_VIEW;
