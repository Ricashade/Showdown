/**
 * The order cards leave the deck during a deal, as a real dealer would do it: hands one card
 * at a time around the table starting with the first bidder, then burn → 3 table cards,
 * burn → 1, burn → 1. Used only for the dealing animation (the shuffled deck already decided
 * who gets what).
 */
import { TABLE_RUNS } from "./bs-poker-game";

export const handSlot = (playerId: string, i: number) => `hand:${playerId}:${i}`;
export const tableSlot = (i: number) => `table:${i}`;
export const burnSlot = (i: number) => `burn:${i}`;

export interface DealPlan {
  /** Slot key → position in the deal (0 = first card off the deck). */
  order: Map<string, number>;
  count: number;
}

export function planDeal(
  players: readonly { id: string; status: string; cardCount: number }[],
  starterId: string | null,
  tableRuns: readonly number[] = TABLE_RUNS,
): DealPlan {
  const active = players.filter((p) => p.status === "active");
  const start = Math.max(0, active.findIndex((p) => p.id === starterId));
  const rotation = [...active.slice(start), ...active.slice(0, start)];
  const order = new Map<string, number>();
  let n = 0;

  const most = Math.max(0, ...rotation.map((p) => p.cardCount));
  for (let round = 0; round < most; round++) {
    for (const p of rotation) if (p.cardCount > round) order.set(handSlot(p.id, round), n++);
  }
  let table = 0;
  tableRuns.forEach((run, burn) => {
    order.set(burnSlot(burn), n++);
    for (let k = 0; k < run; k++) order.set(tableSlot(table++), n++);
  });
  return { order, count: n };
}

/** Hold'em streets: which board cards each burn comes before. */
const HOLDEM_STREETS = [
  { burn: 0, cards: [0, 1, 2], shown: 3 },
  { burn: 1, cards: [3], shown: 4 },
  { burn: 2, cards: [4], shown: 5 },
];

/**
 * A Hold'em deal: optionally the hole cards (two passes around the table, starting left of
 * the button), then every street turned between `fromShown` and `toShown` board cards, each
 * after its burn. An all-in runout turns several streets in one deal.
 */
export function planHoldemDeal(opts: {
  players: readonly { id: string; inHand: boolean }[];
  buttonId: string | null;
  holeCards: boolean;
  fromShown: number;
  toShown: number;
}): DealPlan {
  const order = new Map<string, number>();
  let n = 0;
  if (opts.holeCards) {
    const seats = opts.players.filter((p) => p.inHand);
    const button = seats.findIndex((p) => p.id === opts.buttonId);
    const rotation = [...seats.slice(button + 1), ...seats.slice(0, button + 1)];
    for (let pass = 0; pass < 2; pass++) for (const p of rotation) order.set(handSlot(p.id, pass), n++);
  }
  for (const street of HOLDEM_STREETS) {
    if (street.shown <= opts.fromShown || street.shown > opts.toShown) continue;
    order.set(burnSlot(street.burn), n++);
    for (const i of street.cards) order.set(tableSlot(i), n++);
  }
  return { order, count: n };
}
