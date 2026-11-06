/**
 * Bouillotte bots. Everything here works from a `BouillotteObservation`: the bot's own three
 * cards, the Retourné, the pot and the bets. Never anyone else's hand.
 */
import type { Card, StandardCard, Suit } from "@/types/cards";
import type { BotDifficulty } from "@/types/game";
import type { BouillotteAction, BouillotteSettings } from "@/types/bouillotte";
import { SUITS } from "@/lib/cards";
import {
  brelanOf,
  compareBrelans,
  deckFor,
  getBouillotteLegal,
  pointValue,
  pointWinner,
  suitsByPoints,
  suitTotals,
  type BouillotteLegal,
  type BouillotteView,
} from "@/lib/bouillotte-engine";

export interface BouillotteObservation {
  myId: string;
  hand: StandardCard[];
  retourne: StandardCard | null;
  legal: BouillotteLegal;
  pot: number;
  currentBet: number;
  chips: number;
  ante: number;
  settings: BouillotteSettings;
  /** Everyone dealt in, by how many cards they hold (always three) and whether they're still in. */
  opponents: { id: string; folded: boolean }[];
  dealtCount: number;
}

export function observeBouillotte(view: BouillotteView, botId: string): BouillotteObservation | null {
  const me = view.players.find((p) => p.id === botId);
  const legal = getBouillotteLegal(view, botId);
  if (!me || !legal.isMyTurn) return null;
  const dealt = view.players.filter((p) => p.inHand);
  return {
    myId: botId,
    hand: (me.hand ?? []) as StandardCard[],
    retourne: view.retourne as StandardCard | null,
    legal,
    pot: view.pot,
    currentBet: view.currentBet,
    chips: me.chips,
    ante: view.settings.ante,
    settings: view.settings,
    opponents: dealt.filter((p) => p.id !== botId).map((p) => ({ id: p.id, folded: p.folded })),
    dealtCount: dealt.length,
  };
}

// ---------------------------------------------------------------------------
// Reading a hand
// ---------------------------------------------------------------------------

/** The suit this hand and the Retourné hold most points in, and whether the bot has its Ace. */
export function suitStrength(hand: StandardCard[], retourne: StandardCard) {
  const totals = suitTotals([...hand, retourne]);
  const suit = [...SUITS].sort((a, b) => totals[b] - totals[a] || (hand.some((c) => c.suit === b) ? 1 : 0) - (hand.some((c) => c.suit === a) ? 1 : 0))[0];
  return { suit, points: totals[suit], ace: hand.some((c) => c.suit === suit && c.rank === 14), inHand: hand.filter((c) => c.suit === suit).reduce((n, c) => n + pointValue(c.rank), 0) };
}

/**
 * How often this hand takes the main pot, dealing the unseen cards out at random to everyone
 * else (folded hands too: they still count toward Le Point).
 */
export function estimateEquity(obs: BouillotteObservation, runs: number, rng: () => number): number {
  const ret = obs.retourne!;
  const seen = new Set([...obs.hand, ret].map((c) => c.id));
  const unseen: Card[] = deckFor(obs.dealtCount).filter((c) => !seen.has(c.id));
  let wins = 0;
  for (let r = 0; r < runs; r++) {
    const deck = [...unseen];
    for (let i = deck.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [deck[i], deck[j]] = [deck[j], deck[i]];
    }
    const hands: Record<string, Card[]> = { [obs.myId]: obs.hand };
    obs.opponents.forEach((o, i) => (hands[o.id] = deck.slice(i * 3, i * 3 + 3)));
    const live = [obs.myId, ...obs.opponents.filter((o) => !o.folded).map((o) => o.id)];
    const brelans = live.map((id) => ({ id, b: brelanOf(hands[id], ret, obs.settings.brelanFavori) })).filter((x) => x.b);
    let winner: string;
    if (brelans.length) winner = brelans.sort((a, b) => compareBrelans(b.b!, a.b!))[0].id;
    else {
      const all = [...Object.values(hands).flat(), ret];
      winner = pointWinner(hands, live, suitsByPoints(suitTotals(all), all))!.winnerId;
    }
    if (winner === obs.myId) wins++;
  }
  return wins / runs;
}

// ---------------------------------------------------------------------------
// Moves
// ---------------------------------------------------------------------------

