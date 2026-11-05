"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import type { SpeedAction, SpeedState } from "@/types/speed";
import { applySpeedAction, createSpeedRoom, getSpeedView, speedClock } from "@/lib/speed-engine";
import { createLocalTransport } from "@/lib/multiplayer/transport";
import { useGameRoom } from "@/lib/hooks/use-game-room";
import { useBotDriver } from "@/lib/hooks/use-bot-driver";
import { useTableClock } from "@/lib/hooks/use-table-clock";
import { newBot, speedBots } from "@/lib/bot-ai";
import { SpeedTableScreen } from "./SpeedTableScreen";
import { LocalRoomChat } from "@/components/RoomChat";

/** You against a bot (Speed has no turns to pass a screen between). From the demo, a quicker one. */
function initialRoom(fromDemo: boolean): SpeedState {
  let s = createSpeedRoom({ roomId: "local-speed", host: { id: "p1", name: "You" } });
  // A fixed seat (no random name), so the page renders the same on the server and in the browser.
  const bot = fromDemo
    ? { id: "bot-clara", name: "Calculated Clara", isBot: true, botDifficulty: "medium" as const }
    : { id: "bot-benny", name: "Bot Benny", isBot: true, botDifficulty: "easy" as const };
  const r = applySpeedAction(s, { type: "JOIN_ROOM", player: bot });
  if (r.ok) s = r.state;
  return s;
}

const randomSeed = () => crypto.getRandomValues(new Uint32Array(1))[0];

/** You against a bot, on this screen. */
export default function LocalSpeed({ fromDemo = false }: { fromDemo?: boolean }) {
  const [transport] = useState(() => createLocalTransport(initialRoom(fromDemo), (s: SpeedState, a: SpeedAction) => applySpeedAction(s, a, Date.now())));
  const state = useGameRoom(transport);
  const [error, setError] = useState<{ message: string; id: number } | null>(null);
  const nextIdRef = useRef(2);
  const errorIdRef = useRef(0);

  const dispatch = useCallback(
    (action: SpeedAction) => {
      const r = transport.dispatch(action);
      if (!(r instanceof Promise) && !r.ok) setError({ message: r.error, id: ++errorIdRef.current });
    },
    [transport],
  );

  useBotDriver(state, speedBots, dispatch);
  useTableClock(state, speedClock, dispatch);

  // You're always "p1": playing, or watching if the host seats two others.
  const view = useMemo(() => getSpeedView(state, "p1"), [state]);

  return (
    <>
      <SpeedTableScreen
        view={view}
        actingId="p1"
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
      />
      <LocalRoomChat state={state} speakerId="p1" />
    </>
  );
}
