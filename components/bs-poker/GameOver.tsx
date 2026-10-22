"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import type { BsPokerView } from "@/lib/bs-poker-game";

export function GameOver({
  view,
  onPlayAgain,
  canPlayAgain = true,
}: {
  view: BsPokerView;
  onPlayAgain: () => void;
  /** Online, only the host can reset the table. */
  canPlayAgain?: boolean;
}) {
  const hostName = view.players.find((p) => p.id === view.hostId)?.name ?? "the host";
  const winner = view.players.find((p) => p.id === view.winnerId);
  const againRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLAnchorElement>(null);
  useEffect(() => (againRef.current ?? menuRef.current)?.focus(), []);

  // Winner first, then latest-out to earliest-out.
  const standings = [...view.players].sort((a, b) => {
    if (a.id === view.winnerId) return -1;
    if (b.id === view.winnerId) return 1;
    return (b.eliminatedInRound ?? 0) - (a.eliminatedInRound ?? 0);
  });

  return (
    <motion.div
      className="fixed inset-0 z-40 flex items-center justify-center overflow-y-auto bg-black/80 p-4"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="winner-title"
        className="felt my-auto w-full max-w-md rounded-[2rem] p-7 sm:p-9"
      >
        <h2 id="winner-title" className="font-display text-6xl leading-none font-extrabold text-bone">
          {winner ? `${winner.name} wins` : "No winner"}
        </h2>
        <p className="mt-2 text-base text-bone">
          Last player standing after {view.round} {view.round === 1 ? "round" : "rounds"}.
        </p>

        <ol className="mt-6 divide-y divide-baize-deep border-y border-baize-deep">
          {standings.map((p, i) => (
            <li key={p.id} className="flex items-baseline justify-between gap-3 py-2.5 text-base">
              <span className="flex items-baseline gap-3">
                <span className="w-5 font-display text-xl font-bold text-bone tabular-nums">{i + 1}</span>
                <span className={i === 0 ? "font-bold text-bone" : "text-bone"}>{p.name}</span>
              </span>
              <span className="text-sm text-bone">
                {p.id === view.winnerId ? "Still in" : `Out in round ${p.eliminatedInRound}`}
              </span>
            </li>
          ))}
        </ol>

        {!canPlayAgain && <p className="mt-6 text-base text-bone">Waiting for {hostName} to start a new game.</p>}
        <div className="mt-7 flex flex-wrap gap-3">
          {canPlayAgain && (
            <button
              ref={againRef}
              onClick={onPlayAgain}
              className="min-h-12 flex-1 rounded-full bg-brass px-6 font-display text-2xl font-bold text-smoke transition hover:bg-brass-lit"
            >
              Play again
            </button>
          )}
          <Link
            ref={menuRef}
            href="/"
            className="flex min-h-12 flex-1 items-center justify-center rounded-full border border-bone/40 px-6 text-base font-bold text-bone hover:border-bone"
          >
            Main menu
          </Link>
        </div>
      </div>
    </motion.div>
  );
}
