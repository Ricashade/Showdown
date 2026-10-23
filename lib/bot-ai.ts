/**
 * Bot players for both games.
 *
 * The one rule: a bot only ever sees its own seat's view. `decide*` take the host's full
 * state, but immediately redact it with the same `getPlayerView` the server uses for real
 * players, and hand the bot brain an observation built from that — never the state itself.
 */
import type { BsPokerAction, BsPokerState } from "@/types/bs-poker";
import type { HoldemAction, HoldemState } from "@/types/holdem";
import type { BotDifficulty } from "@/types/game";
import { getPlayerView } from "./bs-poker-game";
import { getHoldemView } from "./holdem-game";
import { getBSPokerBotAction, observeBsPoker } from "./bots/bs-poker-bot";
import { getHoldemBotAction, observeHoldem } from "./bots/holdem-bot";
import { randomId } from "./multiplayer/room-code";

export { estimateBidProbability, getBSPokerBotAction, observeBsPoker } from "./bots/bs-poker-bot";
export { estimateHoldemEquity, getHoldemBotAction, observeHoldem, startingHandScore } from "./bots/holdem-bot";

/** How a game exposes its bots to the driver that runs them. */
export interface BotRunner<S, A> {
  /** The bot whose turn it is, if any. `justDealt` adds time for the deal animation. */
  pending(state: S): { botId: string; justDealt: number } | null;
  decide(state: S, botId: string, rng?: () => number): A | null;
}

const difficultyOf = (players: { id: string; botDifficulty?: BotDifficulty }[], id: string): BotDifficulty =>
  players.find((p) => p.id === id)?.botDifficulty ?? "medium";

export const bsPokerBots: BotRunner<BsPokerState, BsPokerAction> = {
  pending(s) {
    if (s.phase !== "bidding" || !s.currentTurnPlayerId) return null;
    const p = s.players.find((x) => x.id === s.currentTurnPlayerId);
    if (!p?.isBot) return null;
    // A fresh round is still being shuffled and dealt on everyone's screen.
    return { botId: p.id, justDealt: s.bidHistory.length === 0 ? 3600 : 0 };
  },
  decide(s, botId, rng) {
    const obs = observeBsPoker(getPlayerView(s, botId), botId);
    return obs ? getBSPokerBotAction(obs, difficultyOf(s.players, botId), rng) : null;
  },
};

export const holdemBots: BotRunner<HoldemState, HoldemAction> = {
  pending(s) {
    if (s.phase !== "betting" || !s.currentTurnId) return null;
    const p = s.players.find((x) => x.id === s.currentTurnId);
    if (!p?.isBot) return null;
    const moves = Object.values(s.lastActions).map((a) => a.move);
    const handJustDealt = s.street === "preflop" && moves.every((m) => m === "small_blind" || m === "big_blind");
    const streetJustDealt = s.street !== "preflop" && !moves.some((m) => m === "check" || m === "call" || m === "bet" || m === "raise");
    return { botId: p.id, justDealt: handJustDealt ? 3600 : streetJustDealt ? 1400 : 0 };
  },
  decide(s, botId, rng) {
    const obs = observeHoldem(getHoldemView(s, botId), botId);
    return obs ? getHoldemBotAction(obs, difficultyOf(s.players, botId), rng) : null;
  },
};

// ---------------------------------------------------------------------------
// Seating bots
// ---------------------------------------------------------------------------

const BOT_NAMES: Record<BotDifficulty, string[]> = {
  easy: ["Bot Benny", "Lucky Lou", "Chatty Cathy", "Rookie Rita", "Bingo Bob", "Penny Slots", "Daisy Deuce", "Friendly Fred"],
  medium: ["Calculated Clara", "Steady Eddie", "Careful Carl", "Measured Mia", "Solid Sam", "Even Steven", "Tidy Tina", "Patient Pat"],
  hard: ["Shark Vinnie", "Ice Cold Ivy", "Razor Rex", "The Professor", "Stone Face Sal", "Nails Natalie", "Ace Archer", "Silent Sid"],
};

export const DIFFICULTY_LABEL: Record<BotDifficulty, string> = { easy: "Easy", medium: "Medium", hard: "Hard" };

/** A new bot seat with a name nobody at the table is using. */
export function newBot(difficulty: BotDifficulty, takenNames: string[]) {
  const free = BOT_NAMES[difficulty].filter((n) => !takenNames.includes(n));
  const pool = free.length ? free : BOT_NAMES[difficulty];
  const name = pool[Math.floor(Math.random() * pool.length)];
  return { id: randomId("bot"), name, isBot: true, botDifficulty: difficulty };
}

/** Human-ish thinking time before a bot acts, in ms. */
export const thinkingTime = (rng: () => number = Math.random) => 900 + Math.floor(rng() * 900);
