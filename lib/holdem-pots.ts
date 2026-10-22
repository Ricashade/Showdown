/**
 * Side pots, built in layers from what each player put in this hand.
 *
 * Example: A all-in for 100, B and C each put in 300.
 *   Main pot  = 100 × 3 = 300, A/B/C can win it
 *   Side pot  = 200 × 2 = 400, only B/C can win it
 * Folded players' chips stay in the pots they reached but they can't win them, and a layer
 * only one player paid for (a bet nobody matched) goes straight back to that player.
 */
export interface Contribution {
  id: string;
  amount: number;
  folded: boolean;
}

export interface Pot {
  amount: number;
  /** Players still in the hand who can win this pot. */
  eligibleIds: string[];
}

export interface PotBuild {
  pots: Pot[];
  /** Unmatched chips returned to the player who bet them. */
  refunds: Record<string, number>;
}

export function buildPots(contributions: readonly Contribution[]): PotBuild {
  const levels = [...new Set(contributions.map((c) => c.amount).filter((a) => a > 0))].sort((a, b) => a - b);
  const pots: Pot[] = [];
  const refunds: Record<string, number> = {};
  let previous = 0;

  for (const level of levels) {
    const payers = contributions.filter((c) => c.amount >= level);
    const layer = (level - previous) * payers.length;
    previous = level;
    if (payers.length === 1) {
      // Nobody matched this part of the bet.
      const id = payers[0].id;
      refunds[id] = (refunds[id] ?? 0) + layer;
      continue;
    }
    const eligibleIds = payers.filter((c) => !c.folded).map((c) => c.id);
    const last = pots[pots.length - 1];
    if (eligibleIds.length === 0) {
      // Only folded players reached this layer: the chips join the pot below.
      if (last) last.amount += layer;
      else pots.push({ amount: layer, eligibleIds: [] });
    } else if (last && sameSet(last.eligibleIds, eligibleIds)) {
      last.amount += layer;
    } else {
      pots.push({ amount: layer, eligibleIds });
    }
  }
  return { pots, refunds };
}

function sameSet(a: string[], b: string[]) {
  return a.length === b.length && a.every((x) => b.includes(x));
}

/**
 * Split `amount` between tied winners. Odd chips go one at a time to the winners closest to
 * the left of the button, which is the usual house rule.
 */
export function splitPot(amount: number, winnerIdsInSeatOrderFromButton: readonly string[]): Record<string, number> {
  const n = winnerIdsInSeatOrderFromButton.length;
  const base = Math.floor(amount / n);
  let odd = amount - base * n;
  const shares: Record<string, number> = {};
  for (const id of winnerIdsInSeatOrderFromButton) {
    shares[id] = base + (odd > 0 ? 1 : 0);
    odd--;
  }
  return shares;
}
