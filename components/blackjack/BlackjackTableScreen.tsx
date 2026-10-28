"use client";

import { useEffect, useRef, useState } from "react";
import type { BlackjackAction, BlackjackSettings } from "@/types/blackjack";
import { dealerShowing, getBlackjackLegal, TURN_SECONDS, type BlackjackView } from "@/lib/blackjack-engine";
import { ScreenHeader, Toast, type HeaderExit } from "@/components/table/chrome";
import type { LobbyOptions } from "@/components/table/SeatsPanel";
import { BlackjackLobby } from "./BlackjackLobby";
import { BlackjackTable, totalLabel } from "./BlackjackTable";
import { BettingPanel, Countdown, InsurancePanel, PlayPanel } from "./BlackjackActions";
import { BlackjackGameOver, RoundResult } from "./RoundResult";

export interface BlackjackTableScreenProps {
  view: BlackjackView;
  /** Whose controls to show: you online; the chosen or current seat in the simulator. */
  actingId: string | null;
  isHost: boolean;
  onAction: (action: BlackjackAction) => void;
  onStartGame: () => void;
  lobby: LobbyOptions;
  exit?: HeaderExit;
  connectedIds?: Set<string>;
  error?: { message: string; id: number } | null;
  topBar?: React.ReactNode;
  /** Shared rooms: controls beside the game's name in the lobby. */
  headerExtra?: React.ReactNode;
  /** Shared rooms: the host's choices once a match is over, in place of Play again. */
  postGameActions?: React.ReactNode;
}

/** Let the last card land before the results come up. */
const RESULT_DELAY_MS = 1100;

/** One sentence for screen readers about what just happened. */
function describe(prev: BlackjackView, next: BlackjackView): string | null {
  const name = (id: string | null | undefined) => next.players.find((p) => p.id === id)?.name ?? "";
  if (next.phase === "betting" && prev.phase !== "betting") return `Round ${next.roundNumber}. Place your bets.`;
  if (next.phase === "insurance" && prev.phase !== "insurance") return "The dealer shows an Ace. Insurance is open.";
  if (next.phase === "playing" && (next.currentTurnId !== prev.currentTurnId || next.currentHand !== prev.currentHand)) {
    const opening = prev.phase === "playing" ? "" : `Dealer shows ${dealerShowing(next).total}. `;
    return `${opening}${name(next.currentTurnId)} to play.`;
  }
  const dealerMoved = !prev.dealer.holeRevealed || next.dealer.cards.length !== prev.dealer.cards.length;
  if (next.dealer.holeRevealed && dealerMoved) return `Dealer has ${totalLabel(next.dealer.cards.filter((c) => c !== null))}.`;
  return null;
}

