import type { Card, Rank, Suit } from "./cards";
import type { BasePlayer, PlayerSeed } from "./game";

export type HandType =
  | "HIGH_CARD"
  | "PAIR"
  | "TWO_PAIR"
  | "THREE_OF_A_KIND"
  | "STRAIGHT"
  | "FLUSH"
  | "FULL_HOUSE"
  | "FOUR_OF_A_KIND"
  | "STRAIGHT_FLUSH";

/**
 * A bid names a hand that is claimed to exist somewhere in the combined pool.
 * - STRAIGHT / STRAIGHT_FLUSH `high`: 5 (A-2-3-4-5) through 14 (A-high / Royal).
 * - FLUSH `high`: 6 through 14 — five cards of ONE suit whose top card is exactly `high`.
 */
export type Bid =
  | { type: "HIGH_CARD"; rank: Rank }
  | { type: "PAIR"; rank: Rank }
  | { type: "TWO_PAIR"; high: Rank; low: Rank }
  | { type: "THREE_OF_A_KIND"; rank: Rank }
  | { type: "STRAIGHT"; high: Rank }
  | { type: "FLUSH"; high: Rank }
  | { type: "FULL_HOUSE"; trips: Rank; pair: Rank }
  | { type: "FOUR_OF_A_KIND"; rank: Rank }
  | { type: "STRAIGHT_FLUSH"; high: Rank };

/** Hand types the host can switch off. */
export type RestrictableHand = "STRAIGHT" | "FLUSH" | "STRAIGHT_FLUSH";

export type HandRuleMode = "enabled" | "disabled" | "threshold";

export interface HandRule {
  mode: HandRuleMode;
  /** With mode "threshold": banned for any round where an active player holds >= this many cards. */
  threshold: number;
}

export interface BsPokerSettings {
  deucesWild: boolean;
  includeJokers: boolean;
  handRules: Record<RestrictableHand, HandRule>;
  startingCards: number;
  /** A player holding this many cards who loses again busts. */
  maxCards: number;
}

export type PlayerStatus = "active" | "eliminated";

export interface BsPokerPlayer extends BasePlayer {
  /** Cards this player will be / is dealt this round. */
  cardCount: number;
  hand: Card[];
  status: PlayerStatus;
  eliminatedInRound?: number;
}

export interface BidEntry {
  playerId: string;
  bid: Bid;
}

export interface WildAssignment {
  cardId: string;
  rank: Rank;
  /** Set when the wild must also be a specific suit (flushes / straight flushes). */
  suit?: Suit;
}

export interface BidEvaluation {
  exists: boolean;
  /** Cards that make the hand (or the closest partial attempt when it doesn't exist). */
  cardIds: string[];
  wildAssignments: WildAssignment[];
  wildsNeeded: number;
  wildsAvailable: number;
  summary: string;
}

export interface ShowdownResult {
  round: number;
  callerId: string;
  bidderId: string;
  bid: Bid;
  evaluation: BidEvaluation;
  loserId: string;
  loserBusted: boolean;
  /** Loser's card count for the next round (unchanged if busted). */
  loserNewCardCount: number;
  revealedHands: Record<string, Card[]>;
  /** The face-up table cards that were part of the pool. */
  tableCards: Card[];
}

export type BsPokerPhase = "lobby" | "bidding" | "showdown" | "game_over";

/**
 * The single serializable source of truth. Every transition goes through the pure
 * functions in lib/bs-poker-game.ts so a server (Supabase / PartyKit / API route)
 * can run the exact same code authoritatively.
 */
export interface BsPokerState {
  mode: "bs-poker";
  roomId: string;
  /** Incremented on every successful action — use for optimistic concurrency later. */
  version: number;
  phase: BsPokerPhase;
  settings: BsPokerSettings;
  players: BsPokerPlayer[];
  hostId: string;
  round: number;
  /** SECRET: PRNG state. Never send to clients — it predicts future deals. */
  rngState: number;
  roundStarterId: string | null;
  currentTurnPlayerId: string | null;
  /** Shared face-up cards dealt each round. Every bid counts these plus all players' hands. */
  tableCards: Card[];
  /** SECRET: cards burned before each run of table cards. Never revealed; views get only a count. */
  burnCards: Card[];
  currentBid: BidEntry | null;
  bidHistory: BidEntry[];
  /** Hand types nobody may bid this round (fixed when the round is dealt). */
  disabledHandTypes: HandType[];
  showdown: ShowdownResult | null;
  winnerId: string | null;
}

export type BsPokerAction =
  | { type: "JOIN_ROOM"; player: PlayerSeed }
  | { type: "LEAVE_ROOM"; playerId: string }
  | { type: "RENAME_PLAYER"; playerId: string; name: string }
  | { type: "UPDATE_SETTINGS"; playerId: string; settings: Partial<BsPokerSettings> }
  | { type: "START_GAME"; playerId: string; seed: number }
  | { type: "PLACE_BID"; playerId: string; bid: Bid }
  | { type: "CALL_BS"; playerId: string }
  | { type: "NEXT_ROUND"; playerId: string }
  | { type: "RETURN_TO_LOBBY"; playerId: string };
