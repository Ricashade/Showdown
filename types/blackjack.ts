import type { Card } from "./cards";
import type { BasePlayer, PlayerSeed } from "./game";

export interface BlackjackSettings {
  startingChips: number;
  /** Decks in the shoe. */
  decks: number;
  /** Seconds to place bets (and to decide on insurance). */
  betSeconds: number;
}

export type HandOutcome = "blackjack" | "win" | "push" | "lose" | "bust";

export interface BlackjackHand {
  cards: Card[];
  bet: number;
  doubled: boolean;
  /** Made by splitting: 21 here is not a blackjack. */
  fromSplit: boolean;
  /** No more cards for this hand (stood, bust, 21, doubled, or split aces). */
  done: boolean;
  /** Filled in when the round is settled. */
  outcome?: HandOutcome;
  /** Chips handed back for this hand, stake included. */
  payout?: number;
}

export interface BlackjackPlayer extends BasePlayer {
  /** Chips behind, not on the table. */
  chips: number;
  status: "active" | "busted";
  /** The bet placed for the next deal (betting phase only). 0 = sitting this one out. */
  bet: number;
  /** Last bet that was dealt, offered again as "Same bet". */
  lastBet: number;
  /** This round's hands; empty when not dealt in. */
  hands: BlackjackHand[];
  /** null = still deciding; 0 = declined. Only asked when the dealer shows an Ace. */
  insurance: number | null;
  bustedInRound?: number;
}

export type BlackjackPhase = "lobby" | "betting" | "insurance" | "playing" | "dealer" | "settled" | "game_over";

export interface RoundResult {
  roundNumber: number;
  dealerTotal: number;
  dealerBust: boolean;
  dealerBlackjack: boolean;
  /** Chips won (+) or lost (−) this round, by player, insurance included. */
  net: Record<string, number>;
  /** Insurance paid out, by player (only when the dealer had blackjack). */
  insuranceWon: Record<string, number>;
}

export interface BlackjackState {
  mode: "blackjack";
  roomId: string;
  version: number;
  phase: BlackjackPhase;
  settings: BlackjackSettings;
  players: BlackjackPlayer[];
  hostId: string;
  /** SECRET: PRNG state. */
  rngState: number;
  /** SECRET: the cards left in the shoe, next card first. */
  shoe: Card[];
  /** When the shoe gets this small, it's reshuffled before the next deal. */
  cutCard: number;
  /** cards[1] is the hole card: SECRET until `holeRevealed`. */
  dealer: { cards: Card[]; holeRevealed: boolean };
  roundNumber: number;
  currentTurnId: string | null;
  /** Which of the current player's hands is being played. */
  currentHand: number;
  /** ms timestamp (host clock) when the current timer runs out; null when nothing is timed. */
  deadline: number | null;
  result: RoundResult | null;
}

export type BlackjackAction =
  | { type: "JOIN_ROOM"; player: PlayerSeed }
  | { type: "LEAVE_ROOM"; playerId: string }
  | { type: "RENAME_PLAYER"; playerId: string; name: string }
  | { type: "UPDATE_SETTINGS"; playerId: string; settings: Partial<BlackjackSettings> }
  | { type: "START_GAME"; playerId: string; seed: number }
  /** Amount 0 takes the bet back. */
  | { type: "PLACE_BET"; playerId: string; amount: number }
  | { type: "INSURANCE"; playerId: string; take: boolean }
  | { type: "HIT"; playerId: string }
  | { type: "STAND"; playerId: string }
  | { type: "DOUBLE"; playerId: string }
  | { type: "SPLIT"; playerId: string }
  /** Host's clock: the betting, insurance or turn timer ran out. */
  | { type: "TIME_UP"; playerId: string }
  /** Host's clock: the dealer turns the hole card or draws one. */
  | { type: "DEALER_STEP"; playerId: string }
  | { type: "NEXT_ROUND"; playerId: string }
  | { type: "RETURN_TO_LOBBY"; playerId: string };