function raiseTo(obs: BouillotteObservation, to: number): BouillotteAction {
  const { legal } = obs;
  const target = Math.max(legal.minRaiseTo, Math.min(legal.maxRaiseTo, Math.round(to)));
  return target >= legal.maxRaiseTo ? { type: "ALL_IN", playerId: obs.myId } : { type: "RAISE", playerId: obs.myId, to: target };
}

const callOrCheck = (obs: BouillotteObservation): BouillotteAction =>
  obs.legal.canCheck ? { type: "CHECK", playerId: obs.myId } : { type: "CALL", playerId: obs.myId };
const foldOrCheck = (obs: BouillotteObservation): BouillotteAction =>
  obs.legal.canCheck ? { type: "CHECK", playerId: obs.myId } : { type: "FOLD", playerId: obs.myId };

/** A bet of this fraction of the pot on top of the table's current bet. */
const potBet = (obs: BouillotteObservation, fraction: number) => obs.currentBet + Math.max(obs.ante, obs.pot * fraction);

export function getBouillotteBotAction(obs: BouillotteObservation, difficulty: BotDifficulty, rng: () => number = Math.random): BouillotteAction {
  const { legal, myId } = obs;

  // The carré is blind: no cards yet.
  if (legal.carre) {
    const chance = difficulty === "easy" ? 0 : difficulty === "medium" ? 0.15 : obs.chips > obs.ante * 20 ? 0.3 : 0.1;
    return { type: "CARRE", playerId: myId, post: rng() < chance };
  }

  const ret = obs.retourne!;
  const brelan = brelanOf(obs.hand, ret, obs.settings.brelanFavori);
  const toCall = legal.callAmount;
  const odds = toCall / (obs.pot + toCall || 1);

  if (difficulty === "easy") {
    const strong = !!brelan || obs.hand.some((c) => c.rank >= 13);
    // Loose: any Ace or King is worth a bet, sized by feel.
    if (legal.canCheck) return strong && legal.canRaise && rng() < 0.6 ? raiseTo(obs, potBet(obs, 0.4 + rng() * 0.8)) : callOrCheck(obs);
    if (strong) return legal.canRaise && rng() < (brelan ? 0.5 : 0.15) ? raiseTo(obs, potBet(obs, 1)) : callOrCheck(obs);
    return toCall <= obs.ante * 2 && rng() < 0.5 ? callOrCheck(obs) : foldOrCheck(obs);
  }

  if (difficulty === "medium") {
    const { points, ace } = suitStrength(obs.hand, ret);
    // Points of one suit it can count on, and its Ace, make Le Point likely.
    const strength = brelan ? (brelan.kind === "favori" ? 0.9 : 1) : Math.min(0.85, points / 40 + (ace ? 0.25 : 0));
    if (legal.canCheck) {
      if (legal.canRaise && strength > 0.6) return raiseTo(obs, potBet(obs, 0.5));
      if (legal.canRaise && strength > 0.4 && rng() < 0.4) return raiseTo(obs, legal.minRaiseTo);
      return callOrCheck(obs);
    }
    if (strength > 0.8 && legal.canRaise) return raiseTo(obs, potBet(obs, 1));
    return strength > odds + 0.15 ? callOrCheck(obs) : foldOrCheck(obs);
  }

  // Hard: simulates the unseen cards, and bluffs with the blockers that win Le Point.
  const equity = estimateEquity(obs, 300, rng);
  const aces = obs.hand.filter((c) => c.rank === 14);
  const blocker = aces.some((c) => c.suit === (ret.suit as Suit)) || aces.length >= 2;
  const fair = 1 / (1 + obs.opponents.filter((o) => !o.folded).length);
  if (legal.canCheck) {
    if (legal.canRaise && equity > Math.max(0.5, fair * 1.4)) return raiseTo(obs, potBet(obs, equity > 0.75 ? 1 : 0.6));
    if (legal.canRaise && blocker && rng() < 0.5) return raiseTo(obs, potBet(obs, 0.7));
    return callOrCheck(obs);
  }
  if (legal.canRaise && equity > 0.7) return raiseTo(obs, equity > 0.85 ? legal.maxRaiseTo : potBet(obs, 1));
  if (legal.canRaise && blocker && equity > odds && rng() < 0.25) return raiseTo(obs, potBet(obs, 1));
  return equity >= odds ? callOrCheck(obs) : foldOrCheck(obs);
}
