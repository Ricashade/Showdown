"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { HoldemAction, HoldemState } from "@/types/holdem";
import { applyHoldemAction, createHoldemRoom, getHoldemView } from "@/lib/holdem-game";
import { createLocalTransport } from "@/lib/multiplayer/transport";
import { useGameRoom } from "@/lib/hooks/use-game-room";
import { useBotDriver } from "@/lib/hooks/use-bot-driver";
import { holdemBots, newBot } from "@/lib/bot-ai";
import { PovSwitcher } from "@/components/table/PovSwitcher";
import { HoldemTableScreen } from "./HoldemTableScreen";
import { LocalRoomChat } from "@/components/RoomChat";

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

  useBotDriver(state, holdemBots, dispatch);

  // Follow the turn between humans; bots play themselves.
  useEffect(() => {
    const turnId = state.currentTurnId;
    const turnIsBot = state.players.find((p) => p.id === turnId)?.isBot;
    if (followTurn && state.phase === "betting" && turnId && !turnIsBot) setViewer((v) => (v === "god" ? v : turnId));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [followTurn, state.phase, state.currentTurnId]);

  useEffect(() => {
    if (viewer !== "god" && !state.players.some((p) => p.id === viewer)) setViewer(state.players[0]?.id ?? "god");
  }, [state.players, viewer]);

  const view = useMemo(() => getHoldemView(state, viewer), [state, viewer]);
  const actingId = viewer === "god" ? state.currentTurnId : viewer;

  return (
    <>
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
      <LocalRoomChat state={state} speakerId={viewer === "god" ? state.hostId : viewer} />
    </>
  );
}
