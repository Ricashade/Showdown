/**
 * Rummy bots. Everything here works from a `RummyObservation`: the bot's own hand, the table
 * melds, the discard pile, and what others have picked up. Never anyone else's hand.
 */
import type { Card } from "@/types/cards";
import type { BotDifficulty } from "@/types/game";
import type { Meld, RummyAction, RummySettings } from "@/types/rummy";
import { getRummyLegal, type RummyLegal, type RummyView } from "@/lib/rummy-engine";
import { cardPoints, findMelds, handPoints, isPlayable, layOffShape, validateMeld } from "@/lib/rummy-melds";

export interface RummyObservation {
  myId: string;
  hand: Card[];
  melds: Meld[];
  discard: Card[];
  settings: RummySettings;
  legal: RummyLegal;
  /** The card the next player last took off the discard pile, if any. */
  nextPlayerPickup: Card | null;
}

export function observeRummy(view: RummyView, botId: string): RummyObservation | null {
  const me = view.players.find((p) => p.id === botId);
  const legal = getRummyLegal(view, botId);
  if (!me?.hand || !legal.isMyTurn) return null;
  const i = view.players.findIndex((p) => p.id === botId);
  const next = view.players[(i + 1) % view.players.length];
  return { myId: botId, hand: me.hand, melds: view.melds, discard: view.discard, settings: view.settings, legal, nextPlayerPickup: view.lastPickup[next.id] ?? null };
}

const meldedPoints = (hand: Card[], s: RummySettings) => findMelds(hand, s.aceRule).flat().reduce((n, c) => n + cardPoints(c, s.variant), 0);

// ---------------------------------------------------------------------------
// Drawing
// ---------------------------------------------------------------------------

function chooseDraw(obs: RummyObservation, difficulty: BotDifficulty, rng: () => number): RummyAction {
  const { hand, discard, settings, legal, myId: playerId } = obs;
  const top = discard.length - 1;
  const stock: RummyAction = { type: "DRAW_STOCK", playerId };
  const takeTop = legal.takeable.includes(top);

  if (difficulty === "easy") return takeTop && rng() < 0.2 ? { type: "DRAW_DISCARD", playerId, index: top } : stock;

  if (difficulty === "medium") {
    // Only when the top card makes a meld with what's in hand.
    return takeTop && isPlayable(discard[top], hand, [], settings.aceRule) ? { type: "DRAW_DISCARD", playerId, index: top } : stock;
  }

  // Hard: weigh every card it may take by the points it turns into melds, minus the junk
  // that comes with it.
  let best: { index: number; gain: number } | null = null;
  const before = meldedPoints(hand, settings);
  for (const index of legal.takeable) {
    const taken = discard.slice(index);
    const after = [...hand, ...taken];
    const playable = isPlayable(taken[0], hand.concat(taken), obs.melds, settings.aceRule);
    if (!playable) continue;
    const melded = meldedPoints(after, settings) - before;
    const layOffs = taken.filter((c) => obs.melds.some((m) => layOffShape(m, [c], settings.aceRule))).reduce((n, c) => n + cardPoints(c, settings.variant), 0);
    const junk = taken.length > 1 ? handPoints(taken.slice(1), settings.variant) / 2 : 0;
    const gain = melded + layOffs - junk;
    if (gain > 0 && (!best || gain > best.gain)) best = { index, gain };
  }
  return best ? { type: "DRAW_DISCARD", playerId, index: best.index } : stock;
}

// ---------------------------------------------------------------------------
// Melding, laying off, discarding
// ---------------------------------------------------------------------------

/** A meld or lay-off that uses the card the bot dug for. */
function playDugCard(obs: RummyObservation, id: string): RummyAction | null {
  const { hand, settings, melds, myId: playerId } = obs;
  const card = hand.find((c) => c.id === id);
  if (!card) return null;
  const meld = findMelds(hand, settings.aceRule).find((m) => m.some((c) => c.id === id));
  if (meld) return { type: "MELD", playerId, cardIds: meld.map((c) => c.id) };
  const target = melds.find((m) => layOffShape(m, [card], settings.aceRule));
  if (target) return { type: "LAY_OFF", playerId, cardIds: [id], meldId: target.id };
  const others = hand.filter((c) => c.id !== id);
  for (let i = 0; i < others.length; i++) {
    for (let j = i + 1; j < others.length; j++) {
      if (validateMeld([card, others[i], others[j]], settings.aceRule)) return { type: "MELD", playerId, cardIds: [id, others[i].id, others[j].id] };
    }
  }
  return null;
}

