"use client";

import { useEffect, useId, useState } from "react";
import clsx from "clsx";
import { raiseStops } from "@/lib/raise-stops";

const chips = (n: number) => n.toLocaleString("en-US");

export interface RaiseRange {
  /** Smallest and largest legal "raise to" amounts; the largest is all in. */
  min: number;
  max: number;
  /** The bet to match before raising, and the pot once you've matched it. */
  currentBet: number;
  potAfterCall: number;
  /** Chips you already have in this round, so all in reads as what you add. */
  myBet: number;
  /** "Raise by", "Bet", "Open"… (the amount shown is what goes on top of the current bet) */
  verb: string;
  /** "All in", "Va-tout"… */
  allInWord: string;
  onRaise: (to: number, allIn: boolean) => void;
}

/**
 * Your move in a betting game. The first row is the decision (fold, then check or call, then how
 * much to raise); the second is the slider, which snaps to those same amounts, and a box for an
 * exact one.
 */
export function BetControls({
  heading,
  onFold,
  passive,
  raise,
  resetKey,
}: {
  heading?: string;
  onFold: () => void;
  /** Check, pass or call. */
  passive: { label: string; onClick: () => void };
  /** Absent when raising isn't allowed. */
  raise?: RaiseRange;
  /** The amount goes back to the minimum whenever this changes. */
  resetKey: unknown;
}) {
  const sliderId = useId();
  // Amounts read as a raise by: what goes on top of the bet to match. The game is told the total.
  const base = raise?.currentBet ?? 0;
  // What's in the box, as typed: digits only, no leading zeros ("010" reads as 10).
  const [text, setText] = useState(String((raise?.min ?? 0) - base));
  /** Show a "raise to" total as its raise by. */
  const setAmount = (to: number) => setText(String(to - base));
  useEffect(() => setText(String((raise?.min ?? 0) - base)), [raise?.min, base, resetKey]);
  const amount = base + Number(text);

  const stops = raise ? raiseStops(raise) : [];
  const clamp = (n: number) => (raise ? Math.max(raise.min, Math.min(raise.max, Math.round(n))) : 0);
  const to = clamp(amount);
  const allIn = !!raise && to === raise.max;
  // The slider sits on whichever stop is nearest a typed amount.
  const nearest = stops.reduce((best, s, i) => (Math.abs(s.to - to) < Math.abs(stops[best].to - to) ? i : best), 0);

  return (
    <section aria-label={heading ?? "Your move"}>
      {heading && <h2 className="mb-2.5 font-display text-xl font-bold text-bone">{heading}</h2>}

      <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
        <div className="flex gap-2">
          <button onClick={onFold} className="min-h-12 rounded-full border-2 border-bone/60 px-6 font-display text-2xl font-bold text-bone hover:border-bone">
            Fold
          </button>
          <button onClick={passive.onClick} className="min-h-12 rounded-full bg-bone px-6 font-display text-2xl font-bold whitespace-nowrap text-smoke hover:bg-parchment">
            {passive.label}
          </button>
        </div>

        {raise && (
          <div role="group" aria-label="Raise amounts" className="flex flex-wrap gap-1.5 sm:border-l sm:border-leather-lit sm:pl-5">
            {stops.map((s) => (
              <button
                key={s.label}
                onClick={() => setAmount(s.to)}
                aria-pressed={to === s.to}
                className={clsx(
                  "min-h-10 rounded-full px-3.5 text-sm font-bold whitespace-nowrap transition",
                  to === s.to ? "bg-bone text-smoke" : "text-parchment ring-1 ring-leather-lit hover:text-bone hover:ring-brass",
                )}
              >
                {s.label}
              </button>
            ))}
          </div>
        )}
      </div>

      {raise && (
        <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-3">
          <input
            type="range"
            min={0}
            max={stops.length - 1}
            step={1}
            value={nearest}
            list={sliderId}
            onChange={(e) => setAmount(stops[Number(e.target.value)].to)}
            aria-label={`${raise.verb} amount`}
            aria-valuetext={`${stops[nearest].label}, ${chips(stops[nearest].to - base)}`}
            className="h-10 min-w-48 flex-1 accent-brass"
          />
          <datalist id={sliderId}>
            {stops.map((s, i) => (
              <option key={s.label} value={i} />
            ))}
          </datalist>
          <input
            type="text"
            inputMode="numeric"
            value={text}
            onChange={(e) => setText(e.target.value.replace(/\D/g, "").replace(/^0+(?=\d)/, ""))}
            onBlur={() => setAmount(to)}
            aria-label={`${raise.verb} amount in chips`}
            className="min-h-12 w-28 rounded-2xl bg-smoke px-3 text-center font-display text-2xl font-bold text-bone tabular-nums ring-1 ring-leather-lit focus-visible:outline-2 focus-visible:outline-brass-lit"
          />
          <button
            onClick={() => raise.onRaise(to, allIn)}
            className="min-h-12 rounded-full bg-brass px-6 font-display text-2xl font-bold whitespace-nowrap text-smoke transition hover:bg-brass-lit"
          >
            {allIn ? `${raise.allInWord} ${chips(raise.max - raise.myBet)}` : `${raise.verb} ${chips(to - base)}`}
          </button>
        </div>
      )}
    </section>
  );
}
