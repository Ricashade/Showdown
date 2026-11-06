"use client";

import { useEffect, useState } from "react";
import clsx from "clsx";
import type { BouillotteAction } from "@/types/bouillotte";
import type { BouillotteLegal, BouillotteView } from "@/lib/bouillotte-engine";
import { chips } from "./words";

interface BouillotteActionsProps {
  view: BouillotteView;
  legal: BouillotteLegal;
  actingId: string;
  onAction: (action: BouillotteAction) => void;
}

/** Your move: the blind carré before the deal, then pass, open, call, raise, va-tout or fold. */
export function BouillotteActions({ view, legal, actingId, onAction }: BouillotteActionsProps) {
  const [amount, setAmount] = useState(legal.minRaiseTo);
  // Start at the smallest legal bet whenever the situation changes.
  useEffect(() => setAmount(legal.minRaiseTo), [legal.minRaiseTo, view.version]);

  if (legal.carre) {
    return (
      <section aria-label="Carré" className="mx-4 flex flex-wrap items-center gap-3">
        <p className="mr-auto text-base text-parchment">Blind, before the deal: you&apos;d act last.</p>
        <button onClick={() => onAction({ type: "CARRE", playerId: actingId, post: false })} className="min-h-12 rounded-full border-2 border-bone/60 px-6 font-display text-xl font-bold text-bone hover:border-bone">
          No carré
        </button>
        <button onClick={() => onAction({ type: "CARRE", playerId: actingId, post: true })} className="min-h-12 rounded-full bg-brass px-6 font-display text-xl font-bold text-smoke hover:bg-brass-lit">
          Post a carré of {chips(legal.carre.amount)}
        </button>
      </section>
    );
  }

  const me = view.players.find((p) => p.id === actingId)!;
  const clamp = (n: number) => Math.max(legal.minRaiseTo, Math.min(legal.maxRaiseTo, Math.round(n)));
  const potAfterCall = view.pot + legal.callAmount;
  const presets = [
    { label: "Min", to: legal.minRaiseTo },
    { label: "½ pot", to: clamp(view.currentBet + potAfterCall / 2) },
    { label: "Pot", to: clamp(view.currentBet + potAfterCall) },
    { label: "Va-tout", to: legal.maxRaiseTo },
  ];
  const to = clamp(amount);
  const allIn = to === legal.maxRaiseTo;
  const verb = legal.isOpening ? "Open" : "Raise to";

  return (
    <section aria-label="Your move" className="mx-4 grid gap-x-10 gap-y-5 lg:grid-cols-[auto_1fr]">
      <div className="flex flex-wrap items-start gap-2">
        <button onClick={() => onAction({ type: "FOLD", playerId: actingId })} className="min-h-12 rounded-full border-2 border-bone/60 px-6 font-display text-2xl font-bold text-bone hover:border-bone">
          Fold
        </button>
        {legal.canCheck ? (
          <button onClick={() => onAction({ type: "CHECK", playerId: actingId })} className="min-h-12 rounded-full bg-bone px-6 font-display text-2xl font-bold text-smoke hover:bg-parchment">
            Pass
          </button>
        ) : (
          <button onClick={() => onAction({ type: "CALL", playerId: actingId })} className="min-h-12 rounded-full bg-bone px-6 font-display text-2xl font-bold text-smoke hover:bg-parchment">
            {legal.callIsAllIn ? `Va-tout ${chips(legal.callAmount)}` : `Call ${chips(legal.callAmount)}`}
          </button>
        )}
      </div>

      {legal.canRaise && (
        <div className="lg:border-l lg:border-leather-lit lg:pl-10">
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="Quick amounts">
            {presets.map((p) => (
              <button
                key={p.label}
                onClick={() => setAmount(p.to)}
                className={clsx("min-h-10 rounded-full px-4 text-sm font-bold transition", to === p.to ? "bg-bone text-smoke" : "text-parchment ring-1 ring-leather-lit hover:text-bone hover:ring-brass")}
              >
                {p.label}
              </button>
            ))}
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <input
              type="range"
              min={legal.minRaiseTo}
              max={legal.maxRaiseTo}
              step={1}
              value={to}
              onChange={(e) => setAmount(Number(e.target.value))}
              aria-label={`${verb} amount`}
              className="h-10 min-w-40 flex-1 accent-brass"
            />
            <button
              onClick={() => onAction(allIn ? { type: "ALL_IN", playerId: actingId } : { type: "RAISE", playerId: actingId, to })}
              className="min-h-12 rounded-full bg-brass px-6 font-display text-2xl font-bold text-smoke transition hover:bg-brass-lit"
            >
              {allIn ? `Va-tout ${chips(legal.maxRaiseTo - me.bet)}` : `${verb} ${chips(to)}`}
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
