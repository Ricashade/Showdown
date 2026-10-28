import type { Card } from "./cards";
import type { BasePlayer, PlayerSeed } from "./game";

export type FaceRole = "wild" | "dead";
export type FaceCard = "J" | "Q" | "K";

/** "queens-kings": Q and K wild, J dead (house default). "jacks": J wild, Q and K dead. */
export type FaceCardPreset = "queens-kings" | "jacks" | "custom";

export interface GarbageSettings {
  faceCardPreset: FaceCardPreset;
  /** What each face card does. Follows the preset unless it's "custom". */
  faceCards: Record<FaceCard, FaceRole>;
  /**
   * When someone clears their board, everyone else gets one last turn, then turns over their
   * face-down cards and may rearrange them to fill their board too.
   */
  lastTurn: boolean;
}

export interface GarbageSlot {
  /** SECRET: the face-down card still in this slot; null once it's been picked up. */
  hidden: Card | null;
  /** The face-up card placed here (its own number, or a wild). */
  shown: Card | null;
  /** End of round: the face-down card, turned over. Revealed cards can be swapped between slots. */
  revealed: Card | null;
}

export interface GarbagePlayer extends BasePlayer {
  /** Slots to fill this round: 10 at the start, one fewer for each round you win. */
  target: number;
  slots: GarbageSlot[];
  /** Cleared their board this round. */
  finished: boolean;
  /** Finished rearranging their revealed cards. */
  revealDone: boolean;
}

export interface GarbageRoundResult {
  round: number;
  /** Who cleared their board, in the order they did it. */
  finisherIds: string[];
  /** Of those, who cleared it by rearranging their revealed cards. */
  revealClearIds: string[];
  /** Slots each player has next round. */
  nextTargets: Record<string, number>;
}

export type GarbagePhase = "lobby" | "playing" | "reveal" | "round_over" | "game_over";

export interface GarbageState {
  mode: "garbage";
  roomId: string;
  version: number;
  phase: GarbagePhase;
  settings: GarbageSettings;
  players: GarbagePlayer[];
  hostId: string;
  /** SECRET: PRNG state. */
  rngState: number;
  /** SECRET: the draw pile, top card first. */
  stock: Card[];
  /** Face up, oldest first; the last card is the top. */
  discard: Card[];
  round: number;
  starterId: string | null;
  currentTurnId: string | null;
  /** The card in the current player's hand, face up for everyone. */
  active: Card | null;
  /** Where it came from: drawn, taken off the discard pile, or picked up from a slot. */
  activeFrom: { source: "stock" | "discard" } | { source: "slot"; slot: number } | null;
  /** Players still owed a last turn after someone cleared their board. */
  lastLap: string[] | null;
  result: GarbageRoundResult | null;
  winnerId: string | null;
}

export type GarbageAction =
  | { type: "JOIN_ROOM"; player: PlayerSeed }
  | { type: "LEAVE_ROOM"; playerId: string }
  | { type: "RENAME_PLAYER"; playerId: string; name: string }
  | { type: "UPDATE_SETTINGS"; playerId: string; settings: Partial<GarbageSettings> }
  | { type: "START_GAME"; playerId: string; seed: number }
  | { type: "DRAW"; playerId: string; source: "stock" | "discard" }
  /** Put the card in hand into one of your slots (0-based). */
  | { type: "PLACE"; playerId: string; slot: number }
  /** Throw away a card that can't be played; ends your turn. */
  | { type: "DISCARD"; playerId: string }
  /** Reveal: swap two of your revealed cards. */
  | { type: "SWAP_REVEALED"; playerId: string; from: number; to: number }
  /** Reveal: you're happy with your arrangement. */
  | { type: "REVEAL_DONE"; playerId: string }
  /** Reveal: the host ends it for everyone, as arranged. */
  | { type: "FINISH_REVEAL"; playerId: string }
  | { type: "NEXT_ROUND"; playerId: string }
  | { type: "RETURN_TO_LOBBY"; playerId: string };
