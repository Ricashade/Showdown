import type { Rank } from "@/types/cards";
import type { GoFishEvent } from "@/types/gofish";
import { rankName, rankPlural, rankShort } from "@/lib/cards";

const COUNT = ["no", "one", "two", "three", "four"];

/** "one 8", "two 8s", "three Queens". */
export function cardsOf(n: number, rank: Rank) {
  const word = COUNT[n] ?? String(n);
  const face = rank >= 11 || rank === 14;
  if (n === 1) return `${word} ${face ? rankName(rank) : rankShort(rank)}`;
  return `${word} ${face ? rankPlural(rank) : `${rankShort(rank)}s`}`;
}

/** "8s", "Queens": what you ask for. */
export const plural = (rank: Rank) => (rank >= 11 ? rankPlural(rank) : `${rankShort(rank)}s`);

/** A line for the table feed and history log. */
export function describeEvent(e: GoFishEvent, name: (id: string) => string): string {
  if (e.kind === "book") return `📚 ${name(e.playerId)} completes a book of ${plural(e.rank)}`;
  if (e.kind === "refill") return `${name(e.playerId)} is out of cards and draws ${e.count === 1 ? "one" : e.count}`;
  const head = `${name(e.askerId)} asks ${name(e.targetId)} for ${plural(e.rank)}`;
  if (e.got > 0) return `🎯 ${name(e.askerId)} takes ${cardsOf(e.got, e.rank)} from ${name(e.targetId)}`;
  if (e.lucky) return `🍀 ${head}: go fish! Lucky catch, they drew one`;
  if (!e.fished) return `🐟 ${head}: go fish! The pond is empty`;
  return `🐟 ${head}: go fish!`;
}

/** What a player's speech bubble says about their last ask. */
export function bubbleFor(e: Extract<GoFishEvent, { kind: "ask" }>, name: (id: string) => string): string {
  const ask = `Asked ${name(e.targetId)} for ${plural(e.rank)}`;
  if (e.got > 0) return `${ask}: got ${COUNT[e.got] ?? e.got}`;
  return e.lucky ? `${ask}: lucky catch!` : `${ask}: go fish`;
}
