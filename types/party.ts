import type { Seed } from "./cards";
import type { BlackjackAction, BlackjackState } from "./blackjack";
import type { BsPokerAction, BsPokerState } from "./bs-poker";
import type { BasePlayer, GameMode, PlayerSeed } from "./game";
import type { GarbageAction, GarbageState } from "./garbage";
import type { HoldemAction, HoldemState } from "./holdem";
import type { RummyAction, RummyState } from "./rummy";
import type { WarAction, WarState } from "./war";
import type { GoFishAction, GoFishState } from "./gofish";
import type { ThirteenAction, ThirteenState } from "./thirteen";
import type { SpeedAction, SpeedState } from "./speed";
import type { BouillotteAction, BouillotteState } from "./bouillotte";

/** Whichever game the room has on the table; `mode` says which. */
export type ActiveGameState = BsPokerState | HoldemState | BlackjackState | GarbageState | RummyState | WarState | GoFishState | ThirteenState | SpeedState | BouillotteState;
export type ActiveGameAction = BsPokerAction | HoldemAction | BlackjackAction | GarbageAction | RummyAction | WarAction | GoFishAction | ThirteenAction | SpeedAction | BouillotteAction;

/** Someone in the room. They keep their seat and their wins across games. */
export interface PartyPlayer extends BasePlayer {
  /** Matches won tonight, across every game. */
  sessionWins: number;
}

/** "lobby": picking a game and its house rules. "post_game": the winner screen is up. */
export type RoomPhase = "lobby" | "in_game" | "post_game";

/**
 * One table in the room. Every table plays the room's game under the same house rules; the room
 * splits its people across them when there are more than one table seats.
 */
export interface PartyTable {
  id: string;
  /** Seats the host has opened here, within the game's limits. */
  seats: number;
  /** The game at this table. Its host is always the room's host, seated here or not. */
  state: ActiveGameState;
}

/**
 * One room code for the whole night. The roster and the scoreboard live here; the game on the
 * tables is swapped out underneath without anyone reconnecting.
 */
export interface PartyState {
  mode: "party";
  roomCode: string;
  version: number;
  hostId: string;
  phase: RoomPhase;
  /** Everyone in the room. Some may sit out a game that has fewer seats. */
  players: PartyPlayer[];
  selectedGame: GameMode;
  /**
   * The tables, each with the selected game's own state. In the lobby every table sits in its
   * lobby phase, holding the house rules (fresh defaults whenever the game changes) and who's
   * sitting there. Most rooms need just the one.
   */
  tables: PartyTable[];
  /** Wins of anyone who left, given back if they come back. */
  pastWins: Record<string, number>;
  /** Who won the match that just ended, at every table. */
  lastWinnerIds: string[];
}

export type PartyAction =
  | { type: "JOIN"; player: PlayerSeed }
  | { type: "LEAVE"; playerId: string }
  /** Host: put another game on the table, with its default house rules, back in the lobby. */
  | { type: "SWITCH_GAME"; playerId: string; newGameType: GameMode }
  /** Host, after a match: deal the same game and house rules again. */
  | { type: "PLAY_AGAIN"; playerId: string; seed: Seed }
  /** Host: back to the lobby, ending a match in progress. */
  | { type: "RETURN_TO_LOBBY"; playerId: string }
  /** Take a seat at another table (the host can also seat someone else, a bot say). Lobby only. */
  | { type: "SIT"; playerId: string; tableId: string; who?: string }
  /** Host: how many tables, and how many seats each. Lobby only. */
  | { type: "SET_TABLES"; playerId: string; seats: number[] }
  /** A move in the game itself, at the sender's table (or `tableId`, for bots and timers the host runs). */
  | { type: "GAME"; playerId: string; action: ActiveGameAction; tableId?: string };
