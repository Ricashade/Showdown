"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import { History, X } from "lucide-react";
import type { GoFishAction, GoFishSettings } from "@/types/gofish";
import { getGoFishLegal, type GoFishView } from "@/lib/gofish-engine";
import { ScreenHeader, Toast, type HeaderExit } from "@/components/table/chrome";
import type { LobbyOptions } from "@/components/table/SeatsPanel";
import { GoFishLobby } from "./GoFishLobby";
import { GoFishTable } from "./GoFishTable";
import { describeEvent } from "./words";

export interface GoFishTableScreenProps {
  view: GoFishView;
  /** Whose controls to show: you online; the chosen or current seat in the simulator. */
  actingId: string | null;
  isHost: boolean;
  onAction: (action: GoFishAction) => void;
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

export function GoFishTableScreen({ view, actingId, isHost, onAction, onStartGame, lobby, exit, connectedIds, error, topBar, headerExtra, postGameActions }: GoFishTableScreenProps) {
  const [showLog, setShowLog] = useState(false);
  const name = (id: string) => view.players.find((p) => p.id === id)?.name ?? "";
  const legal = getGoFishLegal(view, actingId);
  const acting = view.players.find((p) => p.id === actingId);
  const myTurn = legal.isMyTurn && !!acting && !acting.isBot;
  const turnPlayer = view.players.find((p) => p.id === view.currentTurnId);
  const focusId = view.viewerId ?? view.currentTurnId ?? view.players[0]?.id ?? null;
  const latest = view.log.at(-1);
  // The ask that just happened (books and refills follow it in the log).
  const lastAsk = [...view.log].reverse().find((e) => e.kind === "ask");

  let prompt = "";
  if (view.phase === "playing") {
    if (myTurn) prompt = lastAsk && lastAsk.kind === "ask" && lastAsk.askerId === acting!.id && lastAsk.again ? "Go again! Pick someone, then a rank you hold." : "Your turn: pick someone to ask, then a rank you hold.";
    else prompt = turnPlayer?.isBot ? `${turnPlayer.name} is deciding who to ask…` : `Waiting for ${turnPlayer?.name}.`;
  }

  return (
    <div className="min-h-screen pb-16">
      <div inert={view.phase === "game_over"}>
        <ScreenHeader title="Go Fish" exit={exit} extra={headerExtra} />
        {topBar && <div className="mx-auto mt-5 max-w-6xl px-4 sm:px-8">{topBar}</div>}

        {view.phase === "lobby" ? (
          <GoFishLobby
            view={view}
            isHost={isHost}
            options={lobby}
            connectedIds={connectedIds}
            onUpdateSettings={(patch: Partial<GoFishSettings>) => onAction({ type: "UPDATE_SETTINGS", playerId: view.hostId, settings: patch })}
            onStart={onStartGame}
          />
        ) : (
          <main className="mx-auto max-w-6xl space-y-4 pt-6 sm:px-4">
            <div className="mx-4 flex flex-wrap items-center justify-between gap-3">
              <div className="min-w-0 flex-1" aria-live="polite">
                <AnimatePresence mode="wait">
                  {lastAsk && (
                    <motion.p key={lastAsk.n} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="text-lg text-parchment">
                      {describeEvent(lastAsk, name)}
                      {latest && latest.kind === "book" && <span className="ml-2 font-bold text-brass-lit">{describeEvent(latest, name)}</span>}
                    </motion.p>
                  )}
                </AnimatePresence>
                <p className="font-display text-2xl font-bold text-bone">{prompt}</p>
              </div>
              <button
                onClick={() => setShowLog(true)}
                className="flex min-h-11 items-center gap-2 rounded-full px-4 text-sm font-bold text-parchment ring-1 ring-leather-lit transition hover:text-bone hover:ring-brass"
              >
                <History className="size-4" aria-hidden /> Table history
              </button>
            </div>
            <GoFishTable view={view} focusId={focusId} legal={myTurn ? legal : { ...legal, isMyTurn: false }} actingId={actingId} onAction={onAction} connectedIds={connectedIds} />
          </main>
        )}
      </div>

      {showLog && <HistoryPanel view={view} name={name} onClose={() => setShowLog(false)} />}
      {view.phase === "game_over" && <GameOver view={view} actions={postGameActions} canPlayAgain={isHost} onPlayAgain={() => onAction({ type: "RETURN_TO_LOBBY", playerId: view.hostId })} />}
      <Toast error={error} />
    </div>
  );
}

function HistoryPanel({ view, name, onClose }: { view: GoFishView; name: (id: string) => string; onClose: () => void }) {
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <motion.div className="fixed inset-0 z-50 flex justify-end bg-black/50" initial={{ opacity: 0 }} animate={{ opacity: 1 }} onClick={onClose}>
      <motion.div
        role="dialog"
        aria-modal="true"
        aria-labelledby="history-title"
        onClick={(e) => e.stopPropagation()}
        initial={{ x: 40 }}
        animate={{ x: 0 }}
        className="flex h-full w-full max-w-sm flex-col bg-smoke-raised p-5 shadow-2xl ring-1 ring-leather-lit"
      >
        <div className="flex items-center justify-between gap-3">
          <h2 id="history-title" className="font-display text-3xl font-extrabold text-bone">
            Table history
          </h2>
          <button ref={closeRef} onClick={onClose} aria-label="Close" className="grid size-11 place-items-center rounded-full text-bone hover:bg-black/30">
            <X className="size-5" />
          </button>
        </div>
        <ol className="mt-4 flex-1 space-y-2 overflow-y-auto pr-1">
          {[...view.log].reverse().map((e) => (
            <li key={e.n} className="rounded-xl bg-smoke/70 px-3 py-2 text-sm text-parchment">
              {describeEvent(e, name)}
            </li>
          ))}
          {view.log.length === 0 && <li className="text-sm text-ash">Nothing yet.</li>}
        </ol>
      </motion.div>
    </motion.div>
  );
}

