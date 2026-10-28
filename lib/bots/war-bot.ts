/**
 * War bots. Classic War has no choices, so bots just flip. In Tactical War they pick from a
 * three-card hand, seeing only their own hand, the table and card counts.
 */
import type { Card } from "@/types/cards";
import type { BotDifficulty } from "@/types/game";
import type { WarAction } from "@/types/war";
import { getWarLegal, warRank, type WarView } from "@/lib/war-engine";

export interface WarObservation {
  myId: string;
  tactical: boolean;
  hand: Card[];
  /** A War is on: the pot is big. */
  atWar: boolean;
  /** Cards each side holds. */
  myCount: number;
  theirCount: number;
  /** Face-up cards on the table right now. */
  tableUp: Card[];
  /** Aces, Kings (and Jokers) in the whole deck. */
  highTotal: number;
}

export function observeWar(view: WarView, botId: string): WarObservation | null {
  const legal = getWarLegal(view, botId);
  if (!legal.canAct || !view.sides) return null;
  const me = view.sides.find((x) => x.id === botId)!;
  const them = view.sides.find((x) => x.id !== botId)!;
  return {
    myId: botId,
    tactical: view.settings.mode === "tactical",
    hand: legal.hand,
    atWar: view.stage === "war",
    myCount: me.count,
    theirCount: them.count,
    tableUp: Object.values(view.table).flat().filter((c): c is Card => c !== null),
    highTotal: 8 + (view.settings.jokers ? 2 : 0),
  };
}

const HIGH = 13;
const byRank = (cards: Card[]) => [...cards].sort((a, b) => warRank(a) - warRank(b));

export function chooseWarCard(obs: WarObservation, difficulty: BotDifficulty, rng: () => number): Card {
  const hand = byRank(obs.hand);
  const lowest = hand[0];
  const highest = hand[hand.length - 1];
  if (difficulty === "easy") return hand[Math.floor(rng() * hand.length)];
  // Everyone sensible throws their best card at a War: the pot's big.
  if (obs.atWar) return highest;

  if (difficulty === "medium") {
    // Save Aces and Kings for Wars; otherwise play the best of the rest.
    const rest = hand.filter((c) => warRank(c) < HIGH);
    return rest.length ? rest[rest.length - 1] : lowest;
  }

  // Hard: with two high cards, play the lower one. A tie starts a War it can win with the other.
  const highs = hand.filter((c) => warRank(c) >= 12);
  if (highs.length >= 2) return highs[0];
  // Otherwise guess how many high cards the other side has (share of the unknown cards it holds).
  const mine = hand.filter((c) => warRank(c) >= HIGH).length;
  const onTable = obs.tableUp.filter((c) => warRank(c) >= HIGH).length;
  const unknownHigh = Math.max(0, obs.highTotal - mine - onTable);
  const theirShare = obs.theirCount / Math.max(1, obs.theirCount + obs.myCount - hand.length);
  const theirHighs = unknownHigh * theirShare;
  // Few high cards of its own, or they're likely holding plenty: throw away the lowest card.
  if (highs.length <= 1 && theirHighs >= 2) return lowest;
  const rest = hand.filter((c) => warRank(c) < HIGH);
  return rest.length ? rest[rest.length - 1] : lowest;
}

export function getWarBotAction(obs: WarObservation, difficulty: BotDifficulty, rng: () => number = Math.random): WarAction {
  if (!obs.tactical) return { type: "FLIP", playerId: obs.myId };
  return { type: "PLAY", playerId: obs.myId, cardId: chooseWarCard(obs, difficulty, rng).id };
}
