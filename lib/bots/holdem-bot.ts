/**
 * Texas Hold'em bots. Everything here works from a `HoldemObservation`: only what that bot
 * can see (its own hole cards, the board, bets and stacks).
 */
import type { Card, StandardCard } from "@/types/cards";
import type { HoldemAction, Street } from "@/types/holdem";
import type { BotDifficulty } from "@/types/game";
import { createDeck } from "@/lib/cards";
import { handScore } from "@/lib/holdem-hand";
import { getHoldemLegal, type HoldemView } from "@/lib/holdem-game";

export type Position = "early" | "middle" | "late" | "blind";

/** Everything a Hold'em bot is allowed to know. No other player's hole cards. */
export interface HoldemObservation {
  myId: string;
  myHoleCards: Card[];
  communityCards: Card[];
  street: Street;
  /** Everything in the middle, including this street's bets. */
  potSize: number;
  toCall: number;
  myChips: number;
  myBet: number;
  currentBet: number;
  bigBlind: number;
  canCheck: boolean;
  canRaise: boolean;
  minRaiseTo: number;
  maxRaiseTo: number;
  numActiveOpponents: number;
  position: Position;
  /** Bets and raises made so far on this street. */
  raisesThisStreet: number;
}

/** Build the observation from the bot's own redacted view. */
export function observeHoldem(view: HoldemView, botId: string): HoldemObservation | null {
  const me = view.players.find((p) => p.id === botId);
  const legal = getHoldemLegal(view, botId);
  if (!me?.hand || !legal.isMyTurn) return null;
  const live = view.players.filter((p) => p.inHand && !p.folded);
  return {
    myId: botId,
    myHoleCards: me.hand,
    communityCards: view.board,
    street: view.street,
    potSize: legal.pot,
    toCall: Math.max(0, view.currentBet - me.bet),
    myChips: me.chips,
    myBet: me.bet,
    currentBet: view.currentBet,
    bigBlind: view.bigBlind,
    canCheck: legal.canCheck,
    canRaise: legal.canRaise,
    minRaiseTo: legal.minRaiseTo,
    maxRaiseTo: legal.maxRaiseTo,
    numActiveOpponents: live.length - 1,
    position: positionOf(view, botId),
    raisesThisStreet: Object.values(view.lastActions).filter((a) => a.move === "bet" || a.move === "raise" || (a.move === "all_in" && (a.amount ?? 0) > view.bigBlind)).length,
  };
}

/** Seat relative to the button among players dealt in. */
function positionOf(view: HoldemView, id: string): Position {
  if (id === view.smallBlindId || id === view.bigBlindId) return "blind";
  const seats = view.players.filter((p) => p.inHand);
  const button = seats.findIndex((p) => p.id === view.buttonId);
  const me = seats.findIndex((p) => p.id === id);
  const fromButton = (me - button + seats.length) % seats.length; // 0 = button
  if (fromButton === 0 || fromButton === seats.length - 1) return "late"; // button or cutoff
  const others = seats.length - 3; // seats that aren't button or blinds
  const afterBlinds = fromButton - 2; // 1 = first to act after the big blind
  return afterBlinds <= Math.ceil(others / 2) ? "early" : "middle";
}

// ---------------------------------------------------------------------------
// Hand strength
// ---------------------------------------------------------------------------

/** Chen-style starting-hand score: AA 20, KK 16, AKs 12, 72o −1. */
export function startingHandScore(hole: Card[]): number {
  const [a, b] = hole.filter((c): c is StandardCard => c.kind === "standard").sort((x, y) => y.rank - x.rank);
  if (!a || !b) return 0;
  const points = (r: number) => (r === 14 ? 10 : r === 13 ? 8 : r === 12 ? 7 : r === 11 ? 6 : r / 2);
  if (a.rank === b.rank) return Math.max(5, points(a.rank) * 2);
  let score = points(a.rank);
  if (a.suit === b.suit) score += 2;
  const gap = a.rank - b.rank - 1;
  score -= gap === 0 ? 0 : gap === 1 ? 1 : gap === 2 ? 2 : gap === 3 ? 4 : 5;
  if (gap <= 1 && a.rank < 12) score += 1;
  return Math.ceil(score);
}

/**
 * Chance of winning at showdown against `numActiveOpponents` random hands: deal out the
 * rest of the board and their hole cards `iterations` times. Ties count as a share.
 */
export function estimateHoldemEquity(
  myHoleCards: Card[],
  communityCards: Card[],
  numActiveOpponents: number,
  iterations: number,
  rng: () => number = Math.random,
): number {
  const knownIds = new Set([...myHoleCards, ...communityCards].map((c) => c.id));
  const unseen = createDeck(false).filter((c) => !knownIds.has(c.id));
  const boardNeed = 5 - communityCards.length;
  let total = 0;
  for (let n = 0; n < iterations; n++) {
    const deck = unseen.slice();
    let left = deck.length;
    const draw = () => {
      const i = Math.floor(rng() * left);
      const c = deck[i];
      deck[i] = deck[--left];
      return c;
    };
    const board = communityCards.slice();
    for (let k = 0; k < boardNeed; k++) board.push(draw());
    const mine = handScore([...myHoleCards, ...board]);
    let best = true;
    let ties = 1;
    for (let o = 0; o < numActiveOpponents && best; o++) {
      const theirs = handScore([draw(), draw(), ...board]);
      if (theirs > mine) best = false;
      else if (theirs === mine) ties++;
    }
    if (best) total += 1 / ties;
  }
  return total / iterations;
}

