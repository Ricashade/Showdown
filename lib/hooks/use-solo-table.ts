"use client";

import { useCallback, useRef, useState } from "react";
import type { ActionResult, BasePlayer, BotDifficulty, PlayerSeed } from "@/types/game";
import { createLocalTransport } from "@/lib/multiplayer/transport";
import { newBot, type BotRunner } from "@/lib/bot-ai";
import type { LobbyOptions } from "@/components/table/SeatsPanel";
import type { HeaderExit } from "@/components/table/chrome";
import { useGameRoom } from "./use-game-room";
import { useBotDriver } from "./use-bot-driver";
import { useTableClock, type TableClock } from "./use-table-clock";

/** Your seat at a solo table. */
export const ME = "p1";

/**
 * Who you play against until you change the lineup. Fixed seats (no random names), so the page
 * renders the same on the server and in the browser.
 */
export const HOUSE_BOTS = [
  { id: "bot-clara", name: "Calculated Clara", isBot: true, botDifficulty: "medium" },
  { id: "bot-benny", name: "Bot Benny", isBot: true, botDifficulty: "easy" },
  { id: "bot-vinnie", name: "Shark Vinnie", isBot: true, botDifficulty: "hard" },
] satisfies (PlayerSeed & { botDifficulty: BotDifficulty })[];

/** The lobby moves every game shares. */
type LobbyAction =
  | { type: "JOIN_ROOM"; player: PlayerSeed }
  | { type: "LEAVE_ROOM"; playerId: string }
  | { type: "RENAME_PLAYER"; playerId: string; name: string }
  | { type: "START_GAME"; playerId: string; seed: number }
  | { type: "RETURN_TO_LOBBY"; playerId: string };

interface SoloState {
  version: number;
  phase: string;
  players: BasePlayer[];
}

/** Seats `bots` at a new room. */
export function seatBots<S, A>(room: S, apply: (s: S, a: A) => ActionResult<S>, bots: PlayerSeed[]): S {
  for (const player of bots) {
    const r = apply(room, { type: "JOIN_ROOM", player } satisfies LobbyAction as A);
    if (r.ok) room = r.state;
  }
  return room;
}

const randomSeed = () => crypto.getRandomValues(new Uint32Array(1))[0];

/**
 * You against bots on this screen: the whole game runs here, bots and table timers included.
 * Returns the props every table screen takes for its lobby and header.
 */
export function useSoloTable<S extends SoloState, A>({
  create,
  apply,
  bots,
  clock,
}: {
  create: () => S;
  apply: (s: S, a: A) => ActionResult<S>;
  bots: BotRunner<S, A>;
  clock?: TableClock<S, A>;
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
  };

  return {
    state,
    dispatch,
    table: { error, exit, lobby, onStartGame: () => lobbyMove({ type: "START_GAME", playerId: ME, seed: randomSeed() }) },
  };
}
