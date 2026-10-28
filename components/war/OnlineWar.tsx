"use client";

import { useCallback } from "react";
import { createWarRoom, warGame } from "@/lib/war-engine";
import { WAR } from "@/lib/games";
import { OnlineRoomShell } from "@/components/online/OnlineRoomShell";
import { warBots } from "@/lib/bot-ai";
import { Notices } from "@/components/table/chrome";
import { WarTableScreen } from "./WarTableScreen";

const randomSeed = () => crypto.getRandomValues(new Uint32Array(1))[0];

export default function OnlineWar({ code }: { code: string }) {
  const createState = useCallback((host: { id: string; name: string }) => createWarRoom({ roomId: code, host }), [code]);
  return (
    <OnlineRoomShell
      info={WAR}
      game={warGame}
      bots={warBots}
      code={code}
      createState={createState}
      returnToLobby={(playerId) => ({ type: "RETURN_TO_LOBBY" as const, playerId })}
    >
      {({ view, me, isHost, act, removePlayer, addBot, connectedIds, error, exit, notices }) => (
        <WarTableScreen
          view={view}
          controlIds={view.sides?.some((x) => x.id === me) ? [me] : []}
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
