"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence } from "framer-motion";
import type { BsPokerAction, BsPokerSettings } from "@/types/bs-poker";
import { getLegalActions, type BsPokerView } from "@/lib/bs-poker-game";
import { bidPhrase } from "@/lib/bs-poker-engine";
import { ScreenHeader, Toast, type HeaderExit } from "@/components/table/chrome";
import { Lobby, type LobbyOptions } from "./Lobby";
import { GameTable } from "./GameTable";
import { BidBuilder } from "./BidBuilder";
import { ShowdownModal } from "./ShowdownModal";
import { GameOver } from "./GameOver";
import type { SeatHighlights } from "./PlayerSeat";
import { DealProvider, useDealClock } from "@/components/table/deal";
import { RoomStage } from "@/components/ui/RoomTransition";
import { TableLoader } from "@/components/table/TableLoader";
import { planDeal } from "@/lib/deal-plan";
import { says, whose } from "@/lib/grammar";

export type { HeaderExit };

export interface TableScreenProps {
  /** Everything this screen is allowed to see (one player's view, or everyone's in dev mode). */
  view: BsPokerView;
  /** Whose controls this screen drives. */
  actingId: string | null;
  isHost: boolean;
  onAction: (action: BsPokerAction) => void;
  onStartGame: () => void;
  lobby: LobbyOptions;
  /** Header action; omitted in the lobby of the local simulator (shows "Main menu"). */
  exit?: HeaderExit;
  /** Online play: who is connected right now. */
  connectedIds?: Set<string>;
  /** Shown as a toast; a new `id` shows it again. */
  error?: { message: string; id: number } | null;
  /** Online guests can't deal the next round; the host does. */
  canDealNextRound: boolean;
  /** Extra controls above the table (the dev POV switcher, connection notices). */
  topBar?: React.ReactNode;
  /** Shared rooms: controls beside the game's name in the lobby. */
  headerExtra?: React.ReactNode;
  /** Shared rooms: the host's choices once a match is over, in place of Play again. */
  postGameActions?: React.ReactNode;
}

/** One sentence for screen readers describing what just changed. */
function describeChange(prev: BsPokerView, next: BsPokerView): string | null {
  const name = (id: string | null | undefined) => next.players.find((p) => p.id === id)?.name ?? "";
  if (next.phase !== "bidding") return null; // The showdown dialog announces its own verdict.
  if (next.round !== prev.round || prev.phase !== "bidding") {
    return `Round ${next.round}. ${says(name(next.currentTurnPlayerId), "opens", "open")} the bidding.`;
  }
  if (next.currentBid && next.bidHistory.length > prev.bidHistory.length) {
    return `${name(next.currentBid.playerId)} bid ${bidPhrase(next.currentBid.bid)}. ${whose(name(next.currentTurnPlayerId))} turn.`;
  }
  return null;
}

