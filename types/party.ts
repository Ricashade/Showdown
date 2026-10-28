import type { BlackjackAction, BlackjackState } from "./blackjack";
import type { BsPokerAction, BsPokerState } from "./bs-poker";
import type { BasePlayer, GameMode, PlayerSeed } from "./game";
import type { GarbageAction, GarbageState } from "./garbage";
import type { HoldemAction, HoldemState } from "./holdem";
import type { RummyAction, RummyState } from "./rummy";
import type { WarAction, WarState } from "./war";
import type { GoFishAction, GoFishState } from "./gofish";

/** Whichever game the room has on the table; `mode` says which. */
export type ActiveGameState = BsPokerState | HoldemState | BlackjackState | GarbageState | RummyState | WarState | GoFishState;
export type ActiveGameAction = BsPokerAction | HoldemAction | BlackjackAction | GarbageAction | RummyAction | WarAction | GoFishAction;

/** Someone in the room. They keep their seat and their wins across games. */
export interface PartyPlayer extends BasePlayer {
  /** Matches won tonight, across every game. */
  sessionWins: number;
}

/** "lobby": picking a game and its house rules. "post_game": the winner screen is up. */
export type RoomPhase = "lobby" | "in_game" | "post_game";

/**
 * One room code for the whole night. The roster and the scoreboard live here; the game on the
 * table is swapped out underneath without anyone reconnecting.
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
   * The selected game's own state. In the lobby it sits in its own lobby phase, holding that
   * game's house rules (fresh defaults whenever the game changes) and who's dealt in.
   */
  activeGameState: ActiveGameState;
  /** Wins of anyone who left, given back if they come back. */
  pastWins: Record<string, number>;
  /** Who won the match that just ended. */
  lastWinnerIds: string[];
}

export type PartyAction =
  | { type: "JOIN"; player: PlayerSeed }
  | { type: "LEAVE"; playerId: string }
  /** Host: put another game on the table, with its default house rules, back in the lobby. */
  | { type: "SWITCH_GAME"; playerId: string; newGameType: GameMode }
  /** Host, after a match: deal the same game and house rules again. */
  | { type: "PLAY_AGAIN"; playerId: string; seed: number }
  /** Host: back to the lobby, ending a match in progress. */
  | { type: "RETURN_TO_LOBBY"; playerId: string }
  /** A move in the game itself. */
  | { type: "GAME"; playerId: string; action: ActiveGameAction };
