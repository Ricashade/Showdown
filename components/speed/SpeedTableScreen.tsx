"use client";

import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { Volume2, VolumeX } from "lucide-react";
import type { SpeedAction, SpeedSettings } from "@/types/speed";
import type { SpeedView } from "@/lib/speed-engine";
import { setSoundOn, soundOn } from "@/lib/sound-effects";
import { ScreenHeader, Toast, type HeaderExit } from "@/components/table/chrome";
import type { LobbyOptions } from "@/components/table/SeatsPanel";
import { RoomLink, RoomStage } from "@/components/ui/RoomTransition";
import { TableLoader } from "@/components/table/TableLoader";
import { SpeedLobby } from "./SpeedLobby";
import { SpeedTable } from "./SpeedTable";

export interface SpeedTableScreenProps {
  view: SpeedView;
  /** Whose controls to show: yours. */
  actingId: string | null;
  isHost: boolean;
  onAction: (action: SpeedAction) => void;
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

/** Turned-away moves the table shows by the piles, not as a toast. */
const BOUNCES = new Set(["Too slow!", "That doesn't fit"]);

export function SpeedTableScreen({ view, actingId, isHost, onAction, onStartGame, lobby, exit, connectedIds, error, topBar, headerExtra, postGameActions }: SpeedTableScreenProps) {
  const [sound, setSound] = useState(true);
  useEffect(() => setSound(soundOn()), []);

  const acting = view.players.find((p) => p.id === actingId);
  const seated = !!view.sides?.some((x) => x.id === actingId);
  const canAct = seated && !!acting && !acting.isBot;
  const focusId = view.sides?.some((x) => x.id === view.viewerId) ? view.viewerId : view.godMode ? actingId : null;
  const bounce = error && BOUNCES.has(error.message) ? error : null;

  return (
    <div className="min-h-screen pb-16">
      <div inert={view.phase === "game_over"}>
        <ScreenHeader title="Speed" exit={exit} extra={headerExtra} />
        {topBar && <div className="mx-auto mt-5 max-w-6xl px-4 sm:px-8">{topBar}</div>}

        <RoomStage room={view.phase === "lobby" ? "lobby" : "table"} loader={<TableLoader game="speed" />}>
          {view.phase === "lobby" ? (
            <SpeedLobby
              view={view}
              isHost={isHost}
              options={lobby}
              connectedIds={connectedIds}
              onUpdateSettings={(patch: Partial<SpeedSettings>) => onAction({ type: "UPDATE_SETTINGS", playerId: view.hostId, settings: patch })}
              onStart={onStartGame}
            />
          ) : (
            <main className="mx-auto max-w-4xl space-y-4 pt-6 sm:px-4">
              <div className="mx-4 flex items-center justify-end gap-2">
                {!seated && view.phase !== "game_over" && <p className="mr-auto text-base text-parchment">You&apos;re watching this one.</p>}
                <button
                  onClick={() => {
                    setSoundOn(!sound);
                    setSound(!sound);
                  }}
                  aria-pressed={sound}
                  aria-label="Sound"
                  className="grid size-11 place-items-center rounded-full text-parchment ring-1 ring-leather-lit transition hover:text-bone hover:ring-brass"
                >
                  {sound ? <Volume2 className="size-4" /> : <VolumeX className="size-4" />}
                </button>
              </div>
              {view.sides && <SpeedTable view={view} focusId={focusId} canAct={canAct} onAction={onAction} bounce={bounce} connectedIds={connectedIds} />}
            </main>
          )}
        </RoomStage>
      </div>

      {view.phase === "game_over" && <GameOver view={view} actions={postGameActions} canPlayAgain={isHost} onPlayAgain={() => onAction({ type: "RETURN_TO_LOBBY", playerId: view.hostId })} />}
      <Toast error={bounce ? null : error} />
    </div>
  );
}

function GameOver({ view, actions, canPlayAgain, onPlayAgain }: { view: SpeedView; actions?: React.ReactNode; canPlayAgain: boolean; onPlayAgain: () => void }) {
  const ref = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLAnchorElement>(null);
  useEffect(() => (ref.current ?? menuRef.current)?.focus(), []);
  const name = (id: string) => view.players.find((p) => p.id === id)?.name ?? "";
  const left = (id: string) => {
    const x = view.sides!.find((s) => s.id === id)!;
    return x.filled.filter(Boolean).length + x.stockCount;
  };
  const order = [...view.sides!].sort((a, b) => left(a.id) - left(b.id));
  const title = view.winnerIds.length === 1 ? `${name(view.winnerIds[0])} ${name(view.winnerIds[0]) === "You" ? "win" : "wins"}` : `${view.winnerIds.map(name).join(" and ")} tie`;

  return (
    <motion.div className="fixed inset-0 z-40 flex items-center justify-center overflow-y-auto bg-black/80 p-4" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
      <div role="dialog" aria-modal="true" aria-labelledby="winner-title" className="felt my-auto w-full max-w-md rounded-[2rem] p-7 sm:p-9">
        <h2 id="winner-title" className="font-display text-6xl leading-none font-extrabold text-bone">
          {title}
        </h2>
        <ol className="mt-6 divide-y divide-baize-deep border-y border-baize-deep">
          {order.map((x, i) => (
            <li key={x.id} className="flex items-baseline justify-between gap-3 py-2.5 text-base">
              <span className="flex items-baseline gap-3">
                <span className="w-5 font-display text-xl font-bold text-bone tabular-nums">{i + 1}</span>
                <span className={view.winnerIds.includes(x.id) ? "font-bold text-bone" : "text-bone"}>{name(x.id)}</span>
              </span>
              <span className="text-sm text-bone tabular-nums">{left(x.id) === 0 ? "Out" : `${left(x.id)} ${left(x.id) === 1 ? "card" : "cards"} left`}</span>
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
            <RoomLink ref={menuRef} href="/" className="flex min-h-12 flex-1 items-center justify-center rounded-full border border-bone/40 px-6 text-base font-bold text-bone hover:border-bone">
              Main menu
            </RoomLink>
          </div>
        )}
      </div>
    </motion.div>
  );
}
