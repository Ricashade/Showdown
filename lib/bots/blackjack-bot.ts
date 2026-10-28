/**
 * Blackjack bots. Everything here works from a `BlackjackObservation`: the bot's own hand,
 * the dealer's up card and its chips. Nobody's hole card, and not the shoe.
 */
import type { Card } from "@/types/cards";
import type { BlackjackAction } from "@/types/blackjack";
import type { BotDifficulty } from "@/types/game";
import { cardValue, CHIP_VALUES, getBlackjackLegal, handValue, isPair, MIN_BET, type BlackjackLegal, type BlackjackView } from "@/lib/blackjack-engine";

export interface BlackjackObservation {
  myId: string;
  phase: "betting" | "insurance" | "playing";
  chips: number;
  lastBet: number;
  startingChips: number;
  /** The hand being played (playing phase only). */
  hand: Card[];
  /** 2–11, Ace = 11. */
  dealerUp: number;
  legal: BlackjackLegal;
}

/** Build the observation from the bot's own redacted view; null when it has nothing to decide. */
export function observeBlackjack(view: BlackjackView, botId: string): BlackjackObservation | null {
  const me = view.players.find((p) => p.id === botId);
  const legal = getBlackjackLegal(view, botId);
  if (!me) return null;
  const phase = view.phase;
  const deciding =
    (phase === "betting" && legal.canBet && me.bet === 0) || (phase === "insurance" && legal.insuranceOffer !== null) || legal.isMyTurn;
  if (!deciding || (phase !== "betting" && phase !== "insurance" && phase !== "playing")) return null;
  const up = view.dealer.cards[0];
  return {
    myId: botId,
    phase,
    chips: me.chips,
    lastBet: me.lastBet,
    startingChips: view.settings.startingChips,
    hand: me.hands[view.currentHand]?.cards ?? [],
    dealerUp: up ? cardValue(up) : 0,
    legal,
  };
}

export type BasicMove = "hit" | "stand" | "double" | "split";

/**
 * Basic strategy for a multi-deck shoe where the dealer hits soft 17 and doubling after a split
 * is allowed. Falls back sensibly when doubling or splitting isn't possible.
 */
export function basicStrategy(hand: Card[], dealerUp: number, can: { double: boolean; split: boolean }): BasicMove {
  const up = dealerUp;
  const dbl = (orElse: "hit" | "stand"): BasicMove => (can.double ? "double" : orElse);

  if (can.split && isPair(hand)) {
    const v = cardValue(hand[0]);
    const split =
      v === 11 ||
      v === 8 ||
      (v === 9 && up !== 7 && up < 10) ||
      (v === 7 && up <= 7) ||
      (v === 6 && up <= 6) ||
      (v === 4 && (up === 5 || up === 6)) ||
      ((v === 2 || v === 3) && up <= 7);
    if (split) return "split";
  }

  const { total, soft } = handValue(hand);
  if (soft) {
    if (total >= 20) return "stand";
    if (total === 19) return up === 6 ? dbl("stand") : "stand";
    if (total === 18) return up <= 6 ? dbl("stand") : up <= 8 ? "stand" : "hit";
    if (total === 17) return up >= 3 && up <= 6 ? dbl("hit") : "hit";
    if (total >= 15) return up >= 4 && up <= 6 ? dbl("hit") : "hit";
    return up >= 5 && up <= 6 ? dbl("hit") : "hit";
  }
  if (total >= 17) return "stand";
  if (total >= 13) return up <= 6 ? "stand" : "hit";
  if (total === 12) return up >= 4 && up <= 6 ? "stand" : "hit";
  if (total === 11) return dbl("hit");
  if (total === 10) return up <= 9 ? dbl("hit") : "hit";
  if (total === 9) return up >= 3 && up <= 6 ? dbl("hit") : "hit";
  return "hit";
}

/** The rule of thumb: hit 11 or less, stand on 12–16 against a 2–6, hit them against 7–A. */
function simpleStrategy(hand: Card[], dealerUp: number, can: { double: boolean; split: boolean }): BasicMove {
  if (can.split && isPair(hand) && (cardValue(hand[0]) === 11 || cardValue(hand[0]) === 8)) return "split";
  const { total, soft } = handValue(hand);
  if (can.double && !soft && (total === 11 || (total === 10 && dealerUp <= 9))) return "double";
  if (soft) return total >= 18 ? "stand" : "hit";
  if (total <= 11) return "hit";
  if (total >= 17) return "stand";
  return dealerUp <= 6 ? "stand" : "hit";
}

const roundTo = (n: number, step: number) => Math.round(n / step) * step;

function chooseBet(obs: BlackjackObservation, difficulty: BotDifficulty, rng: () => number): number {
  const { chips } = obs;
  let bet: number;
  if (difficulty === "easy") {
    bet = CHIP_VALUES[Math.floor(rng() * CHIP_VALUES.length)];
  } else if (difficulty === "medium") {
    bet = obs.lastBet || Math.max(MIN_BET, roundTo(obs.startingChips * 0.025, 5));
  } else {
    // A steady slice of what's left, so a bad run doesn't wipe it out.
    bet = Math.max(MIN_BET, roundTo(chips * 0.04, 5));
  }
  return Math.max(MIN_BET, Math.min(chips, bet));
}

export function getBlackjackBotAction(obs: BlackjackObservation, difficulty: BotDifficulty, rng: () => number = Math.random): BlackjackAction | null {
  const playerId = obs.myId;
  if (obs.phase === "betting") return { type: "PLACE_BET", playerId, amount: chooseBet(obs, difficulty, rng) };
  // Insurance is a losing bet; only an easy bot is tempted.
  if (obs.phase === "insurance") return { type: "INSURANCE", playerId, take: difficulty === "easy" && rng() < 0.4 };

  const can = { double: obs.legal.canDouble, split: obs.legal.canSplit };
  let move: BasicMove;
  if (difficulty === "hard") move = basicStrategy(obs.hand, obs.dealerUp, can);
  else if (difficulty === "medium") move = simpleStrategy(obs.hand, obs.dealerUp, can);
  else {
    // Easy plays by feel: hit until it's scared of busting, sometimes a card early or late.
    const { total } = handValue(obs.hand);
    const nerve = 14 + Math.floor(rng() * 4);
    move = total < nerve ? "hit" : "stand";
  }
  const type = ({ hit: "HIT", stand: "STAND", double: "DOUBLE", split: "SPLIT" } as const)[move];
  return { type, playerId };
}
