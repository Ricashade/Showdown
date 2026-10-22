"use client";

import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import clsx from "clsx";
import type { BsPokerView } from "@/lib/bs-poker-game";
import { bidLabel, isWildCard } from "@/lib/bs-poker-engine";
import { sortCards } from "@/lib/cards";
import { PlayingCard } from "@/components/ui/PlayingCard";
import { wildLabel } from "./PlayerSeat";

interface ShowdownModalProps {
  view: BsPokerView;
  onContinue: () => void;
  continueLabel: string;
  /** Online guests wait for the host to deal; this explains who they're waiting for. */
  waitingText?: string;
  /** Continue by itself after this many seconds, unless the player asks to wait. */
  autoContinueSeconds?: number;
}

const FLIP_MS = 600;

/** The game's single orchestrated moment: stamp, flip every hand, then the verdict. */
export function ShowdownModal({ view, onContinue, continueLabel, waitingText, autoContinueSeconds }: ShowdownModalProps) {
  const sd = view.showdown!;
  const [flipped, setFlipped] = useState(false);
  const [verdict, setVerdict] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);
  const continueRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    dialogRef.current?.focus();
    const a = setTimeout(() => setFlipped(true), reduce ? 0 : 400);
    const b = setTimeout(() => setVerdict(true), reduce ? 0 : 400 + FLIP_MS + 300);
    return () => {
      clearTimeout(a);
      clearTimeout(b);
    };
  }, [sd.round]);

  useEffect(() => {
    if (verdict) continueRef.current?.focus();
  }, [verdict]);

  // Local play: count down to the next hand once the verdict is showing.
  const [countdown, setCountdown] = useState<number | null>(null);
  useEffect(() => {
    if (verdict && autoContinueSeconds) setCountdown(autoContinueSeconds);
  }, [verdict, autoContinueSeconds]);
  useEffect(() => {
    if (countdown === null) return;
    if (countdown <= 0) return onContinue();
    const t = setTimeout(() => setCountdown((n) => (n === null ? null : n - 1)), 1000);
    return () => clearTimeout(t);
    // onContinue is recreated each render; the countdown alone drives this.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [countdown]);

  const name = (id: string) => view.players.find((p) => p.id === id)?.name ?? "?";
  const { evaluation: ev } = sd;
  const used = new Set(ev.cardIds);
  const wilds = new Map(ev.wildAssignments.map((w) => [w.cardId, w]));
  const loser = name(sd.loserId);
  const seated = view.players.filter((p) => sd.revealedHands[p.id]);
  const gameOver = view.phase === "game_over";
  const dimOthers = verdict && used.size > 0;

  return (
    <motion.div
      className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/80 p-4"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="showdown-title"
        aria-describedby="showdown-verdict"
        tabIndex={-1}
        className="relative my-auto w-full max-w-2xl rounded-[2rem] bg-smoke-raised p-6 shadow-2xl ring-1 ring-leather-lit outline-none sm:p-9"
      >
        <div className="text-center">
          <motion.div
            aria-hidden
            initial={{ scale: 2.2, rotate: -14, opacity: 0 }}
            animate={{ scale: 1, rotate: -5, opacity: 1 }}
            transition={{ type: "spring", stiffness: 420, damping: 16 }}
            className="inline-block rounded-lg border-4 border-chip px-4 pt-1 font-display text-5xl font-extrabold text-chip-lit"
          >
            BS!
          </motion.div>
          <h2 id="showdown-title" className="mt-4 text-lg text-parchment">
            {name(sd.callerId)} called BS on {name(sd.bidderId)}&apos;s bid
          </h2>
          <p className="font-display text-5xl leading-tight font-extrabold text-bone">{bidLabel(sd.bid)}</p>
        </div>

        <ul className="mt-6 divide-y divide-leather-lit border-y border-leather-lit">
          {sd.tableCards.length > 0 && (
            <li className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center">
              <span className="w-32 shrink-0 text-base text-parchment">Table</span>
              <div className="flex flex-wrap gap-1.5 pb-2">
                {sd.tableCards.map((c) => {
                  const w = wilds.get(c.id);
                  return (
                    <PlayingCard
                      key={c.id}
                      card={c}
                      size="sm"
                      isWild={isWildCard(c, view.settings)}
                      highlight={verdict && used.has(c.id) ? (ev.exists ? "match" : "partial") : null}
                      wildAs={verdict && w ? wildLabel(w) : undefined}
                      dimmed={dimOthers && !used.has(c.id)}
                    />
                  );
                })}
              </div>
            </li>
          )}
          {seated.map((p, row) => (
            <li key={p.id} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center">
              <span className="w-32 shrink-0 truncate text-base text-parchment">{p.name}</span>
              <div className="flex flex-wrap gap-1.5 pb-2">
                {sortCards(sd.revealedHands[p.id]).map((c, i) => {
                  const w = wilds.get(c.id);
                  return (
                    <PlayingCard
                      key={c.id}
                      card={c}
                      faceUp={flipped}
                      size="sm"
                      isWild={isWildCard(c, view.settings)}
                      highlight={verdict && used.has(c.id) ? (ev.exists ? "match" : "partial") : null}
                      wildAs={verdict && w ? wildLabel(w) : undefined}
                      dimmed={dimOthers && !used.has(c.id)}
                      dealDelay={row * 0.04 + i * 0.03}
                    />
                  );
                })}
              </div>
            </li>
          ))}
        </ul>

        <div id="showdown-verdict" aria-live="polite" className="mt-6 min-h-40 text-center">
          {!verdict ? (
            null
          ) : (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.25 }}>
              <p className={clsx("font-display text-3xl font-bold", ev.exists ? "text-bone" : "text-chip-lit")}>
                {ev.exists ? "The hand is there." : "Caught bluffing."}
              </p>
              {!ev.exists && <p className="mt-1 text-base text-parchment">{ev.summary}</p>}
              <p className="mt-4 text-lg text-bone">
                {sd.loserBusted ? (
                  <span className="font-bold text-chip-lit">{loser} is out of the game.</span>
                ) : (
                  <>{loser} takes a card.</>
                )}
              </p>
              {gameOver && view.winnerId && (
                <p className="mt-1 text-lg text-brass-lit">{name(view.winnerId)} is the last player standing.</p>
              )}
              {waitingText ? (
                <p className="mt-6 text-base text-ash">{waitingText}</p>
              ) : (
                <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
                  <button
                    ref={continueRef}
                    onClick={onContinue}
                    className="min-h-12 rounded-full bg-brass px-8 font-display text-2xl font-bold text-smoke transition hover:bg-brass-lit"
                  >
                    {countdown !== null ? `${continueLabel} in ${countdown}` : continueLabel}
                  </button>
                  {countdown !== null && (
                    <button
                      onClick={() => setCountdown(null)}
                      className="min-h-12 rounded-full border border-bone/40 px-6 text-base font-bold text-bone hover:border-bone"
                    >
                      Wait
                    </button>
                  )}
                </div>
              )}
            </motion.div>
          )}
        </div>
      </div>
    </motion.div>
  );
}