/** Made-hand category with these cards: 0 = high card … 8 = straight flush. */
const madeCategory = (cards: Card[]) => Math.floor(handScore(cards) / 15 ** 5);

interface Draws {
  flush: boolean;
  straight: boolean;
}

/** Four to a flush or an open-ended straight draw that uses at least one hole card. */
function drawsFor(hole: Card[], board: Card[]): Draws {
  const all = [...hole, ...board].filter((c): c is StandardCard => c.kind === "standard");
  const holeIds = new Set(hole.map((c) => c.id));
  const flush = (["S", "H", "D", "C"] as const).some((s) => {
    const suited = all.filter((c) => c.suit === s);
    return suited.length === 4 && suited.some((c) => holeIds.has(c.id));
  });
  const ranks = new Set<number>(all.map((c) => c.rank));
  if (ranks.has(14)) ranks.add(1);
  let straight = false;
  for (let low = 1; low <= 10 && !straight; low++) {
    const run = [0, 1, 2, 3].every((k) => ranks.has(low + k));
    const open = run && low > 1 && low + 3 < 14;
    if (open && hole.some((c) => c.kind === "standard" && c.rank >= low && c.rank <= low + 3)) straight = true;
  }
  return { flush, straight };
}

/** Four of a suit or a pair on the board: hands that beat a pair are easy to have. */
function dangerousBoard(board: Card[]): boolean {
  const std = board.filter((c): c is StandardCard => c.kind === "standard");
  const suits = new Map<string, number>();
  const ranks = new Map<number, number>();
  for (const c of std) {
    suits.set(c.suit, (suits.get(c.suit) ?? 0) + 1);
    ranks.set(c.rank, (ranks.get(c.rank) ?? 0) + 1);
  }
  return [...suits.values()].some((n) => n >= 4) || [...ranks.values()].some((n) => n >= 2);
}

// ---------------------------------------------------------------------------
// Turning intentions into legal moves
// ---------------------------------------------------------------------------

function fold(o: HoldemObservation): HoldemAction {
  return o.canCheck ? { type: "CHECK", playerId: o.myId } : { type: "FOLD", playerId: o.myId };
}
function checkOrCall(o: HoldemObservation): HoldemAction {
  return o.canCheck ? { type: "CHECK", playerId: o.myId } : { type: "CALL", playerId: o.myId };
}
/** Bet or raise so our street total is about `to`; falls back to calling if raising isn't allowed. */
function raiseTo(o: HoldemObservation, to: number): HoldemAction {
  if (!o.canRaise) return checkOrCall(o);
  const amount = Math.max(o.minRaiseTo, Math.min(o.maxRaiseTo, Math.round(to)));
  // Within a few big blinds of everything: just move in.
  if (amount >= o.maxRaiseTo || o.maxRaiseTo - amount < o.bigBlind * 2) return { type: "ALL_IN", playerId: o.myId };
  return { type: "RAISE", playerId: o.myId, to: amount };
}
/** A bet of `fraction` of the pot (on top of matching the current bet). */
const potBet = (o: HoldemObservation, fraction: number) => raiseTo(o, o.currentBet + (o.potSize + o.toCall) * fraction);

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

/** Loose and passive: calls a lot, rarely raises, never does the maths. */
function easyBot(o: HoldemObservation, rng: () => number): HoldemAction {
  if (o.street === "preflop") {
    const score = startingHandScore(o.myHoleCards);
    const massive = o.toCall > Math.max(o.myChips * 0.4, o.bigBlind * 10);
    if (massive && score < 9) return fold(o);
    if (score >= 12 && rng() < 0.15) return raiseTo(o, o.currentBet + o.bigBlind * 2);
    return checkOrCall(o);
  }
  const made = madeCategory([...o.myHoleCards, ...o.communityCards]);
  const draws = drawsFor(o.myHoleCards, o.communityCards);
  if (made >= 2) {
    if (o.canCheck) return potBet(o, 0.33);
    return rng() < 0.1 ? potBet(o, 0.5) : checkOrCall(o);
  }
  if (made >= 1 || draws.flush || draws.straight) {
    return o.toCall <= o.myChips * 0.5 ? checkOrCall(o) : fold(o);
  }
  if (o.canCheck) return checkOrCall(o);
  return o.toCall <= o.potSize * 0.25 && rng() < 0.5 ? checkOrCall(o) : fold(o);
}

