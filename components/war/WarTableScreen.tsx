"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import clsx from "clsx";
import { motion } from "framer-motion";
import type { WarAction, WarSettings } from "@/types/war";
import { getWarLegal, warRank, type WarView } from "@/lib/war-engine";
import { cardLabel } from "@/lib/cards";
import { ScreenHeader, Toast, type HeaderExit } from "@/components/table/chrome";
import type { LobbyOptions } from "@/components/table/SeatsPanel";
import { Segmented, Toggle } from "@/components/ui/controls";
import { cardName, PlayingCard } from "@/components/ui/PlayingCard";
import { WarLobby } from "./WarLobby";
import { TugOfWar, WarTable, type WarSpeed } from "./WarTable";

export interface WarTableScreenProps {
  view: WarView;
  /** Duelists this screen flips for: you online; every human duelist in the simulator. */
  controlIds: string[];
  /** Whose Tactical hand is shown. */
  actingId: string | null;
  isHost: boolean;
  onAction: (action: WarAction) => void;
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

/** Auto-flip pacing: time to look at a battle, and a longer beat when a War breaks out. */
const STEP_MS: Record<WarSpeed, number> = { normal: 1400, fast: 650, turbo: 180 };
const WAR_PAUSE_MS: Record<WarSpeed, number> = { normal: 2600, fast: 1600, turbo: 1000 };

export function WarTableScreen({ view, controlIds, actingId, isHost, onAction, onStartGame, lobby, exit, connectedIds, error, topBar, headerExtra, postGameActions }: WarTableScreenProps) {
  const [speed, setSpeed] = useState<WarSpeed>("normal");
  const [autoFlip, setAutoFlip] = useState(false);
  const tactical = view.settings.mode === "tactical";
  const playing = view.phase === "playing" && !!view.sides;
  const waitingOn = playing ? controlIds.filter((id) => view.sides!.some((x) => x.id === id && !x.ready)) : [];
  const actRef = useRef(onAction);
  actRef.current = onAction;

  const flip = () => waitingOn.forEach((playerId) => onAction({ type: "FLIP", playerId }));

  // Auto-flip: keep flipping at the chosen speed. A War, and the bounty it reveals, gets a longer look.
  const pendingKey = waitingOn.join();
  const dramatic = view.stage === "war" || (view.last?.wars ?? 0) > 0;
  useEffect(() => {
    if (!autoFlip || tactical || !pendingKey) return;
    const ids = pendingKey.split(",");
    const t = setTimeout(() => ids.forEach((playerId) => actRef.current({ type: "FLIP", playerId })), dramatic ? WAR_PAUSE_MS[speed] : STEP_MS[speed]);
    return () => clearTimeout(t);
  }, [autoFlip, tactical, pendingKey, view.version, dramatic, speed]);

  // Space flips.
  useEffect(() => {
    if (tactical || !playing) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== " " || (e.target as HTMLElement).closest("input, textarea, select, button")) return;
      e.preventDefault();
      waitingOn.forEach((playerId) => actRef.current({ type: "FLIP", playerId }));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [tactical, playing, waitingOn]);

  const legal = getWarLegal(view, actingId);
  const acting = view.players.find((p) => p.id === actingId);
  const duelist = !!view.sides?.some((x) => x.id === actingId);
  const leftId = duelist ? actingId! : (view.sides?.[0].id ?? "");
  const name = (id: string) => view.players.find((p) => p.id === id)?.name ?? "";
  const others = view.sides?.filter((x) => !x.ready && !controlIds.includes(x.id)).map((x) => name(x.id)) ?? [];
  const hostName = view.players.find((p) => p.id === view.hostId)?.name ?? "the host";

  return (
    <div className="min-h-screen pb-16">
      <div inert={view.phase === "game_over"}>
        <ScreenHeader title="War" exit={exit} extra={headerExtra} />
        {topBar && <div className="mx-auto mt-5 max-w-6xl px-4 sm:px-8">{topBar}</div>}

        {view.phase === "lobby" ? (
          <WarLobby
            view={view}
            isHost={isHost}
            options={lobby}
            connectedIds={connectedIds}
            onUpdateSettings={(patch: Partial<WarSettings>) => onAction({ type: "UPDATE_SETTINGS", playerId: view.hostId, settings: patch })}
            onStart={onStartGame}
          />
        ) : view.sides ? (
          <main className="mx-auto max-w-6xl space-y-5 pt-6 sm:px-4">
            <TugOfWar view={view} leftId={leftId} />
            <WarTable view={view} leftId={leftId} speed={speed} connectedIds={connectedIds} />

            <div className="mx-4 flex flex-col items-center gap-5 rounded-[2rem] bg-smoke-raised p-6 ring-1 ring-leather-lit sm:p-8">
              {tactical ? (
                legal.canAct && acting && !acting.isBot ? (
                  <div className="flex flex-col items-center gap-3">
                    <h2 className="font-display text-3xl font-bold text-bone">{view.stage === "war" ? "Pick the card that settles the War" : `Pick a card, ${acting.name}`}</h2>
                    <ul className="flex gap-3">
                      {legal.hand.map((c) => (
                        <li key={c.id}>
                          <button
                            onClick={() => onAction({ type: "PLAY", playerId: acting.id, cardId: c.id })}
                            aria-label={`Play the ${cardName(c, true)}`}
                            className="block rounded-xl transition hover:-translate-y-2 focus-visible:-translate-y-2"
                          >
                            <PlayingCard card={c} size="lg" />
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : (
                  <p className="text-lg text-parchment">{others.length ? `Waiting for ${others.join(" and ")}.` : "Watching."}</p>
                )
              ) : waitingOn.length > 0 ? (
                <motion.button
                  key={view.version}
                  initial={{ scale: 0.96 }}
                  animate={{ scale: 1 }}
                  onClick={flip}
                  className={clsx(
                    "min-h-16 rounded-full px-12 font-display text-3xl font-extrabold shadow-lg transition",
                    view.stage === "war" ? "bg-chip text-bone hover:bg-chip/85" : "bg-brass text-smoke hover:bg-brass-lit",
                  )}
                >
                  {view.stage === "war" ? "Flip for the War" : "Flip"}
                  <kbd className="ml-3 rounded-md bg-black/20 px-2 py-0.5 align-middle font-sans text-sm font-bold">Space</kbd>
                </motion.button>
              ) : (
                <p className="text-lg text-parchment">{controlIds.length === 0 ? "Watching." : others.length ? `Waiting for ${others.join(" and ")} to flip.` : ""}</p>
              )}

              <div className="flex w-full flex-wrap items-center justify-center gap-x-8 gap-y-3">
                <div className="w-64">
                  <Segmented<WarSpeed>
                    label="Speed"
                    value={speed}
                    options={[
                      { value: "normal", label: "1×" },
                      { value: "fast", label: "2×" },
                      { value: "turbo", label: "⚡ Turbo" },
                    ]}
                    onChange={setSpeed}
                  />
                </div>
                {!tactical && controlIds.length > 0 && (
                  <div className="w-44">
                    <Toggle label="Auto-flip" checked={autoFlip} onChange={setAutoFlip} />
                  </div>
                )}
              </div>
            </div>
          </main>
        ) : null}
      </div>

      {view.phase === "game_over" && <GameOver view={view} canPlayAgain={isHost} actions={postGameActions} hostName={hostName} onPlayAgain={() => onAction({ type: "RETURN_TO_LOBBY", playerId: view.hostId })} />}
      <Toast error={error} />
    </div>
  );
}

function GameOver({ view, actions, canPlayAgain, hostName, onPlayAgain }: { view: WarView; canPlayAgain: boolean; hostName: string; onPlayAgain: () => void; actions?: React.ReactNode }) {
  const winner = view.players.find((p) => p.id === view.winnerId);
  const againRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLAnchorElement>(null);
  useEffect(() => (againRef.current ?? menuRef.current)?.focus(), []);
  const last = view.last;
  const high = last ? Object.values(last.laid).flat().filter((l) => l.bounty && warRank(l.card) >= 13) : [];

  return (
    <motion.div className="fixed inset-0 z-40 flex items-center justify-center overflow-y-auto bg-black/80 p-4" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
      <div role="dialog" aria-modal="true" aria-labelledby="winner-title" className="felt my-auto w-full max-w-md rounded-[2rem] p-7 sm:p-9">
        <h2 id="winner-title" className="font-display text-6xl leading-none font-extrabold text-bone">
          {winner ? `${winner.name} wins` : "Game over"}
        </h2>
        <ul className="mt-6 divide-y divide-baize-deep border-y border-baize-deep">
          {view.sides!.map((x) => (
            <li key={x.id} className="flex items-baseline justify-between gap-3 py-2.5 text-base">
              <span className={x.id === view.winnerId ? "font-bold text-bone" : "text-bone"}>{view.players.find((p) => p.id === x.id)?.name}</span>
              <span className="text-sm text-bone tabular-nums">{x.count} cards</span>
            </li>
          ))}
        </ul>
        <p className="mt-3 text-sm text-bone">
          {view.battles} battles
          {high.length > 0 && `. The last War buried ${high.map((l) => cardLabel(l.card)).join(", ")}.`}
        </p>
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
