/**
 * 13 bots. Everything here works from a `ThirteenObservation`: the bot's own hand, what's on the
 * table, how many cards the others hold, and every card played so far. Never anyone else's hand.
 */
import type { Card, Rank, StandardCard } from "@/types/cards";
import type { BotDifficulty } from "@/types/game";
import type { Combo, ThirteenAction } from "@/types/thirteen";
import { rankShort } from "@/lib/cards";
import { contextFor, getThirteenLegal, judgePlay, type PlayContext, type ThirteenView } from "@/lib/thirteen-engine";
import { BOMBS, comboKey, compareStrength, findBombs, isBombable, LADDER, power, suitPower, twosIn } from "@/lib/thirteen-combos";

export interface ThirteenObservation {
  myId: string;
  hand: Card[];
  ctx: PlayContext;
  /** Fewest cards any opponent holds. */
  threat: number;
  /** Every card played this hand, by anyone. */
  played: Card[];
}

export function observeThirteen(view: ThirteenView, botId: string): ThirteenObservation | null {
  const legal = getThirteenLegal(view, botId);
  const hand = view.seats?.find((x) => x.id === botId)?.hand;
  if (!legal.isMyTurn || !hand) return null;
  return {
    myId: botId,
    hand,
    ctx: contextFor(view, botId),
    threat: Math.min(...view.seats!.filter((x) => x.id !== botId).map((x) => x.count)),
    played: view.log.flatMap((e) => (e.kind === "play" ? e.cards : [])),
  };
}

// ---------------------------------------------------------------------------
// What the bot could play
// ---------------------------------------------------------------------------

interface Option {
  cards: Card[];
  combo: Combo;
}

const isStandard = (c: Card): c is StandardCard => c.kind === "standard";
const bySuit = (a: StandardCard, b: StandardCard) => suitPower(a.suit) - suitPower(b.suit);

function subsets<T>(list: T[], k: number): T[][] {
  if (k === 0) return [[]];
  if (list.length < k) return [];
  const [head, ...rest] = list;
  return [...subsets(rest, k - 1).map((s) => [head, ...s]), ...subsets(rest, k)];
}

/** Card sets worth considering: singles, pairs, triples, straights (Jokers filling gaps) and every bomb. */
export function candidateSets(hand: Card[]): Card[][] {
  const jokers = hand.filter((c) => c.kind === "joker");
  const byRank = new Map<Rank, StandardCard[]>();
  for (const c of hand.filter(isStandard).sort(bySuit)) byRank.set(c.rank, [...(byRank.get(c.rank) ?? []), c]);
  const sets: Card[][] = hand.map((c) => [c]);

  for (const [, list] of byRank) {
    sets.push(...subsets(list, 2), ...subsets(list, 3));
    if (jokers.length >= 1) sets.push([list[0], jokers[0]], ...(list.length >= 2 ? [[list[0], list[1], jokers[0]]] : []));
    if (jokers.length >= 2) sets.push([list[0], ...jokers]);
  }
  if (jokers.length === 2) sets.push(jokers);

  for (let low = 3; low <= 12; low++) {
    let gaps = 0;
    const picked: Card[] = [];
    for (let high = low; high <= 14 && high - low < 11; high++) {
      const list = byRank.get(high as Rank);
      if (list) picked.push(list[0]);
      else gaps++;
      if (gaps > jokers.length) break;
      if (high - low >= 2) {
        // The top card in its best suit, so the straight wins ties.
        const top = list ? [...picked.slice(0, -1), list.at(-1)!] : picked;
        sets.push([...top, ...jokers.slice(0, gaps)]);
      }
    }
  }

  sets.push(...findBombs(hand).map((b) => b.cards));
  return sets;
}

/** The legal plays among the candidates, weakest first. */
function legalOptions(hand: Card[], ctx: PlayContext): Option[] {
  const seen = new Set<string>();
  const out: Option[] = [];
  for (const cards of candidateSets(hand)) {
    const key = cards.map((c) => c.id).sort().join();
    if (seen.has(key)) continue;
    seen.add(key);
    const combo = judgePlay(ctx, cards).allowed[0];
    if (combo) out.push({ cards, combo });
  }
  return out.sort((a, b) => compareStrength(b.combo, a.combo));
}

const usesTwosOrJokers = (o: Option) => o.cards.some((c) => c.kind === "joker" || c.rank === 2);
const playOf = (myId: string, o: Option): ThirteenAction => ({ type: "PLAY", playerId: myId, cardIds: o.cards.map((c) => c.id), read: comboKey(o.combo) });
const passOf = (myId: string): ThirteenAction => ({ type: "PASS", playerId: myId });

// ---------------------------------------------------------------------------
// Splitting a hand into as few plays as possible (Hard)
// ---------------------------------------------------------------------------

/** A group in a plan: how many of each rank, plus Jokers, and its bomb tier if it is one. */
interface Group {
  take: [Rank, number][];
  jokers: number;
  tier: number;
}

interface Plan {
  /** Lower is better: plays it takes, less a little for each bomb kept. */
  cost: number;
  groups: Group[];
}

