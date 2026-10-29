"use client";

import { useEffect, useRef, useState } from "react";
import { LayoutGroup, motion } from "framer-motion";
import type { GarbageAction, GarbageSettings } from "@/types/garbage";
import { getGarbageLegal, revealComplete, slotLabel, type GarbageView } from "@/lib/garbage-engine";
import { cardLabel } from "@/lib/cards";
import { ScreenHeader, Toast, type HeaderExit } from "@/components/table/chrome";
import type { LobbyOptions } from "@/components/table/SeatsPanel";
import { RoomLink, RoomStage } from "@/components/ui/RoomTransition";
import { TableLoader } from "@/components/table/TableLoader";
import { GarbageLobby } from "./GarbageLobby";
import { GarbageTable } from "./GarbageTable";

export interface GarbageTableScreenProps {
  view: GarbageView;
  /** Whose controls to show: you online; the chosen or current seat in the simulator. */
  actingId: string | null;
  isHost: boolean;
  onAction: (action: GarbageAction) => void;
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

const names = (list: string[]) => (list.length <= 1 ? list.join("") : `${list.slice(0, -1).join(", ")} and ${list[list.length - 1]}`);

/** One sentence for screen readers about what just happened. */
function describe(prev: GarbageView, next: GarbageView): string | null {
  const name = (id: string | null | undefined) => next.players.find((p) => p.id === id)?.name ?? "";
  if (next.round !== prev.round) return `Round ${next.round}. ${name(next.currentTurnId)} goes first.`;
  if (next.phase === "reveal" && prev.phase !== "reveal") return "Last lap over. Everyone still playing turns their cards over and can rearrange them.";
  if (next.phase !== "playing") return null;
  if (next.currentTurnId !== prev.currentTurnId) return `${name(next.currentTurnId)}'s turn.`;
  if (next.active && next.active.id !== prev.active?.id) {
    const from = next.activeFrom;
    const where = from?.source === "slot" ? `from slot ${slotLabel(from.slot)}` : from?.source === "discard" ? "off the discard pile" : "from the stock";
    return `${name(next.currentTurnId)} has the ${cardLabel(next.active)}, ${where}.`;
  }
  return null;
}

export function GarbageTableScreen({ view, actingId, isHost, onAction, onStartGame, lobby, exit, connectedIds, error, topBar, headerExtra, postGameActions }: GarbageTableScreenProps) {
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

  const legal = getGarbageLegal(view, actingId);
  const acting = view.players.find((p) => p.id === actingId);
  const turnPlayer = view.players.find((p) => p.id === view.currentTurnId);
  const humanTurn = legal.isMyTurn && acting && !acting.isBot;
  // Your own board up close; watching everyone, the board of whoever's playing.
  const focusId = view.viewerId ?? view.currentTurnId ?? view.players[0]?.id ?? null;
  const hostName = view.players.find((p) => p.id === view.hostId)?.name ?? "the host";

  const showRound = view.phase === "round_over" && !!view.result && closedRound !== view.result.round;
  const showWinner = view.phase === "game_over";

  const me = view.players.find((p) => p.id === actingId);
  const stillArranging = view.players.filter((p) => !p.revealDone);
  const myBoardFull = !!me && revealComplete(me.slots, view.settings.faceCards);

  let prompt: string;
  if (view.phase === "reveal") {
    prompt = legal.canRearrange && acting && !acting.isBot
      ? myBoardFull
        ? "Every slot filled. Press Done to clear your board."
        : "Tap two of your turned-over cards to swap them."
      : `Waiting for ${names(stillArranging.map((p) => p.name))} to rearrange.`;
  } else if (view.phase !== "playing") prompt = "";
  else if (humanTurn && legal.mustDraw) prompt = legal.canTakeDiscard ? "Draw from the stock, or take the card on the discard pile." : "Draw from the stock.";
  else if (humanTurn && legal.mustDiscard) prompt = `The ${cardLabel(view.active!)} has nowhere to go. Throw it away.`;
  else if (humanTurn) prompt = legal.slots.length > 1 ? "Wild: pick any face-down slot." : `Place the ${cardLabel(view.active!)}.`;
  else prompt = turnPlayer?.isBot ? `${turnPlayer.name} is playing…` : `Waiting for ${turnPlayer?.name}.`;

  return (
    <div className="min-h-screen pb-16">
      <div inert={showRound || showWinner}>
        <ScreenHeader title="Garbage" exit={exit} extra={headerExtra} />
        {topBar && <div className="mx-auto mt-5 max-w-6xl px-4 sm:px-8">{topBar}</div>}

        <RoomStage room={view.phase === "lobby" ? "lobby" : "table"} loader={<TableLoader game="garbage" />}>
          {view.phase === "lobby" ? (
            <GarbageLobby
              view={view}
              isHost={isHost}
              options={lobby}
              connectedIds={connectedIds}
              onUpdateSettings={(patch: Partial<GarbageSettings>) => onAction({ type: "UPDATE_SETTINGS", playerId: view.hostId, settings: patch })}
              onStart={onStartGame}
            />
          ) : (
            <main className="mx-auto max-w-6xl space-y-5 pt-6 sm:px-4">
              <p className="min-h-8 text-center font-display text-2xl font-bold text-bone">
                {prompt}
              </p>
              {view.phase === "reveal" && (
                <div className="flex flex-wrap justify-center gap-3">
                  {legal.canRearrange && acting && !acting.isBot && (
                    <button
                      onClick={() => onAction({ type: "REVEAL_DONE", playerId: acting.id })}
                      className="min-h-12 rounded-full bg-brass px-8 font-display text-2xl font-bold text-smoke transition hover:bg-brass-lit"
                    >
                      Done
                    </button>
                  )}
                  {isHost && (!legal.canRearrange || stillArranging.length > 1) && (
                    <button
                      onClick={() => onAction({ type: "FINISH_REVEAL", playerId: view.hostId })}
                      className="min-h-12 rounded-full border-2 border-bone/60 px-6 text-base font-bold text-bone hover:border-bone"
                    >
                      End the round now
                    </button>
                  )}
                </div>
              )}
              <LayoutGroup>
                <GarbageTable view={view} focusId={focusId} legal={humanTurn ? legal : { ...legal, isMyTurn: false }} actingId={actingId} onAction={onAction} connectedIds={connectedIds} />
              </LayoutGroup>
            </main>
          )}
        </RoomStage>
      </div>

      <p className="sr-only" aria-live="polite">
        {announcement}
      </p>

      {showRound && (
        <RoundOver
          view={view}
          canDeal={isHost}
          waitingText={`Waiting for ${hostName} to deal.`}
          onNext={() => onAction({ type: "NEXT_ROUND", playerId: view.hostId })}
          onClose={() => setClosedRound(view.result!.round)}
        />
      )}
      {showWinner && <GameOver view={view} canPlayAgain={isHost} actions={postGameActions} hostName={hostName} onPlayAgain={() => onAction({ type: "RETURN_TO_LOBBY", playerId: view.hostId })} />}

      <Toast error={error} />
    </div>
  );
}

function RoundOver({ view, canDeal, waitingText, onNext, onClose }: { view: GarbageView; canDeal: boolean; waitingText: string; onNext: () => void; onClose: () => void }) {
  const r = view.result!;
  const ref = useRef<HTMLButtonElement>(null);
  useEffect(() => ref.current?.focus(), []);
  const finishers = r.finisherIds.map((id) => view.players.find((p) => p.id === id)?.name ?? "?");
  const standings = [...view.players].sort((a, b) => r.nextTargets[a.id] - r.nextTargets[b.id]);

  return (
    <motion.div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/70 p-4" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
      <div role="dialog" aria-modal="true" aria-labelledby="round-title" className="my-auto w-full max-w-md rounded-[2rem] bg-smoke-raised p-6 shadow-2xl ring-1 ring-leather-lit sm:p-8">
        <h2 id="round-title" className="font-display text-4xl leading-tight font-extrabold text-bone">
          {finishers.length ? `${names(finishers)} cleared the board` : `Round ${r.round} over`}
        </h2>
        <ol className="mt-5 divide-y divide-leather-lit border-y border-leather-lit">
          {standings.map((p) => {
            const won = r.finisherIds.includes(p.id);
            return (
              <li key={p.id} className="flex items-baseline justify-between gap-3 py-2.5">
                <span className={won ? "font-bold text-bone" : "text-bone"}>
                  {p.name}
                  {r.revealClearIds.includes(p.id) && <span className="ml-1.5 text-sm font-normal text-brass-lit">on the reveal</span>}
                </span>
                <span className="text-sm text-parchment tabular-nums">
                  {r.nextTargets[p.id]} {r.nextTargets[p.id] === 1 ? "slot" : "slots"} next
                  {won && <span className="ml-1.5 font-bold text-brass-lit">−1</span>}
                </span>
              </li>
            );
          })}
        </ol>
        <div className="mt-6 flex flex-wrap items-center gap-3">
          {canDeal ? (
            <button ref={ref} onClick={onNext} className="min-h-12 rounded-full bg-brass px-7 font-display text-2xl font-bold text-smoke transition hover:bg-brass-lit">
              Next round
            </button>
          ) : (
            <>
              <button ref={ref} onClick={onClose} className="min-h-12 rounded-full border border-bone/40 px-6 text-base font-bold text-bone hover:border-bone">
                Close
              </button>
              <span className="text-base text-ash">{waitingText}</span>
            </>
          )}
        </div>
      </div>
    </motion.div>
  );
}

function GameOver({ view, actions, canPlayAgain, hostName, onPlayAgain }: { view: GarbageView; canPlayAgain: boolean; hostName: string; onPlayAgain: () => void; actions?: React.ReactNode }) {
  const winner = view.players.find((p) => p.id === view.winnerId);
  const againRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLAnchorElement>(null);
  useEffect(() => (againRef.current ?? menuRef.current)?.focus(), []);
  const standings = [...view.players].sort((a, b) => (a.id === view.winnerId ? -1 : b.id === view.winnerId ? 1 : a.target - b.target));

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
              <span className="text-sm text-bone tabular-nums">{p.id === view.winnerId ? "Cleared the last card" : `${p.target} slots to go`}</span>
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
              <RoomLink ref={menuRef} href="/" className="flex min-h-12 flex-1 items-center justify-center rounded-full border border-bone/40 px-6 text-base font-bold text-bone hover:border-bone">
                Main menu
              </RoomLink>
            </div>
          </>
        )}
      </div>
    </motion.div>
  );
}