/** Cards that work with another card in hand: pairs, and same-suit cards one or two apart. */
function connected(card: Card, hand: Card[], dead: Set<string>): boolean {
  if (card.kind === "joker") return true;
  return hand.some((o) => {
    if (o.id === card.id || o.kind !== "standard") return false;
    if (o.rank === card.rank) return !outsDead(card, o, dead, "set");
    return o.suit === card.suit && Math.abs(o.rank - card.rank) <= 2 && !outsDead(card, o, dead, "run");
  });
}

/** Every card that would turn this pair into a meld is already in the discards or on the table. */
function outsDead(a: Card, b: Card, dead: Set<string>, kind: "set" | "run"): boolean {
  if (a.kind !== "standard" || b.kind !== "standard" || dead.size === 0) return false;
  const key = (rank: number, suit: string) => `${rank}${suit}`;
  let outs: string[];
  if (kind === "set") {
    outs = (["S", "H", "D", "C"] as const).filter((s) => s !== a.suit && s !== b.suit).map((s) => key(a.rank, s));
  } else {
    const lo = Math.min(a.rank, b.rank);
    const hi = Math.max(a.rank, b.rank);
    outs = hi - lo === 2 ? [key(lo + 1, a.suit)] : [key(lo - 1, a.suit), key(hi + 1, a.suit)];
  }
  return outs.every((o) => dead.has(o));
}

function chooseDiscard(obs: RummyObservation, difficulty: BotDifficulty, rng: () => number): Card {
  const { hand, settings } = obs;
  const candidates = hand.filter((c) => c.kind !== "joker" || hand.every((x) => x.kind === "joker"));
  if (difficulty === "easy") return candidates[Math.floor(rng() * candidates.length)];

  // Hard counts cards: what's already discarded or melded can't come back.
  const dead = new Set<string>();
  if (difficulty === "hard") {
    for (const c of [...obs.discard, ...obs.melds.flatMap((m) => m.cards)]) if (c.kind === "standard") dead.add(`${c.rank}${c.suit}`);
  }
  const score = (c: Card) => {
    let s = cardPoints(c, settings.variant);
    if (connected(c, hand, dead)) s -= 100; // Keep near-melds.
    if (difficulty === "hard") {
      // Don't feed the table, or the next player what they're collecting.
      if (obs.melds.some((m) => layOffShape(m, [c], settings.aceRule))) s -= 40;
      const want = obs.nextPlayerPickup;
      if (want?.kind === "standard" && c.kind === "standard" && (c.rank === want.rank || (c.suit === want.suit && Math.abs(c.rank - want.rank) <= 2))) s -= 30;
    }
    return s;
  };
  return candidates.reduce((best, c) => (score(c) > score(best) ? c : best), candidates[0]);
}

export function getRummyBotAction(obs: RummyObservation, difficulty: BotDifficulty, rng: () => number = Math.random): RummyAction | null {
  const { legal, hand, settings, melds, myId: playerId } = obs;
  if (legal.mustDraw) return chooseDraw(obs, difficulty, rng);
  if (!legal.canPlay) return null;

  if (legal.mustPlayId) {
    const play = playDugCard(obs, legal.mustPlayId);
    if (play) return play;
  }
  // Put melds down as soon as they're there.
  const meld = findMelds(hand, settings.aceRule)[0];
  if (meld) return { type: "MELD", playerId, cardIds: meld.map((c) => c.id) };
  // Easy doesn't look at the table.
  if (difficulty !== "easy") {
    for (const c of hand) {
      const target = melds.find((m) => layOffShape(m, [c], settings.aceRule));
      if (target) return { type: "LAY_OFF", playerId, cardIds: [c.id], meldId: target.id };
    }
  }
  return { type: "DISCARD", playerId, cardId: chooseDiscard(obs, difficulty, rng).id };
}
