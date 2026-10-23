"use client";

import { useCallback } from "react";
import { createHoldemRoom, holdemGame } from "@/lib/holdem-game";
import { TEXAS_HOLDEM } from "@/lib/games";
import { OnlineRoomShell } from "@/components/online/OnlineRoomShell";
import { holdemBots } from "@/lib/bot-ai";
import { Notices } from "@/components/table/chrome";
import { HoldemTableScreen } from "./HoldemTableScreen";

const randomSeed = () => crypto.getRandomValues(new Uint32Array(1))[0];

export default function OnlineHoldem({ code }: { code: string }) {
  const createState = useCallback((host: { id: string; name: string }) => createHoldemRoom({ roomId: code, host }), [code]);
  return (
    <OnlineRoomShell
      info={TEXAS_HOLDEM}
      game={holdemGame}
      bots={holdemBots}
      code={code}
      createState={createState}
      returnToLobby={(playerId) => ({ type: "RETURN_TO_LOBBY" as const, playerId })}
    >
      {({ view, me, isHost, act, removePlayer, addBot, connectedIds, error, exit, notices }) => (
        <HoldemTableScreen
          view={view}
          actingId={me}
          isHost={isHost}
          onAction={act}
          onStartGame={() => act({ type: "START_GAME", playerId: me, seed: randomSeed() })}
          exit={exit}
          connectedIds={connectedIds}
          error={error}
          lobby={{
            roomCode: code,
            canRename: (id) => id === me,
            canRemove: (id) => isHost && id !== me,
            onRemove: removePlayer,
            onAddBot: isHost ? addBot : undefined,
            onRename: (id, name) => act({ type: "RENAME_PLAYER", playerId: id, name }),
          }}
          topBar={notices.length > 0 && <Notices items={notices} />}
        />
      )}
    </OnlineRoomShell>
  );
}
