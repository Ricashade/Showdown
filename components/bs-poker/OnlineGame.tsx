"use client";

import { useCallback } from "react";
import { bsPokerGame, createRoom } from "@/lib/bs-poker-game";
import { BS_POKER } from "@/lib/games";
import { OnlineRoomShell } from "@/components/online/OnlineRoomShell";
import { bsPokerBots } from "@/lib/bot-ai";
import { Notices } from "@/components/table/chrome";
import { TableScreen } from "./TableScreen";

const randomSeed = () => crypto.getRandomValues(new Uint32Array(1))[0];

export default function OnlineGame({ code }: { code: string }) {
  const createState = useCallback(
    (host: { id: string; name: string }) => createRoom({ roomId: code, host }),
    [code],
  );
  return (
    <OnlineRoomShell
      info={BS_POKER}
      game={bsPokerGame}
      bots={bsPokerBots}
      code={code}
      createState={createState}
      returnToLobby={(playerId) => ({ type: "RETURN_TO_LOBBY" as const, playerId })}
    >
      {({ view, me, isHost, act, removePlayer, addBot, connectedIds, error, exit, notices }) => (
        <TableScreen
          view={view}
          actingId={me}
          isHost={isHost}
          onAction={act}
          onStartGame={() => act({ type: "START_GAME", playerId: me, seed: randomSeed() })}
          exit={exit}
          connectedIds={connectedIds}
          error={error}
          canDealNextRound={isHost}
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