export function TableScreen({
  view,
  actingId,
  isHost,
  onAction,
  onStartGame,
  lobby,
  exit,
  connectedIds,
  error,
  canDealNextRound,
  topBar,
  headerExtra,
  postGameActions,
}: TableScreenProps) {
  const deal = useDealClock({
    key: view.phase === "bidding" ? `round-${view.round}` : null,
    plan: () => planDeal(view.players, view.roundStarterId),
    shuffle: true,
    animateOnMount: view.bidHistory.length === 0,
  });
  const [, setTick] = useState(0);
  const dealing = view.phase === "bidding" && Date.now() < deal.endsAt;
  // Re-render when the shuffle ends and when the last card lands, to open up bidding.
  useEffect(() => {
    if (!dealing) return;
    const timers = [deal.startedAt + deal.shuffleMs, deal.endsAt]
      .map((t) => t - Date.now())
      .filter((ms) => ms > 0)
      .map((ms) => setTimeout(() => setTick((n) => n + 1), ms + 30));
    return () => timers.forEach(clearTimeout);
  }, [dealing, deal.startedAt, deal.shuffleMs, deal.endsAt]);

  const [announcement, setAnnouncement] = useState("");
  const [dismissedShowdownRound, setDismissedShowdownRound] = useState<number | null>(null);
  const prevViewRef = useRef(view);

  useEffect(() => {
    const prev = prevViewRef.current;
    prevViewRef.current = view;
    if (prev === view) return;
    const msg = describeChange(prev, view);
    if (msg) setAnnouncement(msg);
  }, [view]);

  const acting = view.players.find((p) => p.id === actingId);
  const legal = getLegalActions(view, actingId);
  // Your seat while you're still in; spectators and the knocked-out get no bid panel.
  const seated = acting && !acting.isBot && acting.status !== "eliminated" ? acting : null;
  const preview = getLegalActions({ ...view, currentTurnPlayerId: seated?.id ?? null }, seated?.id ?? null);
  const bidder = view.players.find((p) => p.id === view.currentBid?.playerId);
  const hostName = view.players.find((p) => p.id === view.hostId)?.name ?? "the host";

  const highlights: SeatHighlights | null = useMemo(() => {
    const sd = view.showdown;
    if (!sd || view.phase === "bidding") return null;
    return {
      cardIds: new Set(sd.evaluation.cardIds),
      kind: sd.evaluation.exists ? "match" : "partial",
      wilds: new Map(sd.evaluation.wildAssignments.map((w) => [w.cardId, w])),
    };
  }, [view.showdown, view.phase]);

  const showShowdown =
    !!view.showdown &&
    (view.phase === "showdown" || (view.phase === "game_over" && dismissedShowdownRound !== view.showdown.round));
  const showGameOver = view.phase === "game_over" && !showShowdown;
  const dialogOpen = showShowdown || showGameOver;

  return (
    <DealProvider value={deal}>
      <div className="min-h-screen pb-16 md:pb-5">
        {/* Everything behind an open dialog is inert, so focus can't wander under it. */}
        <div inert={dialogOpen}>
          <ScreenHeader title="BS Poker" exit={exit} extra={headerExtra} />

          {topBar && <div className="mx-auto mt-5 max-w-6xl px-4 sm:px-8">{topBar}</div>}

          <RoomStage room={view.phase === "lobby" ? "lobby" : "table"} loader={<TableLoader game="bs-poker" />}>
            {view.phase === "lobby" ? (
              <Lobby
                view={view}
                isHost={isHost}
                options={lobby}
                connectedIds={connectedIds}
                onUpdateSettings={(patch: Partial<BsPokerSettings>) =>
                  onAction({ type: "UPDATE_SETTINGS", playerId: view.hostId, settings: patch })
                }
                onStart={onStartGame}
              />
            ) : (
              <main className="mx-auto max-w-6xl space-y-6 pt-3 sm:px-4">
                <GameTable view={view} highlights={highlights} connectedIds={connectedIds} />

                {view.phase === "bidding" && seated && (
                  <div className="mx-4 rounded-[2rem] bg-smoke-raised p-5 ring-1 ring-leather-lit sm:px-6">
                    {/* Off your turn (or while dealing) the same controls stay, greyed out, so the panel doesn't come and go. */}
                    {legal.isMyTurn && !dealing ? (
                      <BidBuilder
                        key={`${view.round}-${view.bidHistory.length}-${seated.id}`}
                        legalBids={legal.legalBids}
                        currentBid={view.currentBid}
                        currentBidderName={bidder?.name}
                        disabledHandTypes={view.disabledHandTypes}
                        canCallBS={legal.canCallBS}
                        onBid={(bid) => onAction({ type: "PLACE_BID", playerId: seated.id, bid })}
                        onCallBS={() => onAction({ type: "CALL_BS", playerId: seated.id })}
                      />
                    ) : (
                      <div className="opacity-40" inert>
                        <BidBuilder
                          key={`waiting-${view.bidHistory.length}`}
                          legalBids={preview.legalBids}
                          currentBid={view.currentBid}
                          currentBidderName={bidder?.name}
                          disabledHandTypes={view.disabledHandTypes}
                          canCallBS={preview.canCallBS}
                          onBid={() => {}}
                          onCallBS={() => {}}
                        />
                      </div>
                    )}
                  </div>
                )}
              </main>
            )}
          </RoomStage>
        </div>

        <p className="sr-only" aria-live="polite">
          {announcement}
        </p>

        <AnimatePresence>
          {showShowdown && (
            <ShowdownModal
              key={`sd-${view.showdown!.round}`}
              view={view}
              continueLabel={view.phase === "game_over" ? "See final results" : "Next hand"}
              waitingText={
                view.phase === "showdown" && !canDealNextRound ? `Waiting for ${hostName} to start the next hand.` : undefined
              }
                onContinue={() =>
                view.phase === "game_over"
                  ? setDismissedShowdownRound(view.showdown!.round)
                  : onAction({ type: "NEXT_ROUND", playerId: actingId ?? view.hostId })
              }
            />
          )}
        </AnimatePresence>

        {showGameOver && (
          <GameOver
            view={view}
            canPlayAgain={isHost} actions={postGameActions}
            onPlayAgain={() => onAction({ type: "RETURN_TO_LOBBY", playerId: view.hostId })}
          />
        )}

        <Toast error={error} />
      </div>
    </DealProvider>
  );
}
