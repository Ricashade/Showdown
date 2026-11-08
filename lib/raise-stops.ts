/** Pot-sized steps players reach for, as fractions of the pot once you've called. */
const POT_STEPS: [string, number][] = [
  ["⅓ pot", 1 / 3],
  ["½ pot", 1 / 2],
  ["¾ pot", 3 / 4],
  ["Pot", 1],
  ["2× pot", 2],
];

/**
 * The raise amounts a betting game offers as quick picks (and its slider stops at): the minimum,
 * pot steps, then all in. `min`/`max` are the smallest and largest legal "raise to" amounts.
 */
export function raiseStops({ min, max, currentBet, potAfterCall, allInWord }: { min: number; max: number; currentBet: number; potAfterCall: number; allInWord: string }) {
  if (min >= max) return [{ label: allInWord, to: max }];
  const stops = [{ label: "Min", to: min }];
  for (const [label, f] of POT_STEPS) {
    const to = Math.round(currentBet + potAfterCall * f);
    // Skip a step that doesn't raise past the last one, or that's really all in.
    if (to > stops[stops.length - 1].to && to < max) stops.push({ label, to });
  }
  stops.push({ label: allInWord, to: max });
  return stops;
}
