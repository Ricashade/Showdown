/**
 * Speed bots. There are no turns, so a bot is a reaction time: how long after its own last card,
 * and after the piles last changed, it spots its next move. Everything it decides comes from a
 * `SpeedObservation`: its own hand and the two piles. Never the other player's hand.
 */
import type { Card } from "@/types/cards";
import type { BotDifficulty } from "@/types/game";
import type { SpeedAction, SpeedSettings } from "@/types/speed";
import { canGo, fits, type SpeedView } from "@/lib/speed-engine";

export interface SpeedObservation {
  myId: string;
  phase: SpeedView["phase"];
  hand: (Card | null)[];
  stockCount: number;
  tops: [Card | null, Card | null];
  settings: SpeedSettings;
  /** Already asked to flip new cards. */
  voted: boolean;
  /** The pile this bot played on last, if nobody has touched the piles since. */
  chainPile: 0 | 1 | null;
}

export function observeSpeed(view: SpeedView, botId: string): SpeedObservation | null {
  const me = view.sides?.find((x) => x.id === botId);
  if (!me?.hand || (view.phase !== "live" && view.phase !== "slap")) return null;
  const last = view.log.findLast((e) => e.kind !== "caught");
  return {
    myId: botId,
    phase: view.phase,
    hand: me.hand,
    stockCount: me.stockCount,
    tops: [view.piles[0].at(-1) ?? null, view.piles[1].at(-1) ?? null],
    settings: view.settings,
    voted: me.flipVote,
    chainPile: last?.kind === "play" && last.by === botId ? last.pile : null,
  };
}

interface Move {
  cards: Card[];
  pile: 0 | 1;
}

const rankOf = (c: Card) => (c.kind === "standard" ? c.rank : 2);

/** Every legal slam, singles and (where allowed) whole sets of one rank. */
function movesFor(obs: SpeedObservation, groupDoubles: boolean): Move[] {
  const held = obs.hand.filter((c): c is Card => !!c);
  const out: Move[] = [];
  for (const card of held) {
    for (const pile of [0, 1] as const) {
      const top = obs.tops[pile];
      if (!top || !fits(card, top, obs.settings.allowSameRank)) continue;
      const set = held.filter((c) => rankOf(c) === rankOf(card));
      out.push({ cards: groupDoubles && obs.settings.allowDoubles && set.length > 1 ? [card, ...set.filter((c) => c !== card)] : [card], pile });
    }
  }
  return out;
}

/** How many cards in a row the hand could put on a pile, starting with this move. */
function chainLength(move: Move, obs: SpeedObservation): number {
  let left = obs.hand.filter((c): c is Card => !!c && !move.cards.includes(c));
  let top = move.cards.at(-1)!;
  let n = move.cards.length;
  for (;;) {
    const next = left.find((c) => fits(c, top, false));
    if (!next) return n;
    left = left.filter((c) => c !== next);
    top = next;
    n++;
  }
}

const slam = (obs: SpeedObservation, m: Move): SpeedAction => ({ type: "PLAY", playerId: obs.myId, cardIds: m.cards.map((c) => c.id), pile: m.pile, expectedTopId: obs.tops[m.pile]!.id });

/** What the bot does when its moment comes; null when it has nothing to do. */
export function getSpeedBotAction(obs: SpeedObservation, difficulty: BotDifficulty, rng: () => number = Math.random): SpeedAction | null {
  if (obs.phase === "slap") return { type: "SLAP", playerId: obs.myId };
  const moves = movesFor(obs, difficulty !== "easy");
  if (moves.length) {
    if (difficulty === "easy") return slam(obs, moves[Math.floor(rng() * moves.length)]);
    if (difficulty === "medium") return slam(obs, [...moves].sort((a, b) => b.cards.length - a.cards.length)[0]);
    // Hard keeps going where it's going, and otherwise starts the longest run it can.
    const scored = moves.map((m) => ({ m, score: chainLength(m, obs) * 10 + (m.pile === obs.chainPile ? 5 : 0) }));
    return slam(obs, scored.sort((a, b) => b.score - a.score)[0].m);
  }
  if (!obs.settings.autoDraw && obs.stockCount > 0 && obs.hand.includes(null)) return { type: "DRAW", playerId: obs.myId };
  if (!obs.voted && !canGo({ hand: obs.hand, stock: [] }, [obs.tops[0] ? [obs.tops[0]] : [], obs.tops[1] ? [obs.tops[1]] : []], obs.settings)) return { type: "VOTE_FLIP", playerId: obs.myId };
  return null;
}

// ---------------------------------------------------------------------------
// Reaction times
// ---------------------------------------------------------------------------

/** How long each kind of bot takes to spot a move, in ms. */
export const REACTION: Record<BotDifficulty, [number, number]> = { easy: [1800, 2600], medium: [1000, 1500], hard: [550, 900] };
/** Hard runs a chain it's already on at this pace. */
export const HARD_CHAIN_MS = 450;

/** A steady 0–1 from a string, so a bot's reaction to one board is the same however often it's asked. */
function jitter(key: string) {
  let h = 2166136261;
  for (let i = 0; i < key.length; i++) h = Math.imul(h ^ key.charCodeAt(i), 16777619);
  return ((h >>> 0) % 1000) / 1000;
}

/**
 * When (host clock) the bot moves: a reaction after its own last card, and at least half a
 * reaction after the piles last changed (it has to see the new top card). Hard chains faster.
 */
export function speedDueAt(o: { botId: string; difficulty: BotDifficulty; lastPlayAt: number; boardAt: number; chaining: boolean; slapping: boolean }) {
  const [lo, hi] = REACTION[o.difficulty];
  const reaction = lo + (hi - lo) * jitter(`${o.botId}:${o.boardAt}`);
  if (o.slapping) return o.boardAt + reaction * 0.8;
  if (o.chaining && o.difficulty === "hard") return o.lastPlayAt + HARD_CHAIN_MS;
  return Math.max(o.lastPlayAt + reaction, o.boardAt + reaction * 0.5);
}
