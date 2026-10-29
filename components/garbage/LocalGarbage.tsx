"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { GarbageAction, GarbageState } from "@/types/garbage";
import { applyGarbageAction, createGarbageRoom, getGarbageView } from "@/lib/garbage-engine";
import { createLocalTransport } from "@/lib/multiplayer/transport";
import { useGameRoom } from "@/lib/hooks/use-game-room";
import { useBotDriver } from "@/lib/hooks/use-bot-driver";
import { garbageBots, newBot } from "@/lib/bot-ai";
import { PovSwitcher } from "@/components/table/PovSwitcher";
import { GarbageTableScreen } from "./GarbageTableScreen";
import { LocalRoomChat } from "@/components/RoomChat";

function initialRoom(): GarbageState {
  let s = createGarbageRoom({ roomId: "local-garbage", host: { id: "p1", name: "Player 1" } });
  for (const n of [2, 3]) {
    const r = applyGarbageAction(s, { type: "JOIN_ROOM", player: { id: `p${n}`, name: `Player ${n}` } });
    if (r.ok) s = r.state;
  }
  return s;
}

const randomSeed = () => crypto.getRandomValues(new Uint32Array(1))[0];

/** Dev simulator: every seat on one screen. */
export default function LocalGarbage() {
  const [transport] = useState(() => createLocalTransport(initialRoom(), applyGarbageAction));
  const state = useGameRoom(transport);
  const [viewer, setViewer] = useState<string | "god">("p1");
  const [followTurn, setFollowTurn] = useState(true);
  const [error, setError] = useState<{ message: string; id: number } | null>(null);
  const nextIdRef = useRef(4);
  const errorIdRef = useRef(0);

  const dispatch = useCallback(
    (action: GarbageAction) => {
      const r = transport.dispatch(action);
      if (!(r instanceof Promise) && !r.ok) setError({ message: r.error, id: ++errorIdRef.current });
    },
    [transport],
  );

  useBotDriver(state, garbageBots, dispatch);

  // Follow whoever has to act among the humans: the turn, then each player still rearranging.
  const toAct =
    state.phase === "reveal"
      ? (state.players.find((p) => !p.isBot && !p.revealDone)?.id ?? null)
      : state.phase === "playing" && !state.players.find((p) => p.id === state.currentTurnId)?.isBot
        ? state.currentTurnId
        : null;
  useEffect(() => {
    if (followTurn && toAct) setViewer((v) => (v === "god" ? v : toAct));
  }, [followTurn, toAct]);

  useEffect(() => {
    if (viewer !== "god" && !state.players.some((p) => p.id === viewer)) setViewer(state.players[0]?.id ?? "god");
  }, [state.players, viewer]);

  const view = useMemo(() => getGarbageView(state, viewer), [state, viewer]);
  const actingId = viewer === "god" ? toAct : viewer;

  return (
    <>
      <GarbageTableScreen
        view={view}
        actingId={actingId}
        isHost
        onAction={dispatch}
        onStartGame={() => dispatch({ type: "START_GAME", playerId: state.hostId, seed: randomSeed() })}
        exit={
          state.phase === "lobby"
            ? undefined
            : { label: "End game", confirm: "End this game?", onExit: () => dispatch({ type: "RETURN_TO_LOBBY", playerId: state.hostId }) }
        }
        error={error}
        lobby={{
          canRename: () => true,
          canRemove: (id) => id !== state.hostId,
          onRemove: (id) => dispatch({ type: "LEAVE_ROOM", playerId: id }),
          onRename: (id, name) => dispatch({ type: "RENAME_PLAYER", playerId: id, name }),
          onAddBot: (difficulty) => dispatch({ type: "JOIN_ROOM", player: newBot(difficulty, state.players.map((p) => p.name)) }),
          onAddPlayer: () => {
            const n = nextIdRef.current++;
            dispatch({ type: "JOIN_ROOM", player: { id: `p${n}`, name: `Player ${state.players.length + 1}` } });
          },
        }}
        topBar={
          state.phase === "lobby" ? undefined : (
            <PovSwitcher
              players={view.players.map((p) => ({ ...p, status: "active" }))}
              viewer={viewer}
              currentTurnId={state.currentTurnId}
              followTurn={followTurn}
              onSelect={setViewer}
              onFollowTurnChange={setFollowTurn}
            />
          )
        }
      />
      <LocalRoomChat state={state} speakerId={viewer === "god" ? state.hostId : viewer} />
    </>
  );
}
