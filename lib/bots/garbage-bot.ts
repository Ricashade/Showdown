/**
 * Garbage bots. Everything here works from a `GarbageObservation`: the bot's own board (face-down
 * slots stay unknown, even to it), the card in hand, and the cards everyone can see.
 */
import type { Card } from "@/types/cards";
import type { FaceCard, FaceRole, GarbageAction } from "@/types/garbage";
import type { BotDifficulty } from "@/types/game";
import { bestArrangement, cardRole, decksFor, getGarbageLegal, type GarbageLegal, type GarbagePublicSlot, type GarbageView } from "@/lib/garbage-engine";

export interface GarbageObservation {
  myId: string;
  slots: GarbagePublicSlot[];
  active: Card | null;
  legal: GarbageLegal;
  faceCards: Record<FaceCard, FaceRole>;
  /** Every card face up right now: the discard pile and everyone's boards. */
  discardPile: Card[];
  opponentCards: Card[];
  myShown: Card[];
  decks: number;
}

export function observeGarbage(view: GarbageView, botId: string): GarbageObservation | null {
  const me = view.players.find((p) => p.id === botId);
  const legal = getGarbageLegal(view, botId);
  if (!me || !legal.isMyTurn) return null;
  const shown = (slots: GarbagePublicSlot[]) => slots.flatMap((s) => (s.shown ? [s.shown] : []));
  return {
    myId: botId,
    slots: me.slots,
    active: view.active,
    legal,
    faceCards: view.settings.faceCards,
    discardPile: view.discard,
    opponentCards: view.players.filter((p) => p.id !== botId).flatMap((p) => shown(p.slots)),
    myShown: shown(me.slots),
    decks: decksFor(view.players.length),
  };
}

/** How many of slot `i`'s own number are face up in these cards. */
function seen(cards: Card[], i: number, faceCards: Record<FaceCard, FaceRole>) {
  return cards.filter((c) => cardRole(c, faceCards) === i + 1).length;
}

/** Which face-down slot a wild should fill. */
export function chooseWildSlot(obs: GarbageObservation, options: number[], difficulty: BotDifficulty): number {
  if (difficulty === "easy" || options.length === 1) return options[0];
  const score = (i: number) => {
    if (difficulty === "medium") {
      // Numbers that keep turning up elsewhere are the ones you're least likely to see again.
      return seen([...obs.discardPile, ...obs.opponentCards], i, obs.faceCards);
    }
    // Hard: fewest copies still out there (4 per deck, minus every one in sight).
    const unseen = obs.decks * 4 - seen([...obs.discardPile, ...obs.opponentCards, ...obs.myShown], i, obs.faceCards);
    return -unseen;
  };
  return options.reduce((best, i) => (score(i) > score(best) ? i : best), options[0]);
}

export function getGarbageBotAction(obs: GarbageObservation, difficulty: BotDifficulty, rng: () => number = Math.random): GarbageAction {
  const playerId = obs.myId;
  const { legal } = obs;
  if (legal.mustDraw) {
    // A card off the discard pile is sure progress; Easy sometimes gambles on the stock anyway.
    const take = legal.canTakeDiscard && (difficulty !== "easy" || rng() < 0.5);
    return { type: "DRAW", playerId, source: take ? "discard" : "stock" };
  }
  if (legal.mustDiscard) return { type: "DISCARD", playerId };
  return { type: "PLACE", playerId, slot: chooseWildSlot(obs, legal.slots, difficulty) };
}

/** End of round: one swap toward the best layout of the revealed cards, then done. Every bot plays this the same way. */
export function arrangeRevealed(view: GarbageView, botId: string): GarbageAction | null {
  const me = view.players.find((p) => p.id === botId);
  if (!me || me.revealDone) return null;
  const best = bestArrangement(me.slots, view.settings.faceCards);
  const from = me.slots.findIndex((slot, i) => slot.revealed && slot.revealed.id !== best[i]);
  if (from < 0) return { type: "REVEAL_DONE", playerId: botId };
  const to = me.slots.findIndex((slot) => slot.revealed?.id === best[from]);
  return { type: "SWAP_REVEALED", playerId: botId, from, to };
}
