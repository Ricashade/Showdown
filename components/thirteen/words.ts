import type { Card, Rank } from "@/types/cards";
import type { JokerAs, ThirteenEvent } from "@/types/thirteen";
import { rankShort, suitSymbol } from "@/lib/cards";
import { describeCombo, power, suitPower } from "@/lib/thirteen-combos";

/** "A♥" or "A": what a Joker counts as. */
export const jokerLabel = (j: JokerAs) => `${rankShort(j.rank)}${j.suit ? suitSymbol(j.suit) : ""}`;

/** Each Joker in a play, by card id, with what it stands for. */
export function jokerLabels(cards: Card[], jokerAs: JokerAs[]): Record<string, string> {
  const out: Record<string, string> = {};
  let i = 0;
  for (const c of cards) if (c.kind === "joker" && jokerAs[i]) out[c.id] = jokerLabel(jokerAs[i++]);
  return out;
}

export type HandSort = "rank" | "suit";

const rankKey = (r: Rank) => power(r);

/** 3 → 2 → Jokers, or by suit (♠ ♣ ♦ ♥) and then rank. */
export function sortHand(hand: Card[], by: HandSort): Card[] {
  return [...hand].sort((a, b) => {
    if (a.kind === "joker") return b.kind === "joker" ? 0 : 1;
    if (b.kind === "joker") return -1;
    if (by === "suit") return suitPower(a.suit) - suitPower(b.suit) || rankKey(a.rank) - rankKey(b.rank);
    return rankKey(a.rank) - rankKey(b.rank) || suitPower(a.suit) - suitPower(b.suit);
  });
}

/** A line for the table feed. */
export function describeEvent(e: ThirteenEvent, name: (id: string) => string): string {
  if (e.kind === "pass") return `${name(e.by)} passed`;
  if (e.kind === "clear") return `Everyone passed, back to ${name(e.leader)}`;
  const what = describeCombo(e.combo);
  if (e.chop === "twos") return `${name(e.by)} beat the 2s with ${what}`;
  if (e.chop === "bomb") return `${name(e.by)} bombed over it with ${what}`;
  return `${name(e.by)} played ${what}`;
}
