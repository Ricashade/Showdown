"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import clsx from "clsx";
import { LayoutGroup, motion } from "framer-motion";
import type { RummyAction, RummySettings } from "@/types/rummy";
import { getRummyLegal, type RummyView } from "@/lib/rummy-engine";
import { cardLabel } from "@/lib/cards";
import { ScreenHeader, Toast, type HeaderExit } from "@/components/table/chrome";
import type { LobbyOptions } from "@/components/table/SeatsPanel";
import { PlayingCard } from "@/components/ui/PlayingCard";
import { RummyLobby } from "./RummyLobby";
import { RummyTable } from "./RummyTable";

export interface RummyTableScreenProps {
  view: RummyView;
  /** Whose controls to show: you online; the chosen or current seat in the simulator. */
  actingId: string | null;
  isHost: boolean;
  onAction: (action: RummyAction) => void;
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

const signed = (n: number) => (n > 0 ? `+${n}` : n < 0 ? `−${-n}` : "0");

/** One sentence for screen readers about what just happened. */
function describe(prev: RummyView, next: RummyView): string | null {
  const name = (id: string | null | undefined) => next.players.find((p) => p.id === id)?.name ?? "";
  if (next.round !== prev.round) return `Round ${next.round}. ${name(next.currentTurnId)} goes first.`;
  if (next.phase !== "playing") return null;
  if (next.currentTurnId !== prev.currentTurnId) return `${name(prev.currentTurnId)} discards the ${cardLabel(next.discard.at(-1)!)}. ${name(next.currentTurnId)}'s turn.`;
  if (next.melds.length > prev.melds.length) return `${name(next.currentTurnId)} melds ${next.melds.at(-1)!.cards.map(cardLabel).join(" ")}.`;
  const grew = next.melds.find((m, i) => prev.melds[i] && m.cards.length > prev.melds[i].cards.length);
  if (grew) return `${name(next.currentTurnId)} lays off on ${grew.cards.map(cardLabel).join(" ")}.`;
  return null;
}

export function RummyTableScreen({ view, actingId, isHost, onAction, onStartGame, lobby, exit, connectedIds, error, topBar, headerExtra, postGameActions }: RummyTableScreenProps) {
  const [announcement, setAnnouncement] = useState("");
  const [closedRound, setClosedRound] = useState<number | null>(null);
  const prevView = useRef(view);

  useEffect(() => {
    const prev = prevView.current;
    prevView.current = view;
    if (prev !== view) {
      const msg = describe(prev, view);
      if (msg) setAnnouncement(msg);
    }
  }, [view]);

  const legal = getRummyLegal(view, actingId);
  const acting = view.players.find((p) => p.id === actingId);
  const humanTurn = legal.isMyTurn && !!acting && !acting.isBot;
  const turnPlayer = view.players.find((p) => p.id === view.currentTurnId);
  const focusId = view.viewerId ?? view.currentTurnId ?? view.players[0]?.id ?? null;
  const hostName = view.players.find((p) => p.id === view.hostId)?.name ?? "the host";
  const mustPlay = legal.mustPlayId ? acting?.hand?.find((c) => c.id === legal.mustPlayId) : null;

  let prompt = "";
  if (view.phase === "playing") {
    if (humanTurn && legal.mustDraw) prompt = "Draw from the stock or the discard pile.";
    else if (humanTurn && mustPlay) prompt = `Meld or lay off the ${cardLabel(mustPlay)} before you discard.`;
    else if (humanTurn) prompt = "Pick cards to meld or lay off, then discard one.";
    else prompt = turnPlayer?.isBot ? `${turnPlayer.name} is playing…` : `Waiting for ${turnPlayer?.name}.`;
  }

  const showRound = view.phase === "round_over" && !!view.result && closedRound !== view.result.round;
  const showResult = view.phase === "game_over" && !!view.result && closedRound !== view.result.round;
  const showWinner = view.phase === "game_over" && !showResult;

  return (
    <div className="min-h-screen pb-16">
      <div inert={showRound || showResult || showWinner}>
        <ScreenHeader title="Rummy" exit={exit} extra={headerExtra} />
        {topBar && <div className="mx-auto mt-5 max-w-6xl px-4 sm:px-8">{topBar}</div>}

        {view.phase === "lobby" ? (
          <RummyLobby
            view={view}
            isHost={isHost}
            options={lobby}
            connectedIds={connectedIds}
            onUpdateSettings={(patch: Partial<RummySettings>) => onAction({ type: "UPDATE_SETTINGS", playerId: view.hostId, settings: patch })}
            onStart={onStartGame}
          />
        ) : (
          <main className="mx-auto max-w-6xl space-y-5 pt-6 sm:px-4">
            <p className="min-h-8 text-center font-display text-2xl font-bold text-bone">{prompt}</p>
            <LayoutGroup>
              <RummyTable view={view} focusId={focusId} legal={humanTurn ? legal : { ...legal, isMyTurn: false, mustDraw: false, canPlay: false }} actingId={actingId} onAction={onAction} connectedIds={connectedIds} />
            </LayoutGroup>
          </main>
        )}
      </div>

      <p className="sr-only" aria-live="polite">
        {announcement}
      </p>

      {(showRound || showResult) && (
        <RoundOver
          view={view}
          action={
            showResult
              ? { label: "See final scores", onClick: () => setClosedRound(view.result!.round) }
              : isHost
                ? { label: "Next round", onClick: () => onAction({ type: "NEXT_ROUND", playerId: view.hostId }) }
                : null
          }
          waitingText={`Waiting for ${hostName} to deal.`}
        />
      )}
      {showWinner && <GameOver view={view} canPlayAgain={isHost} actions={postGameActions} hostName={hostName} onPlayAgain={() => onAction({ type: "RETURN_TO_LOBBY", playerId: view.hostId })} />}

      <Toast error={error} />
    </div>
  );
}

function RoundOver({ view, action, waitingText }: { view: RummyView; action: { label: string; onClick: () => void } | null; waitingText: string }) {
  const r = view.result!;
  const ref = useRef<HTMLButtonElement>(null);
  useEffect(() => ref.current?.focus(), []);
  const winner = view.players.find((p) => p.id === r.winnerId);
  const rows = [...view.players].sort((a, b) => b.score - a.score);

  return (
    <motion.div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/70 p-4" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
      <div role="dialog" aria-modal="true" aria-labelledby="round-title" className="my-auto w-full max-w-xl rounded-[2rem] bg-smoke-raised p-6 shadow-2xl ring-1 ring-leather-lit sm:p-8">
        <h2 id="round-title" className="font-display text-4xl leading-tight font-extrabold text-bone">
          {winner ? `${winner.name} goes out` : "The cards ran out"}
        </h2>
        {r.rummy && <p className="mt-1 font-display text-2xl font-bold text-brass-lit">Rummy! Double points.</p>}

        <table className="mt-5 w-full text-left">
          <thead>
            <tr className="text-sm text-ash">
              <th className="py-1.5 font-normal">Player</th>
              <th className="py-1.5 font-normal">Left in hand</th>
              <th className="py-1.5 text-right font-normal">Round</th>
              <th className="py-1.5 text-right font-normal">Total</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-leather-lit border-y border-leather-lit">
            {rows.map((p) => (
              <tr key={p.id}>
                <td className={clsx("py-2.5 pr-3", p.id === r.winnerId ? "font-bold text-bone" : "text-bone")}>{p.name}</td>
                <td className="py-2.5 pr-3">
                  <div className="flex pl-5">
                    {r.leftover[p.id].slice(0, 8).map((c) => (
                      <span key={c.id} className="-ml-5">
                        <PlayingCard card={c} size="sm" entrance={false} />
                      </span>
                    ))}
                  </div>
                </td>
                <td className={clsx("py-2.5 text-right font-display text-xl font-bold tabular-nums", r.points[p.id] > 0 ? "text-brass-lit" : "text-parchment")}>{signed(r.points[p.id])}</td>
                <td className="py-2.5 text-right font-display text-xl font-bold text-bone tabular-nums">{p.score}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="mt-6 flex flex-wrap items-center gap-3">
          {action ? (
            <button ref={ref} onClick={action.onClick} className="min-h-12 rounded-full bg-brass px-7 font-display text-2xl font-bold text-smoke transition hover:bg-brass-lit">
              {action.label}
            </button>
          ) : (
            <span className="text-base text-ash">{waitingText}</span>
          )}
        </div>
      </div>
    </motion.div>
  );
}

function GameOver({ view, actions, canPlayAgain, hostName, onPlayAgain }: { view: RummyView; canPlayAgain: boolean; hostName: string; onPlayAgain: () => void; actions?: React.ReactNode }) {
  const winner = view.players.find((p) => p.id === view.winnerId);
  const againRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLAnchorElement>(null);
  useEffect(() => (againRef.current ?? menuRef.current)?.focus(), []);
  const standings = [...view.players].sort((a, b) => (a.id === view.winnerId ? -1 : b.id === view.winnerId ? 1 : b.score - a.score));

  return (
    <motion.div className="fixed inset-0 z-40 flex items-center justify-center overflow-y-auto bg-black/80 p-4" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
      <div role="dialog" aria-modal="true" aria-labelledby="winner-title" className="felt my-auto w-full max-w-md rounded-[2rem] p-7 sm:p-9">
        <h2 id="winner-title" className="font-display text-6xl leading-none font-extrabold text-bone">
          {winner ? `${winner.name} wins` : "Game over"}
        </h2>
        <ol className="mt-6 divide-y divide-baize-deep border-y border-baize-deep">
          {standings.map((p, i) => (
            <li key={p.id} className="flex items-baseline justify-between gap-3 py-2.5 text-base">
              <span className="flex items-baseline gap-3">
                <span className="w-5 font-display text-xl font-bold text-bone tabular-nums">{i + 1}</span>
                <span className="text-bone">{p.name}</span>
              </span>
              <span className="text-sm text-bone tabular-nums">{p.score} pts</span>
            </li>
          ))}
        </ol>
        {actions ?? (
          <>
            {!canPlayAgain && <p className="mt-6 text-base text-bone">Waiting for {hostName} to start a new game.</p>}
            <div className="mt-7 flex flex-wrap gap-3">
              {canPlayAgain && (
                <button ref={againRef} onClick={onPlayAgain} className="min-h-12 flex-1 rounded-full bg-brass px-6 font-display text-2xl font-bold text-smoke transition hover:bg-brass-lit">
                  Play again
                </button>
              )}
              <Link ref={menuRef} href="/" className="flex min-h-12 flex-1 items-center justify-center rounded-full border border-bone/40 px-6 text-base font-bold text-bone hover:border-bone">
                Main menu
              </Link>
            </div>
          </>
        )}
      </div>
    </motion.div>
  );
}