function GameOver({ view, actions, canPlayAgain, onPlayAgain }: { view: GoFishView; actions?: React.ReactNode; canPlayAgain: boolean; onPlayAgain: () => void }) {
  const ref = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLAnchorElement>(null);
  useEffect(() => (ref.current ?? menuRef.current)?.focus(), []);
  const winners = view.players.filter((p) => view.winnerIds.includes(p.id));
  const standings = [...view.players].sort((a, b) => b.books.length - a.books.length);
  const title = winners.length === 1 ? `${winners[0].name} wins` : `${winners.map((p) => p.name).join(" and ")} tie`;

  return (
    <motion.div className="fixed inset-0 z-40 flex items-center justify-center overflow-y-auto bg-black/80 p-4" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
      <div role="dialog" aria-modal="true" aria-labelledby="winner-title" className="felt my-auto w-full max-w-md rounded-[2rem] p-7 sm:p-9">
        <h2 id="winner-title" className="font-display text-6xl leading-none font-extrabold text-bone">
          {title}
        </h2>
        <ol className="mt-6 divide-y divide-baize-deep border-y border-baize-deep">
          {standings.map((p, i) => (
            <li key={p.id} className="flex items-baseline justify-between gap-3 py-2.5 text-base">
              <span className="flex items-baseline gap-3">
                <span className="w-5 font-display text-xl font-bold text-bone tabular-nums">{i + 1}</span>
                <span className={view.winnerIds.includes(p.id) ? "font-bold text-bone" : "text-bone"}>{p.name}</span>
              </span>
              <span className="text-sm text-bone tabular-nums">
                {p.books.length} {p.books.length === 1 ? "book" : "books"}
              </span>
            </li>
          ))}
        </ol>
        {actions ?? (
          <div className="mt-7 flex flex-wrap gap-3">
            {canPlayAgain && (
              <button ref={ref} onClick={onPlayAgain} className="min-h-12 flex-1 rounded-full bg-brass px-6 font-display text-2xl font-bold text-smoke transition hover:bg-brass-lit">
                Play again
              </button>
            )}
            <Link ref={menuRef} href="/" className="flex min-h-12 flex-1 items-center justify-center rounded-full border border-bone/40 px-6 text-base font-bold text-bone hover:border-bone">
              Main menu
            </Link>
          </div>
        )}
      </div>
    </motion.div>
  );
}
