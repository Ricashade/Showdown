"use client";

import { useEffect, useRef, useState } from "react";
import clsx from "clsx";
import { motion } from "framer-motion";
import { ListOrdered, X } from "lucide-react";
import type { Card, StandardCard } from "@/types/cards";
import { evaluateFive, HOLDEM_CATEGORY, madeHand } from "@/lib/holdem-hand";
import { Fan } from "@/components/rules/HowToDialog";
import { cards } from "@/components/rules/sample-cards";

/** One example per hand, strongest first. Names come from the evaluator the table uses. */
const EXAMPLES = ["AH KH QH JH TH", "9S 9H 9D 9C KS", "KS KH KD 4C 4S", "AD JD 8D 5D 2D", "9C 8D 7S 6H 5C", "7S 7H 7D KC 2S", "JS JH 4D 4C AS", "QS QH 9D 6C 3S", "AS JH 8D 5C 3S"].map((spec) => ({
  spec,
  category: evaluateFive(cards(spec) as StandardCard[]).category,
}));

/** Every Hold'em hand from best to worst. `current` marks the hand you hold. */
export function HandRankingsList({ current }: { current?: number | null }) {
  return (
    <ol className="space-y-1.5">
      {EXAMPLES.map(({ spec, category }, i) => {
        const yours = current === category;
        return (
          <li
            key={spec}
            aria-current={yours || undefined}
            className={clsx("flex items-center justify-between gap-3 rounded-2xl py-1 pr-1 pl-2", yours && "bg-leather ring-2 ring-brass-lit")}
          >
            <span className="flex items-baseline gap-2.5">
              <span className="w-4 font-display text-lg font-bold text-ash tabular-nums">{i + 1}</span>
              <span className="text-base text-bone">{HOLDEM_CATEGORY[category]}</span>
              {yours && <span className="text-sm font-bold text-brass-lit">you</span>}
            </span>
            <Fan spec={spec} />
          </li>
        );
      })}
    </ol>
  );
}

/** A button at the table that pulls out the hand rankings, with your current hand marked. */
export function HandRankingsButton({ myCards }: { myCards: Card[] | null }) {
  const [open, setOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const made = myCards ? madeHand(myCards) : null;

  const close = () => {
    setOpen(false);
    requestAnimationFrame(() => buttonRef.current?.focus());
  };

  useEffect(() => {
    if (!open) return;
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setOpen(false);
      requestAnimationFrame(() => buttonRef.current?.focus());
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <>
      <button
        ref={buttonRef}
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        className="flex min-h-11 items-center gap-2 rounded-full px-4 text-sm font-bold text-parchment ring-1 ring-leather-lit transition hover:text-bone hover:ring-brass"
      >
        <ListOrdered className="size-4" aria-hidden />
        Hand rankings
      </button>

      {open && (
        <motion.div className="fixed inset-0 z-50 flex justify-end bg-black/60" initial={{ opacity: 0 }} animate={{ opacity: 1 }} onClick={close}>
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-labelledby="rankings-title"
            onClick={(e) => e.stopPropagation()}
            initial={{ x: 40 }}
            animate={{ x: 0 }}
            transition={{ type: "spring", stiffness: 400, damping: 36 }}
            className="flex h-full w-full max-w-sm flex-col overflow-y-auto bg-smoke-raised p-5 shadow-2xl ring-1 ring-leather-lit sm:p-6"
          >
            <div className="flex items-center justify-between gap-3">
              <h2 id="rankings-title" className="font-display text-3xl font-extrabold text-bone">
                Hand rankings
              </h2>
              <button ref={closeRef} onClick={close} aria-label="Close" className="grid size-11 place-items-center rounded-full text-bone hover:bg-black/30">
                <X className="size-5" />
              </button>
            </div>
            {made && (
              <p className="mt-1 text-base text-parchment">
                Your hand: <span className="font-bold text-brass-lit">{made.label}</span>
              </p>
            )}
            <div className="mt-4">
              <HandRankingsList current={made?.category} />
            </div>
          </motion.div>
        </motion.div>
      )}
    </>
  );
}
