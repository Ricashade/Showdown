"use client";

import { useEffect, useState } from "react";
import clsx from "clsx";
import type { BlackjackAction } from "@/types/blackjack";
import { CHIP_VALUES, MIN_BET, type BlackjackLegal, type BlackjackView } from "@/lib/blackjack-engine";
import { chips } from "./BlackjackTable";

/** Chip faces by value, from the table's own materials. */
const CHIP_FACE: Record<number, string> = {
  10: "var(--color-baize-lit)",
  25: "var(--color-leather-lit)",
  50: "var(--color-brass-deep)",
  100: "var(--color-smoke)",
};

/** Seconds left until `deadline` (host clock), ticking down. */
export function useSecondsLeft(deadline: number | null) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (deadline === null) return;
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(t);
  }, [deadline]);
  return deadline === null ? null : Math.max(0, Math.ceil((deadline - now) / 1000));
}

/** Time left for the current decision, as a number and a bar that runs down. */
export function Countdown({ deadline, total, label }: { deadline: number | null; total: number; label: string }) {
  const left = useSecondsLeft(deadline);
  if (left === null) return null;
  return (
    <div className="flex items-center gap-3" role="timer" aria-label={`${label}: ${left} seconds`}>
      <div className="h-1.5 w-28 overflow-hidden rounded-full bg-smoke">
        <div
          className={clsx("h-full rounded-full transition-[width] duration-300 ease-linear", left <= 5 ? "bg-bone" : "bg-brass")}
          style={{ width: `${Math.min(100, (left / total) * 100)}%` }}
        />
      </div>
      <span aria-hidden className={clsx("font-display text-xl font-bold tabular-nums", left <= 5 ? "text-bone" : "text-parchment")}>
        {left}s
      </span>
    </div>
  );
}

interface ActionsProps {
  view: BlackjackView;
  legal: BlackjackLegal;
  actingId: string;
  actingName: string;
  onAction: (action: BlackjackAction) => void;
}

/** Stack chips into a bet, then place it. A placed bet can be changed until the cards come out. */
export function BettingPanel({ view, legal, actingId, actingName, onAction }: ActionsProps) {
  const me = view.players.find((p) => p.id === actingId)!;
  const [amount, setAmount] = useState(() => me.bet || Math.min(me.lastBet, me.chips));
  const placed = me.bet;
  const add = (v: number) => setAmount((a) => Math.min(legal.maxBet, a + v));
  const ok = amount >= MIN_BET && amount <= legal.maxBet;

  return (
    <section aria-label={`${actingName}'s bet`} className="flex flex-wrap items-end justify-between gap-x-10 gap-y-6">
      <div>
        <h2 className="font-display text-3xl font-bold text-bone">Place your bet, {actingName}</h2>
        <div className="mt-4 flex flex-wrap items-center gap-3" role="group" aria-label="Add chips">
          {CHIP_VALUES.map((v) => (
            <button
              key={v}
              onClick={() => add(v)}
              disabled={amount + v > legal.maxBet}
              aria-label={`Add ${v}`}
              className="bet-chip relative grid size-16 place-items-center rounded-full shadow-[0_6px_16px_rgba(0,0,0,0.45)] transition hover:-translate-y-0.5"
              style={{ "--chip-face": CHIP_FACE[v] } as React.CSSProperties}
            >
              <span className="relative font-display text-xl font-extrabold text-bone">{v}</span>
            </button>
          ))}
          <button
            onClick={() => setAmount(legal.maxBet)}
            className="min-h-11 rounded-full px-4 text-sm font-bold text-parchment ring-1 ring-leather-lit hover:text-bone hover:ring-brass"
          >
            All in
          </button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <output aria-live="polite" className="min-w-24 font-display text-4xl font-extrabold text-bone tabular-nums">
          {chips(amount)}
        </output>
        <button
          onClick={() => setAmount(0)}
          disabled={amount === 0}
          className="min-h-12 rounded-full border-2 border-bone/60 px-5 font-display text-xl font-bold text-bone hover:border-bone disabled:opacity-40"
        >
          Clear
        </button>
        <button
          onClick={() => onAction({ type: "PLACE_BET", playerId: actingId, amount })}
          disabled={!ok || amount === placed}
          className="min-h-12 rounded-full bg-brass px-7 font-display text-2xl font-bold text-smoke transition hover:bg-brass-lit disabled:opacity-40"
        >
          {placed > 0 ? "Change bet" : "Place bet"}
        </button>
        {placed > 0 && (
          <button
            onClick={() => onAction({ type: "PLACE_BET", playerId: actingId, amount: 0 })}
            className="min-h-12 px-2 text-base text-parchment underline-offset-4 hover:text-bone hover:underline"
          >
            Sit this one out
          </button>
        )}
      </div>
    </section>
  );
}

export function InsurancePanel({ legal, actingId, actingName, onAction }: Omit<ActionsProps, "view">) {
  const cost = legal.insuranceOffer!;
  return (
    <section aria-label={`${actingName}'s insurance`}>
      <h2 className="font-display text-3xl font-bold text-bone">Insurance, {actingName}?</h2>
      <p className="mt-1 text-base text-parchment">Costs {chips(cost)}, pays {chips(cost * 2)} if the dealer has blackjack.</p>
      <div className="mt-4 flex flex-wrap gap-2">
        <button
          onClick={() => onAction({ type: "INSURANCE", playerId: actingId, take: true })}
          className="min-h-12 rounded-full bg-bone px-6 font-display text-2xl font-bold text-smoke hover:bg-parchment"
        >
          Take insurance
        </button>
        <button
          onClick={() => onAction({ type: "INSURANCE", playerId: actingId, take: false })}
          className="min-h-12 rounded-full border-2 border-bone/60 px-6 font-display text-2xl font-bold text-bone hover:border-bone"
        >
          No insurance
        </button>
      </div>
    </section>
  );
}

export function PlayPanel({ view, legal, actingId, actingName, onAction }: ActionsProps) {
  const me = view.players.find((p) => p.id === actingId)!;
  const hand = me.hands[view.currentHand];
  const btn = "min-h-14 rounded-full px-7 font-display text-2xl font-bold transition disabled:opacity-35";
  return (
    <section aria-label={`${actingName}'s move`}>
      <h2 className="font-display text-3xl font-bold text-bone">
        Your move, {actingName}
        {me.hands.length > 1 && <span className="ml-3 text-xl text-parchment">Hand {view.currentHand + 1} of {me.hands.length}</span>}
      </h2>
      <div className="mt-4 flex flex-wrap gap-2">
        <button onClick={() => onAction({ type: "HIT", playerId: actingId })} className={clsx(btn, "bg-brass text-smoke hover:bg-brass-lit")}>
          Hit
        </button>
        <button onClick={() => onAction({ type: "STAND", playerId: actingId })} className={clsx(btn, "bg-bone text-smoke hover:bg-parchment")}>
          Stand
        </button>
        <button
          onClick={() => onAction({ type: "DOUBLE", playerId: actingId })}
          disabled={!legal.canDouble}
          className={clsx(btn, "border-2 border-bone/60 text-bone hover:border-bone")}
        >
          Double {chips(hand.bet)}
        </button>
        <button
          onClick={() => onAction({ type: "SPLIT", playerId: actingId })}
          disabled={!legal.canSplit}
          className={clsx(btn, "border-2 border-bone/60 text-bone hover:border-bone")}
        >
          Split
        </button>
      </div>
    </section>
  );
}
