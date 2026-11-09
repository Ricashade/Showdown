"use client";

import type { BouillotteAction } from "@/types/bouillotte";
import type { BouillotteLegal, BouillotteView } from "@/lib/bouillotte-engine";
import clsx from "clsx";
import { BetControls } from "@/components/table/BetControls";
import { chips } from "./words";

interface BouillotteActionsProps {
  view: BouillotteView;
  legal: BouillotteLegal;
  actingId: string;
  onAction: (action: BouillotteAction) => void;
  /** Someone else's turn: shown greyed out, so the controls don't come and go. */
  disabled?: boolean;
}

/** Your move: the blind carré before the deal, then pass, open, call, raise, va-tout or fold. */
export function BouillotteActions({ view, legal, actingId, onAction, disabled = false }: BouillotteActionsProps) {
  if (legal.carre) {
    return (
      <section aria-label="Carré" className="mx-4 flex flex-wrap items-center gap-3 pt-4">
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

  return (
    // Clear of the table's rail, which reaches past the felt.
    <div className={clsx("mx-4 pt-4 transition-opacity", disabled && "opacity-40")} inert={disabled}>
      <BetControls
        resetKey={view.version}
        onFold={() => onAction({ type: "FOLD", playerId: actingId })}
        passive={
          legal.canCheck
            ? { label: "Pass", onClick: () => onAction({ type: "CHECK", playerId: actingId }) }
            : {
                label: legal.callIsAllIn ? `Va-tout ${chips(legal.callAmount)}` : `Call ${chips(legal.callAmount)}`,
                onClick: () => onAction({ type: "CALL", playerId: actingId }),
              }
        }
        raise={
          legal.canRaise
            ? {
                min: legal.minRaiseTo,
                max: legal.maxRaiseTo,
                currentBet: view.currentBet,
                potAfterCall: view.pot + legal.callAmount,
                myBet: me.bet,
                verb: legal.isOpening ? "Open" : "Raise by",
                allInWord: "Va-tout",
                onRaise: (to, allIn) => onAction(allIn ? { type: "ALL_IN", playerId: actingId } : { type: "RAISE", playerId: actingId, to }),
              }
            : undefined
        }
      />
    </div>
  );
}