const TURN = 100;
const KIND_TIER: Record<number, number> = { 4: 2, 5: 5, 6: 8 };
const RUN_SHAPES = BOMBS.flatMap((b) => (b.shape.kind === "run" ? [{ ...b.shape, tier: b.tier }] : []));

/** The cheapest way to play out a hand, by rank counts (suits only matter for suited dragons, ignored here). */
export function planHand(counts: Map<Rank, number>, jokers: number, memo = new Map<string, Plan>()): Plan {
  const key = `${LADDER.map((r) => counts.get(r) ?? 0).join("")}|${jokers}`;
  const hit = memo.get(key);
  if (hit) return hit;
  const low = LADDER.find((r) => (counts.get(r) ?? 0) > 0);
  if (low === undefined) return { cost: jokers > 0 ? TURN : 0, groups: jokers > 0 ? [{ take: [], jokers, tier: 0 }] : [] };

  let best: Plan = { cost: Infinity, groups: [] };
  const consider = (group: Group, rest: Map<Rank, number>, jokersLeft: number) => {
    const sub = planHand(rest, jokersLeft, memo);
    const cost = sub.cost + TURN - group.tier * 2;
    if (cost < best.cost) best = { cost, groups: [group, ...sub.groups] };
  };
  const without = (take: [Rank, number][]) => {
    const rest = new Map(counts);
    for (const [r, n] of take) rest.set(r, (rest.get(r) ?? 0) - n);
    return rest;
  };

  // All of the lowest rank together, maybe with Jokers.
  const c = counts.get(low)!;
  for (let jk = 0; jk <= jokers && c + jk <= 6; jk++) {
    consider({ take: [[low, c]], jokers: jk, tier: KIND_TIER[c + jk] ?? 0 }, without([[low, c]]), jokers - jk);
  }

  if (low !== 2) {
    // Straights (and the dragon) starting here.
    let gaps = 0;
    const take: [Rank, number][] = [[low, 1]];
    for (let high = low + 1; high <= 14; high++) {
      if ((counts.get(high as Rank) ?? 0) > 0) take.push([high as Rank, 1]);
      else gaps++;
      if (gaps > jokers) break;
      const length = high - low + 1;
      if (length >= 3 && (length <= 11 || (length === 12 && low === 3))) consider({ take: [...take], jokers: gaps, tier: length === 12 ? 10 : 0 }, without(take), jokers - gaps);
    }
    // Consecutive pairs, triples, quads and fives starting here.
    for (const shape of RUN_SHAPES) {
      const high = low + shape.length - 1;
      if (high > 14) continue;
      let need = 0;
      const t: [Rank, number][] = [];
      for (let r = low; r <= high; r++) {
        const have = Math.min(counts.get(r as Rank) ?? 0, shape.width);
        if (have > 0) t.push([r as Rank, have]);
        need += shape.width - have;
      }
      if (need <= jokers) consider({ take: t, jokers: need, tier: shape.tier }, without(t), jokers - need);
    }
  }

  memo.set(key, best);
  return best;
}

const countsOf = (hand: Card[]) => {
  const m = new Map<Rank, number>();
  for (const c of hand) if (isStandard(c)) m.set(c.rank, (m.get(c.rank) ?? 0) + 1);
  return m;
};
const jokersIn = (hand: Card[]) => hand.filter((c) => c.kind === "joker").length;

/** Real cards for a planned group: lowest suits, except the 3♠ when the hand must open with it. */
function cardsFor(group: Group, hand: Card[], prefer: string | null): Card[] {
  const out: Card[] = [];
  for (const [rank, n] of group.take) {
    const list = hand.filter((c): c is StandardCard => isStandard(c) && c.rank === rank).sort((a, b) => (a.id === prefer ? -1 : b.id === prefer ? 1 : bySuit(a, b)));
    out.push(...list.slice(0, n));
  }
  return [...out, ...hand.filter((c) => c.kind === "joker").slice(0, group.jokers)];
}

/** No card anyone else could still hold beats this single. */
function bossSingle(card: Card, obs: ThirteenObservation) {
  if (!isStandard(card)) return false;
  const gone = new Set([...obs.played, ...obs.hand].map((c) => c.id));
  return LADDER.every((r) =>
    ["S", "C", "D", "H"].every((s) => {
      const id = `${rankShort(r)}${s}`;
      const stronger = power(r) > power(card.rank) || (r === card.rank && suitPower(s as StandardCard["suit"]) > suitPower(card.suit));
      return !stronger || gone.has(id);
    }),
  );
}

// ---------------------------------------------------------------------------
// The bots
// ---------------------------------------------------------------------------