export function BlackjackTableScreen({ view, actingId, isHost, onAction, onStartGame, lobby, exit, connectedIds, error, topBar, headerExtra, postGameActions }: BlackjackTableScreenProps) {
  const [announcement, setAnnouncement] = useState("");
  const [closedRound, setClosedRound] = useState<number | null>(null);
  const [resultReady, setResultReady] = useState<number | null>(null);
  const prevView = useRef(view);

  useEffect(() => {
    const prev = prevView.current;
    prevView.current = view;
    if (prev !== view) {
      const msg = describe(prev, view);
      if (msg) setAnnouncement(msg);
    }
  }, [view]);

  const roundOver = (view.phase === "settled" || view.phase === "game_over") && !!view.result;
  useEffect(() => {
    if (!roundOver) return;
    const t = setTimeout(() => setResultReady(view.roundNumber), RESULT_DELAY_MS);
    return () => clearTimeout(t);
  }, [roundOver, view.roundNumber]);

  const legal = getBlackjackLegal(view, actingId);
  const acting = view.players.find((p) => p.id === actingId);
  const actingHuman = acting && !acting.isBot ? acting : null;
  const turnPlayer = view.players.find((p) => p.id === view.currentTurnId);

  const showResult = roundOver && resultReady === view.roundNumber && closedRound !== view.roundNumber;
  const showGameOver = view.phase === "game_over" && !showResult && resultReady === view.roundNumber;

  let panel: React.ReactNode = null;
  let timer: { total: number; label: string } | null = null;
  if (view.phase === "betting") {
    timer = { total: view.settings.betSeconds, label: "Betting closes" };
    panel =
      actingHuman && legal.canBet ? (
        <BettingPanel key={`${view.roundNumber}-${actingHuman.id}`} view={view} legal={legal} actingId={actingHuman.id} actingName={actingHuman.name} onAction={onAction} />
      ) : (
        <p className="text-lg text-parchment">{acting?.status === "busted" ? "You're out of chips." : "Bets are going down."}</p>
      );
  } else if (view.phase === "insurance") {
    timer = { total: view.settings.betSeconds, label: "Insurance closes" };
    panel =
      actingHuman && legal.insuranceOffer !== null ? (
        <InsurancePanel legal={legal} actingId={actingHuman.id} actingName={actingHuman.name} onAction={onAction} />
      ) : (
        <p className="text-lg text-parchment">Waiting on insurance.</p>
      );
  } else if (view.phase === "playing") {
    timer = { total: TURN_SECONDS, label: "Time to play" };
    panel =
      actingHuman && legal.isMyTurn ? (
        <PlayPanel key={`${view.version}`} view={view} legal={legal} actingId={actingHuman.id} actingName={actingHuman.name} onAction={onAction} />
      ) : (
        <p className="text-lg text-parchment">{turnPlayer?.isBot ? `${turnPlayer.name} is thinking…` : `Waiting for ${turnPlayer?.name}.`}</p>
      );
  } else if (view.phase === "dealer") {
    panel = <p className="text-lg text-parchment">Dealer&apos;s turn.</p>;
  } else if (view.phase === "settled") {
    panel = <p className="text-lg text-parchment">Next round coming up.</p>;
  }

  return (
    <div className="min-h-screen pb-16">
      <div inert={showResult || showGameOver}>
        <ScreenHeader title="Blackjack" exit={exit} extra={headerExtra} />
        {topBar && <div className="mx-auto mt-5 max-w-6xl px-4 sm:px-8">{topBar}</div>}

        {view.phase === "lobby" ? (
          <BlackjackLobby
            view={view}
            isHost={isHost}
            options={lobby}
            connectedIds={connectedIds}
            onUpdateSettings={(patch: Partial<BlackjackSettings>) => onAction({ type: "UPDATE_SETTINGS", playerId: view.hostId, settings: patch })}
            onStart={onStartGame}
          />
        ) : (
          <main className="mx-auto max-w-6xl space-y-6 pt-6 sm:px-4">
            <BlackjackTable view={view} connectedIds={connectedIds} />
            {view.phase !== "game_over" && (
              <div className="mx-4 rounded-[2rem] bg-smoke-raised p-6 ring-1 ring-leather-lit sm:p-8">
                {timer && (
                  <div className="mb-4 flex justify-end">
                    <Countdown deadline={view.deadline} total={timer.total} label={timer.label} />
                  </div>
                )}
                {panel}
              </div>
            )}
          </main>
        )}
      </div>

      <p className="sr-only" aria-live="polite">
        {announcement}
      </p>

      {showResult && (
        <RoundResult
          key={view.roundNumber}
          view={view}
          onDealNow={isHost && view.phase === "settled" ? () => onAction({ type: "NEXT_ROUND", playerId: view.hostId }) : undefined}
          onClose={() => setClosedRound(view.roundNumber)}
        />
      )}
      {showGameOver && <BlackjackGameOver view={view} canPlayAgain={isHost} actions={postGameActions} onPlayAgain={() => onAction({ type: "RETURN_TO_LOBBY", playerId: view.hostId })} />}

      <Toast error={error} />
    </div>
  );
}
