"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { HoldemAction, HoldemState } from "@/types/holdem";
import { applyHoldemAction, createHoldemRoom, getHoldemView } from "@/lib/holdem-game";
import { createLocalTransport } from "@/lib/multiplayer/transport";
import { useGameRoom } from "@/lib/hooks/use-game-room";
import { PovSwitcher } from "@/components/table/PovSwitcher";
import { HoldemTableScreen } from "./HoldemTableScreen";

function initialRoom(): HoldemState {
  let s = createHoldemRoom({ roomId: "local-holdem", host: { id: "p1", name: "Player 1" } });
  for (const n of [2, 3, 4]) {
    const r = applyHoldemAction(s, { type: "JOIN_ROOM", player: { id: `p${n}`, name: `Player ${n}` } });
    if (r.ok) s = r.state;
  }
  return s;
}

const randomSeed = () => crypto.getRandomValues(new Uint32Array(1))[0];

/** Dev simulator: every seat on one screen. */
export default function LocalHoldem() {
  const [transport] = useState(() => createLocalTransport(initialRoom(), applyHoldemAction));
  const state = useGameRoom(transport);
  const [viewer, setViewer] = useState<string | "god">("p1");
  const [followTurn, setFollowTurn] = useState(true);
  const [error, setError] = useState<{ message: string; id: number } | null>(null);
  const nextIdRef = useRef(5);
  const errorIdRef = useRef(0);

  const dispatch = useCallback(
    (action: HoldemAction) => {
      const r = transport.dispatch(action);
      if (!(r instanceof Promise) && !r.ok) setError({ message: r.error, id: ++errorIdRef.current });
    },
    [transport],
  );

  useEffect(() => {
    const turnId = state.currentTurnId;
    if (followTurn && state.phase === "betting" && turnId) setViewer((v) => (v === "god" ? v : turnId));
  }, [followTurn, state.phase, state.currentTurnId]);

  useEffect(() => {
    if (viewer !== "god" && !state.players.some((p) => p.id === viewer)) setViewer(state.players[0]?.id ?? "god");
  }, [state.players, viewer]);

  const view = useMemo(() => getHoldemView(state, viewer), [state, viewer]);
  const actingId = viewer === "god" ? state.currentTurnId : viewer;

  return (
    <HoldemTableScreen
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
      autoNextHandSeconds={6}
      error={error}
      lobby={{
        canRename: () => true,
        canRemove: (id) => id !== state.hostId,
        onRemove: (id) => dispatch({ type: "LEAVE_ROOM", playerId: id }),
        onRename: (id, name) => dispatch({ type: "RENAME_PLAYER", playerId: id, name }),
        onAddPlayer: () => {
          const n = nextIdRef.current++;
          dispatch({ type: "JOIN_ROOM", player: { id: `p${n}`, name: `Player ${state.players.length + 1}` } });
        },
      }}
      topBar={
        state.phase === "lobby" ? undefined : (
          <PovSwitcher
            players={view.players}
            viewer={viewer}
            currentTurnId={state.currentTurnId}
            followTurn={followTurn}
            onSelect={setViewer}
            onFollowTurnChange={setFollowTurn}
          />
        )
      }
    />
  );
}
