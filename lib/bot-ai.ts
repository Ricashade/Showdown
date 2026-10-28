/**
 * Bot players for every game.
 *
 * The one rule: a bot only ever sees its own seat's view. `decide*` take the host's full
 * state, but immediately redact it with the same `getPlayerView` the server uses for real
 * players, and hand the bot brain an observation built from that — never the state itself.
 */
import type { BsPokerAction, BsPokerState } from "@/types/bs-poker";
import type { HoldemAction, HoldemState } from "@/types/holdem";
import type { BlackjackAction, BlackjackState } from "@/types/blackjack";
import type { GarbageAction, GarbageState } from "@/types/garbage";
import type { RummyAction, RummyState } from "@/types/rummy";
import type { WarAction, WarState } from "@/types/war";
import type { GoFishAction, GoFishState } from "@/types/gofish";
import type { BotDifficulty } from "@/types/game";
import { getPlayerView } from "./bs-poker-game";
import { getHoldemView } from "./holdem-game";
import { getBlackjackView, MIN_BET } from "./blackjack-engine";
import { getGarbageView } from "./garbage-engine";
import { getRummyView } from "./rummy-engine";
import { getWarView } from "./war-engine";
import { getGoFishView } from "./gofish-engine";
import { getBSPokerBotAction, observeBsPoker } from "./bots/bs-poker-bot";
import { getHoldemBotAction, observeHoldem } from "./bots/holdem-bot";
import { getBlackjackBotAction, observeBlackjack } from "./bots/blackjack-bot";
import { arrangeRevealed, getGarbageBotAction, observeGarbage } from "./bots/garbage-bot";
import { getRummyBotAction, observeRummy } from "./bots/rummy-bot";
import { getWarBotAction, observeWar } from "./bots/war-bot";
import { getGoFishBotAction, observeGoFish } from "./bots/gofish-bot";
import { randomId } from "./multiplayer/room-code";

export { estimateBidProbability, getBSPokerBotAction, observeBsPoker } from "./bots/bs-poker-bot";
export { estimateHoldemEquity, getHoldemBotAction, observeHoldem, startingHandScore } from "./bots/holdem-bot";
export { basicStrategy, getBlackjackBotAction, observeBlackjack } from "./bots/blackjack-bot";
export { arrangeRevealed, chooseWildSlot, getGarbageBotAction, observeGarbage } from "./bots/garbage-bot";
export { getRummyBotAction, observeRummy } from "./bots/rummy-bot";
export { chooseWarCard, getWarBotAction, observeWar } from "./bots/war-bot";
export { chooseAsk, getGoFishBotAction, observeGoFish } from "./bots/gofish-bot";

