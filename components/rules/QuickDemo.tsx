"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import clsx from "clsx";
import type { Bid } from "@/types/bs-poker";
import { bidLabel, DEFAULT_SETTINGS, evaluateBid } from "@/lib/bs-poker-engine";
import { PlayingCard } from "@/components/ui/PlayingCard";
import { cards } from "./sample-cards";

const TABLE = cards("QD 8S 7H 3C JC");
const PLAYERS = [
  { id: "ava", name: "Ava", hand: cards("KS 9D") },
  { id: "ben", name: "Ben", hand: cards("KH 4C") },
  { id: "you", name: "You", hand: cards("5D 2C") },
];
const AVA_BID: Bid = { type: "PAIR", rank: 13 };
const BEN_BID: Bid = { type: "TWO_PAIR", high: 13, low: 5 };

type Step = 0 | 1 | 2 | 3;
const STEP_COUNT = 4;

/** A scripted mini-round: deal, two bids, you call BS, everything flips. */
export function QuickDemo() {
  const [step, setStep] = useState<Step>(0);
  const [flipped, setFlipped] = useState(false);
  const primaryRef = useRef<HTMLButtonElement>(null);

  // The real engine decides the outcome, same as in a game.
  const evaluation = useMemo(
    () => evaluateBid(BEN_BID, [...TABLE, ...PLAYERS.flatMap((p) => p.hand)], DEFAULT_SETTINGS),
    [],
  );
  const used = new Set(evaluation.cardIds);

  useEffect(() => {
    if (step !== 3) return setFlipped(false);
    const t = setTimeout(() => setFlipped(true), 300);
    return () => clearTimeout(t);
  }, [step]);

  useEffect(() => {
    primaryRef.current?.focus();
  }, [step, flipped]);

  const currentBid = step === 1 ? { by: "Ava", bid: AVA_BID } : step >= 2 ? { by: "Ben", bid: BEN_BID } : null;
  const benCount = step === 3 && flipped ? 3 : 2;

  const captions: Record<Step, { title: string; body: string }> = {
    0: {
      title: "Everyone gets cards",
      body: "Five cards go face up on the table for everyone. Each player also gets two hidden cards. You can see yours: a Five and a Two.",
    },
    1: {
      title: "Ava bids a pair of Kings",
      body: "She claims at least two Kings among all 11 cards: the table plus everyone's hands. There are none on the table, so she's counting on hands.",
    },
    2: {
      title: "Ben raises to two pair",
      body: "He claims two Kings and two Fives. You hold one Five and the table has none. Is there another one out there? Your move.",
    },
    3: flipped
      ? {
          title: evaluation.exists ? "The hand is there" : "Caught bluffing",
          body: `${evaluation.summary} Ben made the bid, so Ben takes a card: he'll hold 3 next round. If the hand had been there, you'd have taken it instead.`,
        }
      : { title: "You call BS", body: "Everyone turns their cards over…" },
  };

  return (
    <div className="mx-auto max-w-5xl px-4 pt-24 pb-16 sm:px-8">
      <p className="text-base text-ash">
        Step {step + 1} of {STEP_COUNT}
      </p>
      <div aria-live="polite">
        <h1 className="mt-1 font-display text-5xl font-extrabold text-bone">{captions[step].title}</h1>
        <p className="mt-2 min-h-14 max-w-2xl text-lg text-parchment">{captions[step].body}</p>
      </div>

      {/* The table */}
      <div className="felt relative mt-8 grid gap-6 rounded-[3rem] px-6 py-8 sm:grid-cols-3 sm:px-10 sm:py-10">
        {PLAYERS.map((p) => {
          const showFace = p.id === "you" || flipped;
          const isBidder = currentBid?.by === p.name;
          return (
            <div key={p.id} className="flex flex-col items-center gap-2">
              <div className="flex gap-1">
                {p.hand.map((c, i) => (
                  <PlayingCard
                    key={c.id}
                    card={c}
                    faceUp={showFace}
                    size="md"
                    highlight={flipped && used.has(c.id) ? (evaluation.exists ? "match" : "partial") : null}
                    dimmed={flipped && !used.has(c.id)}
                    dealDelay={i * 0.08}
                  />
                ))}
              </div>
              <div
                className={clsx(
                  "flex flex-col items-center rounded-2xl px-4 py-1.5",
                  isBidder ? "bg-leather-lit ring-2 ring-brass-lit" : "bg-leather",
                )}
              >
                <span className="text-base font-bold text-bone">{p.name}</span>
                <span className="text-xs text-parchment">
                  {p.id === "ben" ? benCount : 2} cards{p.id === "ben" && benCount === 3 ? " next round (+1)" : ""}
                </span>
              </div>
            </div>
          );
        })}

        <div className="flex flex-col items-center gap-1 sm:col-span-3">
          <ul aria-label="Table cards" className="flex gap-1.5">
            {TABLE.map((c, i) => (
              <li key={c.id}>
                <PlayingCard
                  card={c}
                  size="sm"
                  highlight={flipped && used.has(c.id) ? (evaluation.exists ? "match" : "partial") : null}
                  dimmed={flipped && !used.has(c.id)}
                  dealDelay={0.2 + i * 0.07}
                />
              </li>
            ))}
          </ul>
          <span className="text-sm text-bone">Table cards</span>
        </div>

        <div className="flex min-h-24 flex-col items-center justify-center text-center sm:col-span-3">
          <AnimatePresence mode="wait" initial={false}>
            {currentBid ? (
              <motion.div key={currentBid.by} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
                <p className="font-display text-5xl leading-none font-extrabold text-bone">{bidLabel(currentBid.bid)}</p>
                <p className="mt-1 text-base text-bone">bid by {currentBid.by}</p>
              </motion.div>
            ) : (
              <motion.p key="none" className="font-display text-4xl font-extrabold text-bone/90" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                No bids yet
              </motion.p>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Controls */}
      <div className="mt-8 flex flex-wrap items-center gap-4">
        {step < 2 && (
          <button
            ref={primaryRef}
            onClick={() => setStep((s) => (s + 1) as Step)}
            className="min-h-12 rounded-full bg-brass px-8 font-display text-2xl font-bold text-smoke hover:bg-brass-lit"
          >
            Next
          </button>
        )}
        {step === 2 && (
          <>
            <button
              ref={primaryRef}
              onClick={() => setStep(3)}
              className="poker-chip relative grid size-32 place-items-center rounded-full shadow-[0_10px_30px_rgba(0,0,0,0.5)] transition hover:-translate-y-0.5"
            >
              <span className="relative font-display text-3xl leading-none font-extrabold text-bone">Call BS</span>
            </button>
            <p className="max-w-xs text-base text-parchment">
              In a real game you could also raise. Here, try calling it.
            </p>
          </>
        )}
        {step === 3 && flipped && (
          <>
            <Link
              href="/bs-poker"
              className="flex min-h-12 items-center rounded-full bg-brass px-7 font-display text-2xl font-bold text-smoke hover:bg-brass-lit"
            >
              Play BS Poker
            </Link>
            <button
              ref={primaryRef}
              onClick={() => setStep(0)}
              className="min-h-12 rounded-full border border-bone/40 px-6 text-base font-bold text-bone hover:border-bone"
            >
              Replay the demo
            </button>
            <Link href="/rules" className="min-h-12 content-center px-2 text-base text-parchment underline underline-offset-4 hover:text-bone">
              Back to the rules
            </Link>
          </>
        )}
      </div>
    </div>
  );
}
