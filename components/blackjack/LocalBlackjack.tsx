"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { BlackjackAction, BlackjackState } from "@/types/blackjack";
import { applyBlackjackAction, blackjackClock, createBlackjackRoom, getBlackjackView } from "@/lib/blackjack-engine";
import { createLocalTransport } from "@/lib/multiplayer/transport";
import { useGameRoom } from "@/lib/hooks/use-game-room";
import { useBotDriver } from "@/lib/hooks/use-bot-driver";
import { useTableClock } from "@/lib/hooks/use-table-clock";
import { blackjackBots, newBot } from "@/lib/bot-ai";
import { PovSwitcher } from "@/components/table/PovSwitcher";
import { BlackjackTableScreen } from "./BlackjackTableScreen";
import { LocalRoomChat } from "@/components/RoomChat";

function initialRoom(): BlackjackState {
  let s = createBlackjackRoom({ roomId: "local-blackjack", host: { id: "p1", name: "Player 1" } });
  for (const n of [2, 3]) {
    const r = applyBlackjackAction(s, { type: "JOIN_ROOM", player: { id: `p${n}`, name: `Player ${n}` } });
    if (r.ok) s = r.state;
  }
  return s;
}

const randomSeed = () => crypto.getRandomValues(new Uint32Array(1))[0];

/** Whose decision the table is waiting on, among the humans. */
function humanToAct(s: BlackjackState): string | null {
  const humans = s.players.filter((p) => !p.isBot && p.status === "active");
  if (s.phase === "betting") return humans.find((p) => p.bet === 0)?.id ?? null;
  if (s.phase === "insurance") return humans.find((p) => p.insurance === null)?.id ?? null;
  if (s.phase === "playing") return humans.find((p) => p.id === s.currentTurnId)?.id ?? null;
  return null;
}

/** Dev simulator: every seat on one screen, the dealer and timers run right here. */
export default function LocalBlackjack() {
  const [transport] = useState(() => createLocalTransport(initialRoom(), (s: BlackjackState, a: BlackjackAction) => applyBlackjackAction(s, a, Date.now())));
  const state = useGameRoom(transport);
  const [viewer, setViewer] = useState<string | "god">("p1");
  const [followTurn, setFollowTurn] = useState(true);
  const [error, setError] = useState<{ message: string; id: number } | null>(null);
  const nextIdRef = useRef(4);
  const errorIdRef = useRef(0);

  const dispatch = useCallback(
    (action: BlackjackAction) => {
      const r = transport.dispatch(action);
      if (!(r instanceof Promise) && !r.ok) setError({ message: r.error, id: ++errorIdRef.current });
    },
    [transport],
  );

  useBotDriver(state, blackjackBots, dispatch);
  useTableClock(state, blackjackClock, dispatch);

  // Follow whoever has to decide next: each bettor in turn, then each player's hand.
  const toAct = humanToAct(state);
  useEffect(() => {
    if (followTurn && toAct) setViewer((v) => (v === "god" ? v : toAct));
  }, [followTurn, toAct]);

  useEffect(() => {
    if (viewer !== "god" && !state.players.some((p) => p.id === viewer)) setViewer(state.players[0]?.id ?? "god");
  }, [state.players, viewer]);

  const view = useMemo(() => getBlackjackView(state, viewer), [state, viewer]);
  const actingId = viewer === "god" ? toAct : viewer;

  return (
    <>
      <BlackjackTableScreen
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
              currentTurnId={toAct ?? state.currentTurnId}
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