/** How a game exposes its bots to the driver that runs them. */
export interface BotRunner<S, A> {
  /**
   * The bot whose turn it is, if any. `justDealt` adds time for the deal animation; `pace`
   * replaces the thinking time with a fixed delay (a chain of quick moves people can follow).
   */
  pending(state: S): { botId: string; justDealt: number; pace?: number } | null;
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

export const blackjackBots: BotRunner<BlackjackState, BlackjackAction> = {
  pending(s) {
    if (s.phase === "betting") {
      const p = s.players.find((x) => x.isBot && x.status === "active" && x.bet === 0 && x.chips >= MIN_BET);
      return p ? { botId: p.id, justDealt: 0 } : null;
    }
    if (s.phase === "insurance") {
      const p = s.players.find((x) => x.isBot && x.insurance === null);
      return p ? { botId: p.id, justDealt: 0 } : null;
    }
    if (s.phase !== "playing" || !s.currentTurnId) return null;
    const p = s.players.find((x) => x.id === s.currentTurnId);
    if (!p?.isBot) return null;
    // First move of the round: the cards are still flying out.
    const first = s.players.find((x) => x.hands.length > 0);
    const freshDeal = first?.id === p.id && p.hands.length === 1 && p.hands[0].cards.length === 2;
    return { botId: p.id, justDealt: freshDeal ? 1500 : 0 };
  },
  decide(s, botId, rng) {
    const obs = observeBlackjack(getBlackjackView(s, botId), botId);
    return obs ? getBlackjackBotAction(obs, difficultyOf(s.players, botId), rng) : null;
  },
};

/** Gap between the steps of a bot's chain, so people can follow it. */
export const GARBAGE_CHAIN_STEP_MS = 900;

export const garbageBots: BotRunner<GarbageState, GarbageAction> = {
  pending(s) {
    if (s.phase === "reveal") {
      // Bots tidy their revealed cards one swap at a time, so you can watch.
      const p = s.players.find((x) => x.isBot && !x.revealDone);
      return p ? { botId: p.id, justDealt: 0, pace: GARBAGE_CHAIN_STEP_MS } : null;
    }
    if (s.phase !== "playing" || !s.currentTurnId) return null;
    const p = s.players.find((x) => x.id === s.currentTurnId);
    if (!p?.isBot) return null;
    if (s.active) return { botId: p.id, justDealt: 0, pace: GARBAGE_CHAIN_STEP_MS };
    // First move of a round: the boards are still being dealt.
    const freshRound = s.discard.length === 1 && s.players.every((x) => x.slots.every((slot) => slot.shown === null));
    return { botId: p.id, justDealt: freshRound ? 1500 : 0 };
  },
  decide(s, botId, rng) {
    const view = getGarbageView(s, botId);
    if (view.phase === "reveal") return arrangeRevealed(view, botId);
    const obs = observeGarbage(view, botId);
    return obs ? getGarbageBotAction(obs, difficultyOf(s.players, botId), rng) : null;
  },
};

/** Gap between a Rummy bot's melds, lay-offs and discard, so people can follow along. */
export const RUMMY_PLAY_STEP_MS = 900;

export const rummyBots: BotRunner<RummyState, RummyAction> = {
  pending(s) {
    if (s.phase !== "playing" || !s.currentTurnId) return null;
    const p = s.players.find((x) => x.id === s.currentTurnId);
    if (!p?.isBot) return null;
    if (s.step === "play") return { botId: p.id, justDealt: 0, pace: RUMMY_PLAY_STEP_MS };
    // First draw of a round: the hands are still being dealt.
    const freshRound = s.melds.length === 0 && s.discard.length === 1 && s.players.every((x) => !x.meldedBefore);
    return { botId: p.id, justDealt: freshRound ? 1500 : 0 };
  },
  decide(s, botId, rng) {
    const obs = observeRummy(getRummyView(s, botId), botId);
    return obs ? getRummyBotAction(obs, difficultyOf(s.players, botId), rng) : null;
  },
};

/** Gap between a Go Fish bot's asks, so people can read who asked whom for what. */
export const GOFISH_ASK_MS = 1200;

export const goFishBots: BotRunner<GoFishState, GoFishAction> = {
  pending(s) {
    if (s.phase !== "playing" || !s.currentTurnId) return null;
    const p = s.players.find((x) => x.id === s.currentTurnId);
    if (!p?.isBot) return null;
    // The first ask waits for the deal.
    return { botId: p.id, justDealt: 0, pace: s.log.some((e) => e.kind === "ask") ? GOFISH_ASK_MS : GOFISH_ASK_MS + 1200 };
  },
  decide(s, botId, rng) {
    const obs = observeGoFish(getGoFishView(s, botId), botId);
    return obs ? getGoFishBotAction(obs, difficultyOf(s.players, botId), rng) : null;
  },
};

export const warBots: BotRunner<WarState, WarAction> = {
  pending(s) {
    if (s.phase !== "playing" || !s.sides) return null;
    const bot = s.sides.find((x) => !x.ready && s.players.find((p) => p.id === x.id)?.isBot);
    if (!bot) return null;
    const vsBot = s.sides.every((x) => s.players.find((p) => p.id === x.id)?.isBot);
    // Against a person, flip straight away so their flip settles it at once. Two bots slow
    // down enough to watch; picking a card in Tactical War takes a moment.
    const pace = vsBot ? 1100 : s.settings.mode === "tactical" ? 600 : 150;
    return { botId: bot.id, justDealt: 0, pace: s.stage === "war" && vsBot ? 2000 : pace };
  },
  decide(s, botId, rng) {
    const obs = observeWar(getWarView(s, botId), botId);
    return obs ? getWarBotAction(obs, difficultyOf(s.players, botId), rng) : null;
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
