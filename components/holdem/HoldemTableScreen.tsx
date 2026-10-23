"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { HoldemAction, HoldemSettings } from "@/types/holdem";
import { getHoldemLegal, type HoldemView } from "@/lib/holdem-game";
import { planHoldemDeal } from "@/lib/deal-plan";
import { cardLabel } from "@/lib/cards";
import { ScreenHeader, Toast, type HeaderExit } from "@/components/table/chrome";
import { DealProvider, useDealClock } from "@/components/table/deal";
import type { LobbyOptions } from "@/components/table/SeatsPanel";
import { HoldemLobby } from "./HoldemLobby";
import { HoldemTable } from "./HoldemTable";
import { HoldemActions } from "./HoldemActions";
import { HandResult, HoldemGameOver } from "./HandResult";

export interface HoldemTableScreenProps {
  view: HoldemView;
  actingId: string | null;
  isHost: boolean;
  onAction: (action: HoldemAction) => void;
  onStartGame: () => void;
  lobby: LobbyOptions;
  exit?: HeaderExit;
  connectedIds?: Set<string>;
  error?: { message: string; id: number } | null;
  topBar?: React.ReactNode;
}

const MOVE_WORDS: Record<string, string> = {
  fold: "folds",
  check: "checks",
  call: "calls",
  bet: "bets",
  raise: "raises to",
  all_in: "goes all in for",
};

/** One sentence for screen readers about what just happened. */
function describe(prev: HoldemView, next: HoldemView): string | null {
  const name = (id: string | null | undefined) => next.players.find((p) => p.id === id)?.name ?? "";
  if (next.phase !== "betting") return null; // The result dialog speaks for itself.
  if (next.handNumber !== prev.handNumber) return `Hand ${next.handNumber}. ${name(next.currentTurnId)} to act.`;
  const parts: string[] = [];
  const actor = prev.currentTurnId;
  const a = actor ? next.lastActions[actor] : undefined;
  if (a && a !== prev.lastActions[actor!]) {
    parts.push(`${name(actor)} ${MOVE_WORDS[a.move] ?? a.move}${a.amount && a.move !== "call" ? ` ${a.amount}` : ""}.`);
  }
  if (next.board.length > prev.board.length) parts.push(`Board: ${next.board.map(cardLabel).join(" ")}.`);
  if (next.currentTurnId) parts.push(`${name(next.currentTurnId)} to act.`);
  return parts.join(" ") || null;
}

