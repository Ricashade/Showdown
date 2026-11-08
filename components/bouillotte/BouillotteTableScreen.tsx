"use client";

import { useEffect, useRef } from "react";
import { AnimatePresence, motion } from "framer-motion";
import type { BouillotteAction, BouillotteSettings } from "@/types/bouillotte";
import { getBouillotteLegal, type BouillotteView } from "@/lib/bouillotte-engine";
import { rankName, suitName } from "@/lib/cards";
import { ScreenHeader, Toast, type HeaderExit } from "@/components/table/chrome";
import type { LobbyOptions } from "@/components/table/SeatsPanel";
import { RoomLink, RoomStage } from "@/components/ui/RoomTransition";
import { TableLoader } from "@/components/table/TableLoader";
import { BouillotteActions } from "./BouillotteActions";
import { BouillotteLobby } from "./BouillotteLobby";
import { BouillotteTable } from "./BouillotteTable";
import { SuitMeter } from "./SuitMeter";
import { brelanWords, chips } from "./words";

export interface BouillotteTableScreenProps {
  view: BouillotteView;
  /** Whose controls to show: yours. */
  actingId: string | null;
  isHost: boolean;
  onAction: (action: BouillotteAction) => void;
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

export function BouillotteTableScreen({ view, actingId, isHost, onAction, onStartGame, lobby, exit, connectedIds, error, topBar, headerExtra, postGameActions }: BouillotteTableScreenProps) {
  const name = (id: string) => view.players.find((p) => p.id === id)?.name ?? "";
  const legal = getBouillotteLegal(view, actingId);
  const acting = view.players.find((p) => p.id === actingId);
  const myTurn = legal.isMyTurn && !!acting && !acting.isBot;
  const turn = view.players.find((p) => p.id === view.currentTurnId);
  const focusId = view.players.some((p) => p.id === view.viewerId) ? view.viewerId : view.godMode ? (view.currentTurnId ?? actingId) : null;
  const hostName = name(view.hostId) || "The host";

  let prompt = "";
  if (view.phase === "carre") prompt = myTurn ? "Post a blind carré?" : `${turn?.name} may post a carré…`;
  else if (view.phase === "betting") prompt = myTurn ? (legal.canCheck ? "Your move." : `${chips(legal.callAmount)} to call.`) : turn?.isBot ? `${turn.name} is thinking…` : `Waiting for ${turn?.name}.`;

  return (
    <div className="min-h-screen pb-16 md:pb-5">
      <div inert={view.phase === "game_over"}>
        <ScreenHeader
          title="Bouillotte"
          exit={exit}
          extra={
            view.phase === "lobby"
              ? headerExtra
              : prompt && (
                  <p aria-live="polite" className="font-display text-2xl font-bold text-bone">
                    {prompt}
                  </p>
                )
          }
        />
        {topBar && <div className="mx-auto mt-5 max-w-6xl px-4 sm:px-8">{topBar}</div>}

        <RoomStage room={view.phase === "lobby" ? "lobby" : "table"} loader={<TableLoader game="bouillotte" />}>
          {view.phase === "lobby" ? (
            <BouillotteLobby
              view={view}
              isHost={isHost}
              options={lobby}
              connectedIds={connectedIds}
              onUpdateSettings={(patch: Partial<BouillotteSettings>) => onAction({ type: "UPDATE_SETTINGS", playerId: view.hostId, settings: patch })}
              onStart={onStartGame}
            />
          ) : (
            <main className="mx-auto max-w-6xl space-y-4 pt-3 sm:px-4">
              <BouillotteTable view={view} focusId={focusId} connectedIds={connectedIds} />
              {myTurn && <BouillotteActions view={view} legal={legal} actingId={actingId!} onAction={onAction} />}
              <AnimatePresence>
                {view.phase === "hand_over" && view.result && (
                  <HandResult key={view.result.handNumber} view={view} canDeal={isHost} hostName={hostName} onNext={() => onAction({ type: "NEXT_HAND", playerId: view.hostId })} />
                )}
              </AnimatePresence>
            </main>
          )}
        </RoomStage>
      </div>

      {view.phase === "game_over" && <GameOver view={view} actions={postGameActions} canPlayAgain={isHost} onPlayAgain={() => onAction({ type: "RETURN_TO_LOBBY", playerId: view.hostId })} />}
      <Toast error={error} />
    </div>
  );
}

/** How the hand went: who took each pot and why, with Le Point counted up when it decided. */
function HandResult({ view, canDeal, hostName, onNext }: { view: BouillotteView; canDeal: boolean; hostName: string; onNext: () => void }) {
  const result = view.result!;
  const name = (id: string) => view.players.find((p) => p.id === id)?.name ?? "";
  const nextRef = useRef<HTMLButtonElement>(null);
  useEffect(() => nextRef.current?.focus(), []);
  const pointSuit = result.pots.find((p) => p.by === "point")?.suit ?? null;

  return (
    <motion.section aria-label="Hand result" className="mx-4 grid gap-6 rounded-[2rem] bg-smoke-raised p-6 ring-1 ring-leather-lit sm:grid-cols-[1fr_auto] sm:p-8" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
      <div className="space-y-3">
        {result.pots.map((pot, i) => {
          const card = Object.values(result.revealed).flat().find((c) => c.id === pot.cardId) ?? null;
          const why =
            pot.by === "fold"
              ? "Everyone else folded."
              : pot.by === "brelan"
                ? brelanWords(result.brelans[pot.winnerId])
                : card && card.kind === "standard"
                  ? `${suitName(pot.suit!)} win Le Point; the ${rankName(card.rank)} takes it.`
                  : "";
          return (
            <div key={i}>
              {result.pots.length > 1 && <p className="text-sm text-ash">{i === 0 ? "Main pot" : "Side pot"}</p>}
              <p className="font-display text-4xl leading-tight font-extrabold text-bone">
                {name(pot.winnerId)} {name(pot.winnerId) === "You" ? "win" : "wins"} {chips(pot.amount)}
              </p>
              <p className="text-lg text-brass-lit">{why}</p>
            </div>
          );
        })}
        {result.bonus && result.bonus.total > 0 && (
          <p className="text-base text-parchment">
            Brélan bonus: {result.bonus.each} from everyone else, {chips(result.bonus.total)} in all.
          </p>
        )}
        <div className="pt-2">
          {canDeal ? (
            <button ref={nextRef} onClick={onNext} className="min-h-12 rounded-full bg-brass px-7 font-display text-2xl font-bold text-smoke hover:bg-brass-lit">
              Next hand
            </button>
          ) : (
            <p className="text-base text-parchment">Waiting for {hostName} to deal.</p>
          )}
        </div>
      </div>
      {result.totals && (
        <div className="min-w-64">
          <h3 className="mb-3 font-display text-2xl font-bold text-bone">Le Point</h3>
          <SuitMeter totals={result.totals} winner={pointSuit} />
        </div>
      )}
    </motion.section>
  );
}

function GameOver({ view, actions, canPlayAgain, onPlayAgain }: { view: BouillotteView; actions?: React.ReactNode; canPlayAgain: boolean; onPlayAgain: () => void }) {
  const ref = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLAnchorElement>(null);
  useEffect(() => (ref.current ?? menuRef.current)?.focus(), []);
  const winner = view.players.find((p) => p.id === view.winnerId);
  const standings = [...view.players].sort((a, b) => b.chips - a.chips);

  return (
    <motion.div className="fixed inset-0 z-40 flex items-center justify-center overflow-y-auto bg-black/80 p-4" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
      <div role="dialog" aria-modal="true" aria-labelledby="winner-title" className="felt my-auto w-full max-w-md rounded-[2rem] p-7 sm:p-9">
        <h2 id="winner-title" className="font-display text-6xl leading-none font-extrabold text-bone">
          {winner?.name} {winner?.name === "You" ? "win" : "wins"}
        </h2>
        <ol className="mt-6 divide-y divide-baize-deep border-y border-baize-deep">
          {standings.map((p, i) => (
            <li key={p.id} className="flex items-baseline justify-between gap-3 py-2.5 text-base">
              <span className="flex items-baseline gap-3">
                <span className="w-5 font-display text-xl font-bold text-bone tabular-nums">{i + 1}</span>
                <span className={p.id === view.winnerId ? "font-bold text-bone" : "text-bone"}>{p.name}</span>
              </span>
              <span className="text-sm text-bone tabular-nums">{p.chips ? `${chips(p.chips)} chips` : "Out"}</span>
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
