"use client";

import { useEffect, useState } from "react";
import clsx from "clsx";
import type { HoldemAction } from "@/types/holdem";
import type { HoldemLegal, HoldemView } from "@/lib/holdem-game";

const chips = (n: number) => n.toLocaleString("en-US");

interface HoldemActionsProps {
  view: HoldemView;
  legal: HoldemLegal;
  actingId: string;
  actingName: string;
  onAction: (action: HoldemAction) => void;
}

export function HoldemActions({ view, legal, actingId, actingName, onAction }: HoldemActionsProps) {
  const [amount, setAmount] = useState(legal.minRaiseTo);
  // Start at the smallest legal raise whenever the situation changes.
  useEffect(() => setAmount(legal.minRaiseTo), [legal.minRaiseTo, view.version]);

  const me = view.players.find((p) => p.id === actingId)!;
  const toCall = view.currentBet - me.bet;
  const potAfterCall = legal.pot + toCall;
  const clamp = (n: number) => Math.max(legal.minRaiseTo, Math.min(legal.maxRaiseTo, Math.round(n)));
  const presets: { label: string; to: number }[] = [
    { label: "Min", to: legal.minRaiseTo },
    { label: "½ pot", to: clamp(view.currentBet + potAfterCall / 2) },
    { label: "Pot", to: clamp(view.currentBet + potAfterCall) },
    { label: "All in", to: legal.maxRaiseTo },
  ];
  const raiseTo = clamp(amount);
  const allIn = raiseTo === legal.maxRaiseTo;
  const verb = legal.isOpeningBet ? "Bet" : "Raise to";


  return (
    <section aria-label={`${actingName}'s move`} className="grid gap-x-10 gap-y-6 lg:grid-cols-[auto_1fr]">
      <div>
        <h2 className="font-display text-3xl font-bold text-bone">Your move, {actingName}</h2>
        <div className="mt-4 flex flex-wrap gap-2">
          <button
            onClick={() => onAction({ type: "FOLD", playerId: actingId })}
            className="min-h-12 rounded-full border-2 border-bone/60 px-6 font-display text-2xl font-bold text-bone hover:border-bone"
          >
            Fold
          </button>
          {legal.canCheck ? (
            <button
              onClick={() => onAction({ type: "CHECK", playerId: actingId })}
              className="min-h-12 rounded-full bg-bone px-6 font-display text-2xl font-bold text-smoke hover:bg-parchment"
            >
              Check
            </button>
          ) : (
            <button
              onClick={() => onAction({ type: "CALL", playerId: actingId })}
              className="min-h-12 rounded-full bg-bone px-6 font-display text-2xl font-bold text-smoke hover:bg-parchment"
            >
              {legal.callIsAllIn ? `All in ${chips(legal.callAmount)}` : `Call ${chips(legal.callAmount)}`}
            </button>
          )}
        </div>
      </div>

      {legal.canRaise && (
        <div className="lg:border-l lg:border-leather-lit lg:pl-10">
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="Quick amounts">
            {presets.map((p) => (
              <button
                key={p.label}
                onClick={() => setAmount(p.to)}
                className={clsx(
                  "min-h-10 rounded-full px-4 text-sm font-bold transition",
                  raiseTo === p.to ? "bg-bone text-smoke" : "text-parchment ring-1 ring-leather-lit hover:text-bone hover:ring-brass",
                )}
              >
                {p.label}
              </button>
            ))}
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-4">
            <input
              type="range"
              min={legal.minRaiseTo}
              max={legal.maxRaiseTo}
              step={1}
              value={raiseTo}
              onChange={(e) => setAmount(Number(e.target.value))}
              aria-label={`${verb} amount`}
              className="h-10 min-w-48 flex-1 accent-brass"
            />
            <input
              type="number"
              inputMode="numeric"
              min={legal.minRaiseTo}
              max={legal.maxRaiseTo}
              value={amount}
              onChange={(e) => setAmount(Number(e.target.value))}
              onBlur={() => setAmount(raiseTo)}
              aria-label={`${verb} amount in chips`}
              className="min-h-12 w-28 rounded-2xl bg-smoke px-3 text-center font-display text-2xl font-bold text-bone tabular-nums ring-1 ring-leather-lit focus-visible:outline-2 focus-visible:outline-brass-lit"
            />
          </div>
          <button
            onClick={() => onAction(allIn ? { type: "ALL_IN", playerId: actingId } : { type: "RAISE", playerId: actingId, to: raiseTo })}
            className="mt-4 min-h-12 w-full rounded-full bg-brass px-6 font-display text-2xl font-bold text-smoke transition hover:bg-brass-lit sm:w-auto"
          >
            {allIn ? `All in ${chips(legal.maxRaiseTo - me.bet)}` : `${verb} ${chips(raiseTo)}`}
          </button>
        </div>
      )}
    </section>
  );
}