export function HoldemTableScreen({
  view,
  actingId,
  isHost,
  onAction,
  onStartGame,
  lobby,
  exit,
  connectedIds,
  error,
  topBar,
}: HoldemTableScreenProps) {
  const [announcement, setAnnouncement] = useState("");
  const [dismissedHand, setDismissedHand] = useState<number | null>(null);
  const prevView = useRef(view);
  const lastDeal = useRef<{ hand: number; shown: number }>({ hand: 0, shown: 0 });

  // A deal happens when a hand starts (hole cards) or more of the board is turned.
  const playing = view.phase !== "lobby" && view.handNumber > 0;
  const dealKey = playing ? `${view.handNumber}-${view.board.length}` : null;
  const deal = useDealClock({
    key: dealKey,
    plan: () => {
      const newHand = lastDeal.current.hand !== view.handNumber;
      return planHoldemDeal({
        players: view.players,
        buttonId: view.buttonId,
        holeCards: newHand,
        fromShown: newHand ? 0 : lastDeal.current.shown,
        toShown: view.board.length,
      });
    },
    shuffle: lastDeal.current.hand !== view.handNumber,
    animateOnMount: view.phase === "betting" && view.street === "preflop" && Object.values(view.lastActions).every((a) => a.move === "small_blind" || a.move === "big_blind"),
  });
  useEffect(() => {
    if (playing) lastDeal.current = { hand: view.handNumber, shown: view.board.length };
  }, [playing, view.handNumber, view.board.length]);

  const [, setTick] = useState(0);
  const dealing = playing && Date.now() < deal.endsAt;
  useEffect(() => {
    if (!dealing) return;
    const t = setTimeout(() => setTick((n) => n + 1), deal.endsAt - Date.now() + 30);
    return () => clearTimeout(t);
  }, [dealing, deal.endsAt]);

  useEffect(() => {
    const prev = prevView.current;
    prevView.current = view;
    if (prev !== view) {
      const msg = describe(prev, view);
      if (msg) setAnnouncement(msg);
    }
  }, [view]);

  const winningCardIds = useMemo(() => {
    const r = view.result;
    if (!r || r.uncontested) return new Set<string>();
    return new Set(r.pots.flatMap((pot) => pot.winnerIds.flatMap((id) => r.best[id]?.cardIds ?? [])));
  }, [view.result]);

  const legal = getHoldemLegal(view, actingId);
  const acting = view.players.find((p) => p.id === actingId);
  const turnPlayer = view.players.find((p) => p.id === view.currentTurnId);
  const hostName = view.players.find((p) => p.id === view.hostId)?.name ?? "the host";

  // Let the board finish dealing (an all-in runout) before showing who won.
  const handDone = (view.phase === "hand_over" || view.phase === "game_over") && !!view.result && !dealing;
  const showResult = handDone && dismissedHand !== view.result!.handNumber;
  const showGameOver = view.phase === "game_over" && !showResult && !dealing;

  return (
    <DealProvider value={deal}>
      <div className="min-h-screen pb-16">
        <div inert={showResult || showGameOver}>
          <ScreenHeader title="Texas Hold'em" exit={exit} />
          {topBar && <div className="mx-auto mt-5 max-w-6xl px-4 sm:px-8">{topBar}</div>}

          {view.phase === "lobby" ? (
            <HoldemLobby
              view={view}
              isHost={isHost}
              options={lobby}
              connectedIds={connectedIds}
              onUpdateSettings={(patch: Partial<HoldemSettings>) => onAction({ type: "UPDATE_SETTINGS", playerId: view.hostId, settings: patch })}
              onStart={onStartGame}
            />
          ) : (
            <main className="mx-auto max-w-6xl space-y-6 pt-5 sm:px-4">
              <HoldemTable view={view} winningCardIds={winningCardIds} connectedIds={connectedIds} />
              {view.phase === "betting" && (
                <div className="mx-4 rounded-[2rem] bg-smoke-raised p-6 ring-1 ring-leather-lit sm:p-8">
                  {dealing ? (
                    <p role="status" className="text-lg text-parchment">
                      Dealing…
                    </p>
                  ) : legal.isMyTurn && acting && !acting.isBot ? (
                    <HoldemActions key={`${view.version}-${acting.id}`} view={view} legal={legal} actingId={acting.id} actingName={acting.name} onAction={onAction} />
                  ) : (
                    <p className="text-lg text-parchment">{turnPlayer?.isBot ? `${turnPlayer.name} is thinking…` : `Waiting for ${turnPlayer?.name}.`}</p>
                  )}
                </div>
              )}
            </main>
          )}
        </div>

        <p className="sr-only" aria-live="polite">
          {announcement}
        </p>

        {showResult && (
          <HandResult
            key={view.result!.handNumber}
            view={view}
            winningCardIds={winningCardIds}
            continueLabel={view.phase === "game_over" ? "See final results" : "Next hand"}
            onContinue={() =>
              view.phase === "game_over" ? setDismissedHand(view.result!.handNumber) : onAction({ type: "NEXT_HAND", playerId: view.hostId })
            }
            waitingText={view.phase === "hand_over" && !isHost ? `Waiting for ${hostName} to deal.` : undefined}
          />
        )}
        {showGameOver && (
          <HoldemGameOver view={view} canPlayAgain={isHost} onPlayAgain={() => onAction({ type: "RETURN_TO_LOBBY", playerId: view.hostId })} />
        )}

        <Toast error={error} />
      </div>
    </DealProvider>
  );
}
