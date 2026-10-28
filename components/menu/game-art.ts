import type { GameId } from "@/lib/games";

/** Each game's little hand of cards: face-up cards ("AS KS"), plus how many face down. */
export const GAME_ART: Record<GameId, { show: string; hidden: number }> = {
  "texas-holdem": { show: "AS KS", hidden: 0 },
  "bs-poker": { show: "QD 8S 7H", hidden: 2 },
  blackjack: { show: "AC KH", hidden: 1 },
  garbage: { show: "AS 2H 3D", hidden: 2 },
  rummy: { show: "7S 8S 9S KH", hidden: 1 },
  war: { show: "AS AH", hidden: 1 },
};
