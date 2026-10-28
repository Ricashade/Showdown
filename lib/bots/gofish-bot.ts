/**
 * Go Fish bots. Everything here works from a `GoFishObservation`: the bot's own hand, card counts,
 * and the public record of asks, steals and books. Never anyone else's hand.
 */
import type { Rank } from "@/types/cards";
import type { BotDifficulty } from "@/types/game";
import type { GoFishAction, GoFishEvent } from "@/types/gofish";
import { getGoFishLegal, knownRanks, rankOf, type GoFishView } from "@/lib/gofish-engine";

export interface GoFishObservation {
  myId: string;
  /** How many of each rank the bot holds. */
  mine: Map<Rank, number>;
  /** Players it may ask, with how many cards each holds. */
  targets: { id: string; cards: number }[];
  log: GoFishEvent[];
}

export function observeGoFish(view: GoFishView, botId: string): GoFishObservation | null {
  const me = view.players.find((p) => p.id === botId);
  const legal = getGoFishLegal(view, botId);
  if (!me?.hand || !legal.isMyTurn) return null;
  const mine = new Map<Rank, number>();
  for (const c of me.hand) mine.set(rankOf(c), (mine.get(rankOf(c)) ?? 0) + 1);
  return {
    myId: botId,
    mine,
    targets: legal.targets.map((id) => ({ id, cards: view.players.find((p) => p.id === id)!.handCount })),
    log: view.log,
  };
}

const pick = <T,>(list: T[], rng: () => number) => list[Math.floor(rng() * list.length)];

/** Someone the bot knows holds a rank it has, preferring ranks it holds most of. */
function knownHit(obs: GoFishObservation, memory: Record<string, Set<Rank>>) {
  const ranks = [...obs.mine.keys()].sort((a, b) => obs.mine.get(b)! - obs.mine.get(a)!);
  for (const rank of ranks) {
    const holder = obs.targets.find((t) => memory[t.id]?.has(rank));
    if (holder) return { targetId: holder.id, rank };
  }
  return null;
}

export function chooseAsk(obs: GoFishObservation, difficulty: BotDifficulty, rng: () => number): { targetId: string; rank: Rank } {
  const ranks = [...obs.mine.keys()];
  const biggest = [...obs.targets].sort((a, b) => b.cards - a.cards)[0];

  // Easy forgets everything: anyone, any rank it holds.
  if (difficulty === "easy") return { targetId: pick(obs.targets, rng).id, rank: pick(ranks, rng) };

  if (difficulty === "medium") {
    // Remembers the last four asks: whoever asked for a rank it holds still has some.
    return knownHit(obs, knownRanks(obs.log, 4)) ?? { targetId: pick(obs.targets, rng).id, rank: pick(ranks, rng) };
  }

  // Hard remembers every ask, steal and book since the deal.
  const hit = knownHit(obs, knownRanks(obs.log));
  if (hit) return hit;
  // Go for the ranks it's closest to booking, from whoever holds the most cards.
  const most = Math.max(...ranks.map((r) => obs.mine.get(r)!));
  const close = ranks.filter((r) => obs.mine.get(r) === most);
  // With only singletons left it can't hide one; ask the player most likely to hold it.
  return { targetId: biggest.id, rank: pick(close, rng) };
}

export function getGoFishBotAction(obs: GoFishObservation, difficulty: BotDifficulty, rng: () => number = Math.random): GoFishAction {
  const { targetId, rank } = chooseAsk(obs, difficulty, rng);
  return { type: "ASK", playerId: obs.myId, targetId, rank };
}
