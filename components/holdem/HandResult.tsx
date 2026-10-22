"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import type { HoldemView } from "@/lib/holdem-game";
import { PlayingCard } from "@/components/ui/PlayingCard";

const chips = (n: number) => n.toLocaleString("en-US");

function names(list: string[]) {
  return list.length <= 1 ? list.join("") : `${list.slice(0, -1).join(", ")} and ${list[list.length - 1]}`;
}

interface HandResultProps {
  view: HoldemView;
  winningCardIds: Set<string>;
  continueLabel: string;
  onContinue: () => void;
  /** Guests online: who they're waiting on to deal. */
  waitingText?: string;
  /** Local play: continue by itself after this many seconds. */
  autoContinueSeconds?: number;
}

export function HandResult({ view, winningCardIds, continueLabel, onContinue, waitingText, autoContinueSeconds }: HandResultProps) {
  const result = view.result!;
  const name = (id: string) => view.players.find((p) => p.id === id)?.name ?? "?";
  const continueRef = useRef<HTMLButtonElement>(null);
  const [countdown, setCountdown] = useState<number | null>(autoContinueSeconds ?? null);

  useEffect(() => continueRef.current?.focus(), []);
  useEffect(() => {
    if (countdown === null) return;
    if (countdown <= 0) return onContinue();
    const t = setTimeout(() => setCountdown((n) => (n === null ? null : n - 1)), 1000);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [countdown]);

  const busted = view.players.filter((p) => p.bustedInHand === result.handNumber);
  const shown = view.players.filter((p) => result.revealed[p.id]);

  return (
    <motion.div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/75 p-4" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="result-title"
        className="relative my-auto w-full max-w-2xl rounded-[2rem] bg-smoke-raised p-6 shadow-2xl ring-1 ring-leather-lit sm:p-9"
      >
        <h2 id="result-title" className="sr-only">
          Hand {result.handNumber} result
        </h2>
        <ul className="space-y-3">
          {result.pots.map((pot, i) => {
            const split = pot.winnerIds.length > 1;
            const label = result.best[pot.winnerIds[0]]?.label;
            const potName = result.pots.length > 1 ? (i === 0 ? "Main pot" : "Side pot") : null;
            return (
              <li key={i}>
                {potName && <p className="text-sm text-ash">{potName}</p>}
                <p className="font-display text-4xl leading-tight font-extrabold text-bone">
                  {split
                    ? `${names(pot.winnerIds.map(name))} split ${chips(pot.amount)}`
                    : `${name(pot.winnerIds[0])} wins ${chips(pot.amount)}`}
                </p>
                {label && <p className="text-lg text-brass-lit">{label}</p>}
              </li>
            );
          })}
        </ul>
        {result.uncontested && <p className="mt-1 text-base text-parchment">Everyone else folded.</p>}

        {!result.uncontested && (
          <ul className="mt-6 divide-y divide-leather-lit border-y border-leather-lit">
            <li className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center">
              <span className="w-32 shrink-0 text-base text-parchment">Board</span>
              <div className="flex gap-1.5">
                {view.board.map((c) => (
                  <PlayingCard key={c.id} card={c} size="sm" entrance={false} highlight={winningCardIds.has(c.id) ? "match" : null} dimmed={!winningCardIds.has(c.id)} />
                ))}
              </div>
            </li>
            {shown.map((p) => (
              <li key={p.id} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center">
                <span className="w-32 shrink-0 truncate text-base text-parchment">{p.name}</span>
                <div className="flex gap-1.5">
                  {result.revealed[p.id].map((c) => (
                    <PlayingCard key={c.id} card={c} size="sm" entrance={false} highlight={winningCardIds.has(c.id) ? "match" : null} dimmed={!winningCardIds.has(c.id)} />
                  ))}
                </div>
                <span className="text-sm text-bone sm:ml-3">{result.best[p.id]?.label}</span>
              </li>
            ))}
          </ul>
        )}

        {busted.length > 0 && (
          <p className="mt-5 text-lg font-bold text-chip-lit">
            {names(busted.map((p) => p.name))} {busted.length === 1 ? "is" : "are"} out.
          </p>
        )}

        <div className="mt-6">
          {waitingText ? (
            <p className="text-base text-ash">{waitingText}</p>
          ) : (
            <div className="flex flex-wrap items-center gap-3">
              <button
                ref={continueRef}
                onClick={onContinue}
                className="min-h-12 rounded-full bg-brass px-8 font-display text-2xl font-bold text-smoke transition hover:bg-brass-lit"
              >
                {countdown !== null ? `${continueLabel} in ${countdown}` : continueLabel}
              </button>
              {countdown !== null && (
                <button onClick={() => setCountdown(null)} className="min-h-12 rounded-full border border-bone/40 px-6 text-base font-bold text-bone hover:border-bone">
                  Wait
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );
}

export function HoldemGameOver({ view, canPlayAgain, onPlayAgain }: { view: HoldemView; canPlayAgain: boolean; onPlayAgain: () => void }) {
  const winner = view.players.find((p) => p.id === view.winnerId);
  const hostName = view.players.find((p) => p.id === view.hostId)?.name ?? "the host";
  const againRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLAnchorElement>(null);
  useEffect(() => (againRef.current ?? menuRef.current)?.focus(), []);
  const standings = [...view.players].sort((a, b) => {
    if (a.id === view.winnerId) return -1;
    if (b.id === view.winnerId) return 1;
    return (b.bustedInHand ?? 0) - (a.bustedInHand ?? 0);
  });

  return (
    <motion.div className="fixed inset-0 z-40 flex items-center justify-center overflow-y-auto bg-black/80 p-4" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
      <div role="dialog" aria-modal="true" aria-labelledby="winner-title" className="felt my-auto w-full max-w-md rounded-[2rem] p-7 sm:p-9">
        <h2 id="winner-title" className="font-display text-6xl leading-none font-extrabold text-bone">
          {winner ? `${winner.name} wins` : "No winner"}
        </h2>
        <ol className="mt-6 divide-y divide-baize-deep border-y border-baize-deep">
          {standings.map((p, i) => (
            <li key={p.id} className="flex items-baseline justify-between gap-3 py-2.5 text-base">
              <span className="flex items-baseline gap-3">
                <span className="w-5 font-display text-xl font-bold text-bone tabular-nums">{i + 1}</span>
                <span className={i === 0 ? "font-bold text-bone" : "text-bone"}>{p.name}</span>
              </span>
              <span className="text-sm text-bone tabular-nums">
                {p.id === view.winnerId ? chips(p.chips) : `Out in hand ${p.bustedInHand}`}
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
