"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { WarAction, WarState } from "@/types/war";
import { applyWarAction, createWarRoom, getWarView } from "@/lib/war-engine";
import { createLocalTransport } from "@/lib/multiplayer/transport";
import { useGameRoom } from "@/lib/hooks/use-game-room";
import { useBotDriver } from "@/lib/hooks/use-bot-driver";
import { newBot, warBots } from "@/lib/bot-ai";
import { PovSwitcher } from "@/components/table/PovSwitcher";
import { WarTableScreen } from "./WarTableScreen";

function initialRoom(): WarState {
  const s = createWarRoom({ roomId: "local-war", host: { id: "p1", name: "Player 1" } });
  const r = applyWarAction(s, { type: "JOIN_ROOM", player: { id: "p2", name: "Player 2" } });
  return r.ok ? r.state : s;
}

const randomSeed = () => crypto.getRandomValues(new Uint32Array(1))[0];

/** Dev simulator: both duelists on one screen; Flip flips for every person at the table. */
export default function LocalWar() {
  const [transport] = useState(() => createLocalTransport(initialRoom(), applyWarAction));
  const state = useGameRoom(transport);
  const [viewer, setViewer] = useState<string | "god">("p1");
  const [followTurn, setFollowTurn] = useState(true);
  const [error, setError] = useState<{ message: string; id: number } | null>(null);
  const nextIdRef = useRef(3);
  const errorIdRef = useRef(0);

  const dispatch = useCallback(
    (action: WarAction) => {
      const r = transport.dispatch(action);
      if (!(r instanceof Promise) && !r.ok) setError({ message: r.error, id: ++errorIdRef.current });
    },
    [transport],
  );

  useBotDriver(state, warBots, dispatch);

  const humanDuelists = (state.sides ?? []).map((x) => x.id).filter((id) => !state.players.find((p) => p.id === id)?.isBot);
  // Tactical: follow whichever person still has to pick a card.
  const toPick = state.settings.mode === "tactical" ? (state.sides?.find((x) => !x.ready && humanDuelists.includes(x.id))?.id ?? null) : null;
  useEffect(() => {
    if (followTurn && toPick) setViewer((v) => (v === "god" ? v : toPick));
  }, [followTurn, toPick]);

  useEffect(() => {
    if (viewer !== "god" && !state.players.some((p) => p.id === viewer)) setViewer(state.players[0]?.id ?? "god");
  }, [state.players, viewer]);

  const view = useMemo(() => getWarView(state, viewer), [state, viewer]);

  return (
    <WarTableScreen
      view={view}
      controlIds={humanDuelists}
      actingId={viewer === "god" ? toPick : viewer}
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
            currentTurnId={toPick}
            followTurn={followTurn}
            onSelect={setViewer}
            onFollowTurnChange={setFollowTurn}
          />
        )
      }
    />
  );
}
