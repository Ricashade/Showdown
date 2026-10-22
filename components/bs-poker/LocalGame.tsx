"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { BsPokerAction, BsPokerState } from "@/types/bs-poker";
import { applyAction, createRoom, getPlayerView } from "@/lib/bs-poker-game";
import { createLocalTransport } from "@/lib/multiplayer/transport";
import { useGameRoom } from "@/lib/hooks/use-game-room";
import { useBotTurns } from "@/lib/hooks/use-bot-turns";
import { PovSwitcher } from "@/components/table/PovSwitcher";
import { TableScreen } from "./TableScreen";

function initialRoom(): BsPokerState {
  let s = createRoom({ roomId: "local-dev", host: { id: "p1", name: "Player 1" } });
  for (const n of [2, 3]) {
    const r = applyAction(s, { type: "JOIN_ROOM", player: { id: `p${n}`, name: `Player ${n}` } });
    if (r.ok) s = r.state;
  }
  return s;
}

const randomSeed = () => crypto.getRandomValues(new Uint32Array(1))[0];

/**
 * Dev simulator: every seat on one screen. Switch whose eyes you see through, or view
 * everyone's cards at once, to test rules without a second computer.
 */
export default function LocalGame() {
  const [transport] = useState(() => createLocalTransport(initialRoom(), applyAction));
  const state = useGameRoom(transport);
  const [viewer, setViewer] = useState<string | "god">("p1");
  const [followTurn, setFollowTurn] = useState(true);
  const [error, setError] = useState<{ message: string; id: number } | null>(null);
  const nextIdRef = useRef(4);
  const errorIdRef = useRef(0);

  const dispatch = useCallback(
    (action: BsPokerAction) => {
      const r = transport.dispatch(action);
      // Local transport is sync; a network transport would return a promise.
      if (!(r instanceof Promise) && !r.ok) setError({ message: r.error, id: ++errorIdRef.current });
    },
    [transport],
  );

  useBotTurns(state, dispatch);

  // Runs only when the turn changes, so a manual POV pick sticks until the next move.
  useEffect(() => {
    const turnId = state.currentTurnPlayerId;
    if (followTurn && state.phase === "bidding" && turnId) setViewer((v) => (v === "god" ? v : turnId));
  }, [followTurn, state.phase, state.currentTurnPlayerId]);

  // Keep the POV valid if its player was removed.
  useEffect(() => {
    if (viewer !== "god" && !state.players.some((p) => p.id === viewer)) setViewer(state.players[0]?.id ?? "god");
  }, [state.players, viewer]);

  const view = useMemo(() => getPlayerView(state, viewer), [state, viewer]);
  const actingId = viewer === "god" ? state.currentTurnPlayerId : viewer;

  return (
    <TableScreen
      view={view}
      actingId={actingId}
      isHost
      onAction={dispatch}
      onStartGame={() => dispatch({ type: "START_GAME", playerId: state.hostId, seed: randomSeed() })}
      exit={
        state.phase === "lobby"
          ? undefined
          : {
              label: "End game",
              confirm: "End this game and go back to the lobby?",
              onExit: () => dispatch({ type: "RETURN_TO_LOBBY", playerId: state.hostId }),
            }
      }
      canDealNextRound
      onViewAs={setViewer}
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
      error={error}
      topBar={
        state.phase === "lobby" ? undefined : (
          <PovSwitcher
            players={view.players}
            viewer={viewer}
            currentTurnId={state.currentTurnPlayerId}
            followTurn={followTurn}
            onSelect={setViewer}
            onFollowTurnChange={setFollowTurn}
          />
        )
      }
    />
  );
}
