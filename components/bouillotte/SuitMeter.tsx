"use client";

import { useEffect, useState } from "react";
import clsx from "clsx";
import { motion, useReducedMotion } from "framer-motion";
import { Star } from "lucide-react";
import type { Suit } from "@/types/cards";
import { isRedSuit, suitName, suitSymbol } from "@/lib/cards";

const ORDER: Suit[] = ["S", "H", "D", "C"];
const COUNT_MS = 1100;

/** Le Point, counted up: every suit's points across all the hands dealt and the Retourné. */
export function SuitMeter({ totals, winner }: { totals: Record<Suit, number>; winner: Suit | null }) {
  const reduceMotion = useReducedMotion();
  const [t, setT] = useState(reduceMotion ? 1 : 0);
  useEffect(() => {
    if (reduceMotion) return setT(1);
    const start = performance.now();
    let frame = requestAnimationFrame(function tick(now) {
      const k = Math.min(1, (now - start) / COUNT_MS);
      setT(k);
      if (k < 1) frame = requestAnimationFrame(tick);
    });
    return () => cancelAnimationFrame(frame);
  }, [totals, reduceMotion]);
  const max = Math.max(...Object.values(totals), 1);

  return (
    <ul aria-label="Le Point" className="grid gap-2">
      {ORDER.map((suit) => {
        const top = suit === winner;
        const shown = Math.round(totals[suit] * t);
        return (
          <li key={suit} className="grid grid-cols-[6.5rem_1fr_3.5rem] items-center gap-3" aria-label={`${suitName(suit)}: ${totals[suit]} points${top ? ", wins Le Point" : ""}`}>
            <span className={clsx("flex items-center gap-1.5 text-base", top ? "font-bold text-bone" : "text-parchment")}>
              <span aria-hidden className={clsx("w-4 text-center text-lg", isRedSuit(suit) ? "text-chip-lit" : "text-bone")}>
                {suitSymbol(suit)}
              </span>
              {suitName(suit)}
            </span>
            <div className="h-2.5 overflow-hidden rounded-full bg-black/30">
              <motion.div className={clsx("h-full rounded-full", top ? "bg-brass-lit" : "bg-bone/35")} style={{ width: `${(totals[suit] / max) * 100 * t}%` }} />
            </div>
            <span className={clsx("flex items-center justify-end gap-1 font-display text-xl font-bold tabular-nums", top ? "text-brass-lit" : "text-bone")}>
              {shown}
              {top && t === 1 && <Star className="size-4 fill-current" aria-hidden />}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
