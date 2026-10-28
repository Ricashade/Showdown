"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import clsx from "clsx";
import { motion } from "framer-motion";
import { handValue, SETTLE_MS, type BlackjackView } from "@/lib/blackjack-engine";
import { PlayingCard } from "@/components/ui/PlayingCard";
import type { Card } from "@/types/cards";
import { useSecondsLeft } from "./BlackjackActions";
import { chips } from "./BlackjackTable";

const OUTCOME_WORD = { blackjack: "Blackjack", win: "Win", push: "Push", lose: "Lose", bust: "Bust" } as const;

interface RoundResultProps {
  view: BlackjackView;
  /** The host can deal straight away instead of waiting. */
  onDealNow?: () => void;
  onClose: () => void;
}

/** Who won what this round, then the next betting round opens by itself. */
export function RoundResult({ view, onDealNow, onClose }: RoundResultProps) {
  const r = view.result!;
  const left = useSecondsLeft(view.phase === "settled" ? view.deadline : null);
  const primaryRef = useRef<HTMLButtonElement>(null);
  useEffect(() => primaryRef.current?.focus(), []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const dealer = view.dealer.cards.filter((c): c is Card => c !== null);
  const headline = r.dealerBlackjack ? "Dealer has blackjack" : r.dealerBust ? `Dealer busts with ${r.dealerTotal}` : `Dealer stands on ${r.dealerTotal}`;
  const played = view.players.filter((p) => p.hands.length > 0);
  const out = view.players.filter((p) => p.bustedInRound === r.roundNumber);

  return (
    <motion.div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/70 p-4" initial={{ opacity: 0 }} animate={{ opacity: 1 }} onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="round-title"
        onClick={(e) => e.stopPropagation()}
        className="relative my-auto w-full max-w-xl rounded-[2rem] bg-smoke-raised p-6 shadow-2xl ring-1 ring-leather-lit sm:p-9"
      >
        <div className="flex items-center gap-4">
          <div className="flex">
            {dealer.map((c, i) => (
              <div key={c.id} className={clsx(i > 0 && "-ml-6")}>
                <PlayingCard card={c} size="sm" entrance={false} />
              </div>
            ))}
          </div>
          <h2 id="round-title" className={clsx("font-display text-4xl leading-tight font-extrabold", r.dealerBust ? "text-brass-lit" : "text-bone")}>
            {headline}
          </h2>
        </div>

        <ul className="mt-6 divide-y divide-leather-lit border-y border-leather-lit">
          {played.map((p) => {
            const net = r.net[p.id] ?? 0;
            const outcomes = p.hands.map((h) =>
              !h.outcome ? "" : h.outcome === "blackjack" ? OUTCOME_WORD.blackjack : `${OUTCOME_WORD[h.outcome]} (${handValue(h.cards).total})`,
            );
            return (
              <li key={p.id} className="flex items-baseline justify-between gap-4 py-3">
                <div className="min-w-0">
                  <p className="truncate text-lg font-bold text-bone">
                    {p.name}
                    {view.viewerId === p.id && <span className="ml-1.5 text-sm font-normal text-brass-lit">you</span>}
                  </p>
                  <p className="text-sm text-parchment">
                    {outcomes.join(" · ")}
                    {r.insuranceWon[p.id] ? ` · Insurance pays ${chips(r.insuranceWon[p.id])}` : ""}
                  </p>
                </div>
                <span className={clsx("shrink-0 font-display text-3xl font-extrabold tabular-nums", net > 0 ? "text-brass-lit" : net < 0 ? "text-parchment" : "text-bone")}>
                  {net > 0 ? `+${chips(net)}` : net < 0 ? `−${chips(-net)}` : "Even"}
                </span>
              </li>
            );
          })}
        </ul>

        {out.length > 0 && (
          <p className="mt-4 text-base font-bold text-chip-lit">
            {out.map((p) => p.name).join(", ")} {out.length === 1 ? "is" : "are"} out of chips.
          </p>
        )}

        <div className="mt-6 flex flex-wrap items-center gap-3">
          {onDealNow ? (
            <button
              ref={primaryRef}
              onClick={onDealNow}
              className="min-h-12 rounded-full bg-brass px-7 font-display text-2xl font-bold text-smoke transition hover:bg-brass-lit"
            >
              Next round{left !== null ? ` in ${left}` : ""}
            </button>
          ) : (
            <>
              <button ref={primaryRef} onClick={onClose} className="min-h-12 rounded-full border border-bone/40 px-6 text-base font-bold text-bone hover:border-bone">
                Close
              </button>
              {left !== null && <span className="text-base text-parchment tabular-nums">Next round in {left}</span>}
            </>
          )}
        </div>
        {/* Runs down with the auto-advance. */}
        {left !== null && (
          <div aria-hidden className="absolute inset-x-8 bottom-0 h-1 overflow-hidden rounded-full">
            <div className="h-full bg-brass/70 transition-[width] duration-300 ease-linear" style={{ width: `${Math.min(100, (left / (SETTLE_MS / 1000)) * 100)}%` }} />
          </div>
        )}
      </div>
    </motion.div>
  );
}

export function BlackjackGameOver({ view, actions, canPlayAgain, onPlayAgain }: { view: BlackjackView; canPlayAgain: boolean; onPlayAgain: () => void; actions?: React.ReactNode }) {
  const hostName = view.players.find((p) => p.id === view.hostId)?.name ?? "the host";
  const againRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLAnchorElement>(null);
  useEffect(() => (againRef.current ?? menuRef.current)?.focus(), []);
  // Whoever lasted longest comes first.
  const standings = [...view.players].sort((a, b) => (b.bustedInRound ?? Infinity) - (a.bustedInRound ?? Infinity) || b.chips - a.chips);

  return (
    <motion.div className="fixed inset-0 z-40 flex items-center justify-center overflow-y-auto bg-black/80 p-4" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
      <div role="dialog" aria-modal="true" aria-labelledby="house-title" className="felt my-auto w-full max-w-md rounded-[2rem] p-7 sm:p-9">
        <h2 id="house-title" className="font-display text-6xl leading-none font-extrabold text-bone">
          The house wins
        </h2>
        <ol className="mt-6 divide-y divide-baize-deep border-y border-baize-deep">
          {standings.map((p, i) => (
            <li key={p.id} className="flex items-baseline justify-between gap-3 py-2.5 text-base">
              <span className="flex items-baseline gap-3">
                <span className="w-5 font-display text-xl font-bold text-bone tabular-nums">{i + 1}</span>
                <span className="text-bone">{p.name}</span>
              </span>
              <span className="text-sm text-bone tabular-nums">Out in round {p.bustedInRound}</span>
            </li>
          ))}
        </ol>
        {actions ?? (
          <>
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
          </>
        )}
      </div>
    </motion.div>
  );
}
