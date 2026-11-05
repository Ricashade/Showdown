"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Bomb, Volume2, VolumeX } from "lucide-react";
import type { ThirteenAction, ThirteenPlay, ThirteenSettings } from "@/types/thirteen";
import { getThirteenLegal, standings, type ThirteenView } from "@/lib/thirteen-engine";
import { describeCombo } from "@/lib/thirteen-combos";
import { playBombImpact, setSoundOn, soundOn } from "@/lib/sound-effects";
import { ScreenHeader, Toast, type HeaderExit } from "@/components/table/chrome";
import type { LobbyOptions } from "@/components/table/SeatsPanel";
import { RoomLink, RoomStage } from "@/components/ui/RoomTransition";
import { TableLoader } from "@/components/table/TableLoader";
import { BombSheetDrawer } from "./BombSheet";
import { ThirteenLobby } from "./ThirteenLobby";
import { ThirteenTable } from "./ThirteenTable";
import { describeEvent } from "./words";

export interface ThirteenTableScreenProps {
  view: ThirteenView;
  /** Whose controls to show: you online; the chosen or current seat in the simulator. */
  actingId: string | null;
  isHost: boolean;
  onAction: (action: ThirteenAction) => void;
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

type ChopEvent = ThirteenPlay & { n: number };
const CHOP_MS = 1800;

/** The latest bomb to land after the table opened, for as long as its moment lasts, with its thump. */
function useChopMoment(view: ThirteenView): ChopEvent | null {
  const latest = view.log.findLast((e): e is Extract<typeof e, { kind: "play" }> => e.kind === "play" && !!e.chop) ?? null;
  const seen = useRef(latest?.n ?? -1);
  const [moment, setMoment] = useState<ChopEvent | null>(null);
  // Keyed by the event's number: every move hands over a fresh copy of the log.
  useEffect(() => {
    if (!latest || latest.n <= seen.current) return;
    seen.current = latest.n;
    setMoment(latest);
    playBombImpact(latest.combo.tier);
  }, [latest?.n]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!moment) return;
    const t = setTimeout(() => setMoment(null), CHOP_MS);
    return () => clearTimeout(t);
  }, [moment]);
  return moment;
}

export function ThirteenTableScreen({ view, actingId, isHost, onAction, onStartGame, lobby, exit, connectedIds, error, topBar, headerExtra, postGameActions }: ThirteenTableScreenProps) {
  const [sheet, setSheet] = useState(false);
  const [sound, setSound] = useState(true);
  useEffect(() => setSound(soundOn()), []);
  const chop = useChopMoment(view);

  const name = (id: string) => view.players.find((p) => p.id === id)?.name ?? "";
  const legal = getThirteenLegal(view, actingId);
  const acting = view.players.find((p) => p.id === actingId);
  const myTurn = legal.isMyTurn && !!acting && !acting.isBot;
  const turnPlayer = view.players.find((p) => p.id === view.currentTurnId);
  const seated = view.seats?.some((x) => x.id === view.viewerId);
  const focusId = seated ? view.viewerId : view.godMode ? view.currentTurnId : null;
  const top = view.trick.at(-1)?.combo;
  const latest = view.log.at(-1);

  let prompt = "";
  if (view.phase === "playing") {
    if (myTurn) {
      if (legal.leading) prompt = view.openWith3S ? "Your lead: open with the 3♠." : "Your lead.";
      else if (legal.lockedOut) prompt = "You passed. Bomb back in, or pass.";
      else prompt = `Beat ${describeCombo(top!)}, or pass.`;
    } else prompt = turnPlayer?.isBot ? `${turnPlayer.name} is thinking…` : `Waiting for ${turnPlayer?.name}.`;
  }

  const chip = "flex min-h-11 items-center gap-2 rounded-full px-4 text-sm font-bold text-parchment ring-1 ring-leather-lit transition hover:text-bone hover:ring-brass";

  return (
    <div className="min-h-screen pb-16">
      <div inert={view.phase === "game_over"}>
        <ScreenHeader title="13" exit={exit} extra={headerExtra} />
        {topBar && <div className="mx-auto mt-5 max-w-6xl px-4 sm:px-8">{topBar}</div>}

        <RoomStage room={view.phase === "lobby" ? "lobby" : "table"} loader={<TableLoader game="thirteen" />}>
          {view.phase === "lobby" ? (
            <ThirteenLobby
              view={view}
              isHost={isHost}
              options={lobby}
              connectedIds={connectedIds}
              onUpdateSettings={(patch: Partial<ThirteenSettings>) => onAction({ type: "UPDATE_SETTINGS", playerId: view.hostId, settings: patch })}
              onStart={onStartGame}
            />
          ) : (
            <main className="mx-auto max-w-6xl space-y-4 pt-6 sm:px-4">
              <div className="mx-4 flex flex-wrap items-center justify-between gap-3">
                <div className="min-w-0 flex-1" aria-live="polite">
                  <AnimatePresence mode="wait">
                    {latest && (
                      <motion.p key={latest.n} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="text-lg text-parchment">
                        {describeEvent(latest, name)}
                      </motion.p>
                    )}
                  </AnimatePresence>
                  <p className="font-display text-2xl font-bold text-bone">{prompt}</p>
                </div>
                <div className="flex gap-2">
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
                  <button onClick={() => setSheet(true)} className={chip}>
                    <Bomb className="size-4" aria-hidden /> Bombs
                  </button>
                </div>
              </div>
              <ThirteenTable view={view} focusId={focusId} legal={myTurn ? legal : { ...legal, isMyTurn: false }} actingId={actingId} onAction={onAction} connectedIds={connectedIds} chop={chop} />
            </main>
          )}
        </RoomStage>
      </div>

      {sheet && <BombSheetDrawer onClose={() => setSheet(false)} />}
      {view.phase === "game_over" && <GameOver view={view} actions={postGameActions} canPlayAgain={isHost} onPlayAgain={() => onAction({ type: "RETURN_TO_LOBBY", playerId: view.hostId })} />}
      <Toast error={error} />
    </div>
  );
}

function GameOver({ view, actions, canPlayAgain, onPlayAgain }: { view: ThirteenView; actions?: React.ReactNode; canPlayAgain: boolean; onPlayAgain: () => void }) {
  const ref = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLAnchorElement>(null);
  useEffect(() => (ref.current ?? menuRef.current)?.focus(), []);
  const name = (id: string) => view.players.find((p) => p.id === id)?.name ?? "";

  return (
    <motion.div className="fixed inset-0 z-40 flex items-center justify-center overflow-y-auto bg-black/80 p-4" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
      <div role="dialog" aria-modal="true" aria-labelledby="winner-title" className="felt my-auto w-full max-w-md rounded-[2rem] p-7 sm:p-9">
        <h2 id="winner-title" className="font-display text-6xl leading-none font-extrabold text-bone">
          {name(view.winnerId!)} wins
        </h2>
        <ol className="mt-6 divide-y divide-baize-deep border-y border-baize-deep">
          {standings(view).map((x, i) => (
            <li key={x.id} className="flex items-baseline justify-between gap-3 py-2.5 text-base">
              <span className="flex items-baseline gap-3">
                <span className="w-5 font-display text-xl font-bold text-bone tabular-nums">{i + 1}</span>
                <span className={x.id === view.winnerId ? "font-bold text-bone" : "text-bone"}>{name(x.id)}</span>
              </span>
              <span className="text-sm text-bone tabular-nums">{x.count === 0 ? "Out" : `${x.count} ${x.count === 1 ? "card" : "cards"} left`}</span>
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
