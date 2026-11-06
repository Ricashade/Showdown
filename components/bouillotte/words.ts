import type { Rank } from "@/types/cards";
import type { Brelan } from "@/types/bouillotte";
import { rankPlural, rankShort } from "@/lib/cards";

export const chips = (n: number) => n.toLocaleString("en-US");

/** "9s", "Kings". */
const plural = (r: Rank) => (r >= 11 ? rankPlural(r) : `${rankShort(r)}s`);

/** "Brélan carré of Kings", "Brélan of 9s", "Brélan of Aces with the Retourné". */
export function brelanWords(b: Brelan) {
  if (b.kind === "carre") return `Brélan carré of ${plural(b.rank)}`;
  if (b.kind === "favori") return `Brélan of ${plural(b.rank)} with the Retourné`;
  return `Brélan of ${plural(b.rank)}`;
}