function easy(obs: ThirteenObservation, options: Option[], rng: () => number): ThirteenAction {
  const { ctx, myId } = obs;
  if (!ctx.top) {
    // The lowest card, alone or in whatever it makes.
    const lowest = options[0].cards[0];
    const withIt = options.filter((o) => o.combo.type !== "bomb" && o.cards.some((c) => c.id === lowest.id));
    return playOf(myId, withIt.length && rng() < 0.5 ? withIt[Math.floor(rng() * withIt.length)] : options[0]);
  }
  const plain = options.filter((o) => o.combo.type !== "bomb");
  if (plain.length) return playOf(myId, plain[0]);
  const bomb = options.find((o) => o.combo.type === "bomb");
  return bomb && rng() < 0.5 ? playOf(myId, bomb) : passOf(myId);
}

/** Bombs worth keeping together, strongest first, no card in two of them. */
function keptBombs(hand: Card[]) {
  const used = new Set<string>();
  for (const b of findBombs(hand)) {
    if (b.combo.tier > 8 || b.cards.some((c) => used.has(c.id))) continue;
    for (const c of b.cards) used.add(c.id);
  }
  return used;
}

function medium(obs: ThirteenObservation, options: Option[]): ThirteenAction {
  const { ctx, myId, hand, threat } = obs;
  const late = threat < 5 || hand.length <= 5;
  const kept = keptBombs(hand);
  const spare = (o: Option) => o.combo.type !== "bomb" && !o.cards.some((c) => kept.has(c.id)) && (late || !usesTwosOrJokers(o));

  if (!ctx.top) {
    const free = options.filter(spare);
    if (free.length === 0) return playOf(myId, options[0]);
    // Shed the lowest card in the biggest play it makes.
    const lowest = free[0].cards[0];
    const withIt = free.filter((o) => o.cards.some((c) => c.id === lowest.id)).sort((a, b) => b.cards.length - a.cards.length);
    return playOf(myId, withIt[0] ?? free[0]);
  }

  const free = options.find(spare);
  if (free) return playOf(myId, free);
  const bomb = options.find((o) => o.combo.type === "bomb");
  if (bomb && (twosIn(ctx.top) > 0 || late)) return playOf(myId, bomb);
  const any = options.find((o) => o.combo.type !== "bomb");
  if (any && late) return playOf(myId, any);
  return passOf(myId);
}

function hard(obs: ThirteenObservation, options: Option[]): ThirteenAction {
  const { ctx, myId, hand, threat } = obs;
  const memo = new Map<string, Plan>();
  const now = planHand(countsOf(hand), jokersIn(hand), memo);
  const turnsLeft = now.groups.length;

  if (!ctx.top) {
    const prefer = ctx.needs3S ? "3S" : null;
    const legal = (g: Group) => {
      const cards = cardsFor(g, hand, prefer);
      const combo = judgePlay(ctx, cards).allowed[0];
      return combo ? { cards, combo } : null;
    };
    const plays = now.groups.map(legal).filter((o): o is Option => !!o);
    if (plays.length === 0) return playOf(myId, options[0]);
    const control = (o: Option) => o.combo.type === "bomb" || usesTwosOrJokers(o) || (o.combo.type === "single" && bossSingle(o.cards[0], obs));
    // Nearly out: cash the play nobody can beat first, keep the lead, then finish.
    if (turnsLeft <= 2) return playOf(myId, plays.find(control) ?? plays[0]);
    let pool = plays.filter((o) => !control(o));
    if (pool.length === 0) pool = plays;
    // Someone's down to a card or two: lead something they can't follow.
    if (threat <= 2) {
      const wide = pool.filter((o) => o.cards.length > threat);
      if (wide.length) pool = wide;
      else return playOf(myId, [...pool].sort((a, b) => compareStrength(a.combo, b.combo))[0]);
    }
    return playOf(myId, [...pool].sort((a, b) => compareStrength(b.combo, a.combo))[0]);
  }

  const pressing = threat <= 3 || turnsLeft <= 3;
  let best: { o: Option; cost: number } | null = null;
  for (const o of options) {
    const rest = hand.filter((c) => !o.cards.includes(c));
    let cost = planHand(countsOf(rest), jokersIn(rest), memo).cost;
    if (o.combo.type === "bomb") cost += isBombable(ctx.top) && ctx.top.type !== "bomb" ? o.combo.tier * 3 : o.combo.tier * 4;
    else {
      const twos = o.cards.filter((c) => isStandard(c) && c.rank === 2).length;
      const wild = o.cards.filter((c) => c.kind === "joker").length;
      const boss = o.combo.type === "single" && bossSingle(o.cards[0], obs);
      if (!pressing && !boss) cost += twos * 45 + wild * 70;
    }
    if (!best || cost < best.cost) best = { o, cost };
  }
  // Play when it keeps the hand together (or someone is close to going out); otherwise pass.
  if (best && (pressing || best.cost < now.cost + TURN / 2)) return playOf(myId, best.o);
  return passOf(myId);
}

export function getThirteenBotAction(obs: ThirteenObservation, difficulty: BotDifficulty, rng: () => number = Math.random): ThirteenAction {
  const options = legalOptions(obs.hand, obs.ctx);
  if (options.length === 0) return passOf(obs.myId);
  if (difficulty === "easy") return easy(obs, options, rng);
  if (difficulty === "medium") return medium(obs, options);
  return hard(obs, options);
}