/** Tight and aggressive: good starting hands, then plays the odds. */
function mediumBot(o: HoldemObservation, rng: () => number): HoldemAction {
  if (o.street === "preflop") {
    const score = startingHandScore(o.myHoleCards);
    const raised = o.currentBet > o.bigBlind;
    if (!raised) {
      if (score >= 10) return raiseTo(o, o.bigBlind * 3);
      if (score >= 7) return checkOrCall(o);
      return fold(o);
    }
    if (score >= 12) return raiseTo(o, o.currentBet * 3);
    if (score >= 9 && o.toCall <= (o.myChips + o.myBet) * 0.15) return checkOrCall(o);
    return fold(o);
  }
  const equity = estimateHoldemEquity(o.myHoleCards, o.communityCards, o.numActiveOpponents, 150, rng);
  if (o.toCall === 0) {
    if (equity > 0.65) return potBet(o, 0.66);
    if (rng() < 0.15) return potBet(o, 0.5); // Continuation-bet bluff.
    return checkOrCall(o);
  }
  const potOdds = o.toCall / (o.potSize + o.toCall);
  if (equity > 0.65) return potBet(o, 0.75);
  if (equity > potOdds) return checkOrCall(o);
  return fold(o);
}

/** Position-aware ranges, odds with implied odds, value bets, semi-bluffs, and respect. */
function hardBot(o: HoldemObservation, rng: () => number): HoldemAction {
  const stackBBs = (o.myChips + o.myBet) / o.bigBlind;
  if (o.street === "preflop") {
    const score = startingHandScore(o.myHoleCards);
    const openAt: Record<Position, number> = { early: 10, middle: 8, late: 6, blind: 7 };
    const raised = o.currentBet > o.bigBlind;
    // Heads-up, almost every hand is worth playing from the button.
    const headsUp = o.numActiveOpponents === 1;
    if (headsUp) openAt.blind = 5;
    if (stackBBs <= 10) return score >= 8 ? { type: "ALL_IN", playerId: o.myId } : fold(o); // Short stack: push or fold.
    if (!raised) {
      if (score >= openAt[o.position]) return raiseTo(o, o.bigBlind * (o.position === "late" ? 2.5 : 3));
      return o.canCheck ? checkOrCall(o) : fold(o);
    }
    if (score >= 13) return raiseTo(o, o.currentBet * 3); // 3-bet premiums.
    const callAt = headsUp ? 6 : o.position === "late" ? 8 : 10;
    if (score >= callAt && o.toCall <= (o.myChips + o.myBet) * 0.12) return checkOrCall(o);
    return fold(o);
  }

  const equity = estimateHoldemEquity(o.myHoleCards, o.communityCards, o.numActiveOpponents, 400, rng);
  const draws = drawsFor(o.myHoleCards, o.communityCards);
  const strongDraw = (draws.flush || draws.straight) && o.street !== "river";
  const made = madeCategory([...o.myHoleCards, ...o.communityCards]);
  // Draws are worth more than their raw equity when they hit and get paid.
  const effective = equity + (strongDraw ? 0.08 : 0);
  const sizing = 0.5 + 0.25 * Math.min(1, Math.max(0, (equity - 0.5) / 0.35)); // 50%–75% pot

  if (o.toCall === 0) {
    // Most players call too much, so bet for value thinner and bluff rarely.
    if (equity > 0.55) return potBet(o, sizing);
    if (strongDraw && rng() < 0.35) return potBet(o, 0.6); // Semi-bluff.
    return checkOrCall(o);
  }
  let potOdds = o.toCall / (o.potSize + o.toCall);
  // A bet is information: the bettor's range is stronger than a random hand.
  potOdds += 0.08;
  // Heavy action on a scary board means someone likely has it: demand more, unless we're strong.
  const heavy = o.raisesThisStreet >= 2 || (dangerousBoard(o.communityCards) && o.toCall >= o.potSize * 0.5);
  if (heavy && made < 5) potOdds += 0.12;
  if (equity > 0.75) return potBet(o, sizing);
  if (strongDraw && o.raisesThisStreet < 2 && rng() < 0.2) return potBet(o, 0.6); // Semi-bluff raise.
  if (effective > potOdds) return checkOrCall(o);
  return fold(o);
}

/** Last check that the move is allowed: never fold for free, never raise when you can't. */
function legalize(o: HoldemObservation, a: HoldemAction): HoldemAction {
  if (a.type === "FOLD" && o.canCheck) return { type: "CHECK", playerId: o.myId };
  if ((a.type === "RAISE" || a.type === "ALL_IN") && !o.canRaise) {
    // Going all in to call is still fine when the call costs everything.
    if (a.type === "ALL_IN" && o.toCall > 0) return a;
    return checkOrCall(o);
  }
  return a;
}

export function getHoldemBotAction(o: HoldemObservation, difficulty: BotDifficulty, rng: () => number = Math.random): HoldemAction {
  const style = difficulty === "easy" ? easyBot : difficulty === "medium" ? mediumBot : hardBot;
  return legalize(o, style(o, rng));
}
