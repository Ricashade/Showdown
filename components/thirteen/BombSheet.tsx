"use client";

import { useEffect, useRef } from "react";
import clsx from "clsx";
import { motion } from "framer-motion";
import { X } from "lucide-react";
import { BOMBS } from "@/lib/thirteen-combos";

const CAP_WORDS = ["", "one 2", "two 2s", "three 2s", "four 2s", "five 2s"];

/** One tint per reach, deepening from leather to lit brass: the further a bomb reaches, the brighter. */
const CAP_TINT: Record<string, string> = {
  1: "bg-leather-lit text-parchment",
  2: "bg-brass-deep/55 text-bone",
  3: "bg-brass-deep text-bone",
  4: "bg-brass/75 text-smoke",
  5: "bg-brass text-smoke",
  all: "bg-brass-lit text-smoke",
};
const capKey = (cap: number) => (cap === Infinity ? "all" : String(cap));

/** The seventeen bombs, weakest to strongest, with how many 2s each can beat. */
export function BombTable({ highlight }: { highlight?: number }) {
  return (
    <table className="w-full border-separate border-spacing-y-1 text-left">
      <thead>
        <tr className="text-sm text-ash">
          <th scope="col" className="w-10 pb-1 font-normal">
            Tier
          </th>
          <th scope="col" className="pb-1 font-normal">
            Bomb
          </th>
          <th scope="col" className="hidden pb-1 font-normal sm:table-cell">
            Like
          </th>
          <th scope="col" className="pb-1 text-right font-normal">
            Beats
          </th>
        </tr>
      </thead>
      <tbody>
        {BOMBS.map((b) => (
          <tr key={b.tier} className={clsx("text-base", highlight === b.tier ? "bg-brass/15" : "bg-smoke/60")}>
            <td className="rounded-l-xl py-2 pl-3 font-display text-xl font-bold text-bone tabular-nums">{b.tier}</td>
            <td className="py-2 pr-2 text-bone">
              {b.name}
              <span className="block font-display text-sm tracking-wide text-ash sm:hidden">{b.example}</span>
            </td>
            <td className="hidden py-2 pr-2 font-display text-lg tracking-wide whitespace-nowrap text-parchment sm:table-cell">{b.example}</td>
            <td className="rounded-r-xl py-2 pr-3 text-right">
              <span className={clsx("inline-block rounded-full px-2.5 py-0.5 text-sm font-bold whitespace-nowrap", CAP_TINT[capKey(b.cap)])}>
                {b.cap === Infinity ? "any 2s" : CAP_WORDS[b.cap]}
              </span>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** The bomb ladder in a side drawer, to check mid-hand without leaving the table. */
export function BombSheetDrawer({ onClose }: { onClose: () => void }) {
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <motion.div className="fixed inset-0 z-50 flex justify-end bg-black/50" initial={{ opacity: 0 }} animate={{ opacity: 1 }} onClick={onClose}>
      <motion.div
        role="dialog"
        aria-modal="true"
        aria-labelledby="bombs-title"
        onClick={(e) => e.stopPropagation()}
        initial={{ x: 40 }}
        animate={{ x: 0 }}
        className="flex h-full w-full max-w-md flex-col bg-smoke-raised p-5 shadow-2xl ring-1 ring-leather-lit"
      >
        <div className="flex items-center justify-between gap-3">
          <h2 id="bombs-title" className="font-display text-3xl font-extrabold text-bone">
            Bombs
          </h2>
          <button ref={closeRef} onClick={onClose} aria-label="Close" className="grid size-11 place-items-center rounded-full text-bone hover:bg-black/30">
            <X className="size-5" />
          </button>
        </div>
        <p className="mt-1 text-sm text-parchment">Only on 2s or a weaker bomb. A higher tier always wins.</p>
        <div className="mt-3 flex-1 overflow-y-auto pr-1">
          <BombTable />
        </div>
      </motion.div>
    </motion.div>
  );
}
