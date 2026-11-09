"use client";

import { useCallback, useRef, useState } from "react";
import type { ActionResult, BasePlayer, PlayerSeed } from "@/types/game";
import type { Seed } from "@/types/cards";
import { randomSeed } from "@/lib/cards";
import { createLocalTransport } from "@/lib/multiplayer/transport";
import { newBot, type BotRunner } from "@/lib/bot-ai";
import type { LobbyOptions } from "@/components/table/SeatsPanel";
import type { HeaderExit } from "@/components/table/chrome";
import { useGameRoom } from "./use-game-room";
import { useBotDriver } from "./use-bot-driver";
import { useTableClock, type TableClock } from "./use-table-clock";

/** Your seat at a solo table. */
export const ME = "p1";

/** The lobby moves every game shares. */
type LobbyAction =
  | { type: "JOIN_ROOM"; player: PlayerSeed }
  | { type: "LEAVE_ROOM"; playerId: string }
  | { type: "RENAME_PLAYER"; playerId: string; name: string }
  | { type: "START_GAME"; playerId: string; seed: Seed }
  | { type: "RETURN_TO_LOBBY"; playerId: string };

interface SoloState {
  version: number;
  phase: string;
  players: BasePlayer[];
}

/**
 * You and the bots you seat, on this screen: the whole game runs here, bots and table timers included.
 * Returns the props every table screen takes for its lobby and header.
 */
export function useSoloTable<S extends SoloState, A>({
  create,
  apply,
  bots,
  clock,
  seats,
}: {
  create: () => S;
  apply: (s: S, a: A) => ActionResult<S>;
  bots: BotRunner<S, A>;
  clock?: TableClock<S, A>;
  /** Games that seat watchers (a War duel, say): only as many as play, so you always play. */
  seats?: number;
}) {
  const [transport] = useState(() => createLocalTransport(create(), apply));
  const state = useGameRoom(transport);
  const [error, setError] = useState<{ message: string; id: number } | null>(null);
  const errorId = useRef(0);

  const dispatch = useCallback(
    (action: A) => {
      const r = transport.dispatch(action);
      if (!(r instanceof Promise) && !r.ok) setError({ message: r.error, id: ++errorId.current });
    },
    [transport],
  );

  useBotDriver(state, bots, dispatch);
  useTableClock(state, clock, dispatch);

  const lobbyMove = (action: LobbyAction) => dispatch(action as A);
  const exit: HeaderExit | undefined =
    state.phase === "lobby" ? undefined : { label: "End game", confirm: "End this game?", onExit: () => lobbyMove({ type: "RETURN_TO_LOBBY", playerId: ME }) };
  const lobby: LobbyOptions = {
    canRename: () => true,
    canRemove: (id) => id !== ME,
    onRemove: (id) => lobbyMove({ type: "LEAVE_ROOM", playerId: id }),
    onRename: (id, name) => lobbyMove({ type: "RENAME_PLAYER", playerId: id, name }),
    onAddBot: (difficulty) => lobbyMove({ type: "JOIN_ROOM", player: newBot(difficulty, state.players.map((p) => p.name)) }),
    maxSeats: seats,
  };

  return {
    state,
    dispatch,
    table: { error, exit, lobby, onStartGame: () => lobbyMove({ type: "START_GAME", playerId: ME, seed: randomSeed() }) },
  };
}
