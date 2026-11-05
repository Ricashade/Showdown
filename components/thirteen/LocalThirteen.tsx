"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ThirteenAction, ThirteenState } from "@/types/thirteen";
import { applyThirteenAction, createThirteenRoom, getThirteenView } from "@/lib/thirteen-engine";
import { createLocalTransport } from "@/lib/multiplayer/transport";
import { useGameRoom } from "@/lib/hooks/use-game-room";
import { useBotDriver } from "@/lib/hooks/use-bot-driver";
import { newBot, thirteenBots } from "@/lib/bot-ai";
import { PovSwitcher } from "@/components/table/PovSwitcher";
import { ThirteenTableScreen } from "./ThirteenTableScreen";
import { LocalRoomChat } from "@/components/RoomChat";

/** Three people on one screen, or (from the demo) you against two bots. */
function initialRoom(vsBots: boolean): ThirteenState {
  let s = createThirteenRoom({ roomId: "local-thirteen", host: { id: "p1", name: vsBots ? "You" : "Player 1" } });
  // Fixed seats (no random names), so the page renders the same on the server and in the
  // browser. They're the bots from the demo.
  const seats = vsBots
    ? [
        { id: "bot-vinnie", name: "Shark Vinnie", isBot: true, botDifficulty: "hard" as const },
        { id: "bot-ivy", name: "Ice Cold Ivy", isBot: true, botDifficulty: "medium" as const },
      ]
    : [2, 3].map((n) => ({ id: `p${n}`, name: `Player ${n}` }));
  for (const player of seats) {
    const r = applyThirteenAction(s, { type: "JOIN_ROOM", player });
    if (r.ok) s = r.state;
  }
  return s;
}

const randomSeed = () => crypto.getRandomValues(new Uint32Array(1))[0];

/** Dev simulator: every seat on one screen. */
export default function LocalThirteen({ vsBots = false }: { vsBots?: boolean }) {
  const [transport] = useState(() => createLocalTransport(initialRoom(vsBots), applyThirteenAction));
  const state = useGameRoom(transport);
  const [viewer, setViewer] = useState<string | "god">("p1");
  const [followTurn, setFollowTurn] = useState(true);
  const [error, setError] = useState<{ message: string; id: number } | null>(null);
  const nextIdRef = useRef(4);
  const errorIdRef = useRef(0);

  const dispatch = useCallback(
    (action: ThirteenAction) => {
      const r = transport.dispatch(action);
      if (!(r instanceof Promise) && !r.ok) setError({ message: r.error, id: ++errorIdRef.current });
    },
    [transport],
  );

  useBotDriver(state, thirteenBots, dispatch);

  // Follow the turn between humans; bots play themselves.
  const toAct = state.phase === "playing" && !state.players.find((p) => p.id === state.currentTurnId)?.isBot ? state.currentTurnId : null;
  useEffect(() => {
    if (followTurn && toAct) setViewer((v) => (v === "god" ? v : toAct));
  }, [followTurn, toAct]);

  useEffect(() => {
    if (viewer !== "god" && !state.players.some((p) => p.id === viewer)) setViewer(state.players[0]?.id ?? "god");
  }, [state.players, viewer]);

  const view = useMemo(() => getThirteenView(state, viewer), [state, viewer]);
  const actingId = viewer === "god" ? toAct : viewer;
  const seated = state.seats?.map((x) => x.id) ?? [];

  return (
    <>
      <ThirteenTableScreen
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
              players={view.players.filter((p) => seated.includes(p.id)).map((p) => ({ ...p, status: "active" }))}
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
