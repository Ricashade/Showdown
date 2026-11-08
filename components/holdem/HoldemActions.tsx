"use client";

import type { HoldemAction } from "@/types/holdem";
import type { HoldemLegal, HoldemView } from "@/lib/holdem-game";
import clsx from "clsx";
import { BetControls } from "@/components/table/BetControls";

const chips = (n: number) => n.toLocaleString("en-US");

interface HoldemActionsProps {
  view: HoldemView;
  legal: HoldemLegal;
  actingId: string;
  onAction: (action: HoldemAction) => void;
  /** Someone else's turn: shown greyed out, so the panel doesn't come and go. */
  disabled?: boolean;
}

export function HoldemActions({ view, legal, actingId, onAction, disabled = false }: HoldemActionsProps) {
  const me = view.players.find((p) => p.id === actingId)!;
  const toCall = view.currentBet - me.bet;

  return (
    <div className={clsx("transition-opacity", disabled && "opacity-40")} inert={disabled}>
      <BetControls
        heading="Your move"
        resetKey={view.version}
        onFold={() => onAction({ type: "FOLD", playerId: actingId })}
        passive={
          legal.canCheck
            ? { label: "Check", onClick: () => onAction({ type: "CHECK", playerId: actingId }) }
            : {
                label: legal.callIsAllIn ? `All in ${chips(legal.callAmount)}` : `Call ${chips(legal.callAmount)}`,
                onClick: () => onAction({ type: "CALL", playerId: actingId }),
              }
        }
        raise={
          legal.canRaise
            ? {
                min: legal.minRaiseTo,
                max: legal.maxRaiseTo,
                currentBet: view.currentBet,
                potAfterCall: legal.pot + toCall,
                myBet: me.bet,
                verb: legal.isOpeningBet ? "Bet" : "Raise to",
                allInWord: "All in",
                onRaise: (to, allIn) => onAction(allIn ? { type: "ALL_IN", playerId: actingId } : { type: "RAISE", playerId: actingId, to }),
              }
            : undefined
        }
      />
    </div>
  );
}
