"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { BookOpen, Shuffle } from "lucide-react";
import type { ActiveGameAction, PartyAction } from "@/types/party";
import { createParty, partyBots, partyClock, partyGame, type PartyView } from "@/lib/party-engine";
import { GAMES, ROOM, type GameId } from "@/lib/games";
import { OnlineRoomShell, type ReadyRoom } from "@/components/online/OnlineRoomShell";
import { Notices, Toast } from "@/components/table/chrome";
import type { LobbyOptions } from "@/components/table/SeatsPanel";
import { TableScreen } from "@/components/bs-poker/TableScreen";
import { HoldemTableScreen } from "@/components/holdem/HoldemTableScreen";
import { BlackjackTableScreen } from "@/components/blackjack/BlackjackTableScreen";
import { GarbageTableScreen } from "@/components/garbage/GarbageTableScreen";
import { RummyTableScreen } from "@/components/rummy/RummyTableScreen";
import { WarTableScreen } from "@/components/war/WarTableScreen";
import { GoFishTableScreen } from "@/components/gofish/GoFishTableScreen";
import { GamePicker } from "./GamePicker";
import { PostGameActions } from "./PostGameActions";
import { HOW_TO } from "./how-to";

const randomSeed = () => crypto.getRandomValues(new Uint32Array(1))[0];

/** One room code for the night: the host switches games and nobody reconnects. */
export default function OnlineParty({ code, initialGame }: { code: string; initialGame?: GameId }) {
  const createState = useCallback((host: { id: string; name: string }) => createParty({ roomCode: code, host, game: initialGame }), [code, initialGame]);
  return (
    <OnlineRoomShell
      info={ROOM}
      game={partyGame}
      bots={partyBots}
      clock={partyClock}
      code={code}
      createState={createState}
      returnToLobby={(playerId) => ({ type: "RETURN_TO_LOBBY" as const, playerId })}
    >
      {(room) => <PartyScreen code={code} room={room} />}
    </OnlineRoomShell>
  );
}

function PartyScreen({ code, room }: { code: string; room: ReadyRoom<PartyView, PartyAction> }) {
  const { view, me, isHost, act, removePlayer, addBot, connectedIds, error, exit, notices } = room;
  const [dialog, setDialog] = useState<"picker" | "howto" | null>(null);
  const [switched, setSwitched] = useState<{ message: string; id: number } | null>(null);
  const hostName = view.players.find((p) => p.id === view.hostId)?.name ?? "The host";
  const game = view.activeGameView;

  // Tell everyone else when the host puts another game on.
  const shownGame = useRef(view.selectedGame);
  useEffect(() => {
    if (shownGame.current === view.selectedGame) return;
    shownGame.current = view.selectedGame;
    setDialog((d) => (d === "howto" ? null : d));
    if (!isHost) setSwitched({ message: `${hostName} switched the room to ${GAMES[view.selectedGame].title}`, id: Date.now() });
  }, [view.selectedGame, isHost, hostName]);

  const onAction = (move: ActiveGameAction) => act({ type: "GAME", playerId: "playerId" in move ? move.playerId : me, action: move });
  const pick = (id: GameId) => {
    setDialog(null);
    // Picking the game that's already set up in the lobby changes nothing.
    if (id !== view.selectedGame || view.phase !== "lobby") act({ type: "SWITCH_GAME", playerId: me, newGameType: id });
  };

  const sittingOut = view.players.filter((p) => !view.seatedIds.includes(p.id));
  const lobby: LobbyOptions = {
    roomCode: code,
    canRename: (id) => id === me,
    canRemove: (id) => isHost && id !== me,
    onRemove: removePlayer,
    onAddBot: isHost ? addBot : undefined,
    onRename: (id, name) => onAction({ type: "RENAME_PLAYER", playerId: id, name }),
    crowns: Object.fromEntries(view.players.map((p) => [p.id, p.sessionWins])),
    sittingOut,
  };

  const chip = "flex min-h-11 items-center gap-2 rounded-full border border-bone/40 px-4 text-sm font-bold text-bone transition hover:border-bone";
  const headerExtra = view.phase === "lobby" && (
    <>
      {isHost ? (
        <button onClick={() => setDialog("picker")} className={chip}>
          <Shuffle className="size-4" aria-hidden /> Change game
        </button>
      ) : (
        <span className="text-sm text-ash">{hostName} picks the game</span>
      )}
      <button onClick={() => setDialog("howto")} className={chip}>
        <BookOpen className="size-4" aria-hidden /> Rules &amp; demo
      </button>
    </>
  );

  const postGameActions = (
    <PostGameActions
      isHost={isHost}
      hostName={hostName}
      onPlayAgain={() => act({ type: "PLAY_AGAIN", playerId: me, seed: randomSeed() })}
      onLobby={() => act({ type: "RETURN_TO_LOBBY", playerId: me })}
      onSwitch={() => setDialog("picker")}
      onLeave={exit.onExit}
    />
  );

  const watching = view.phase !== "lobby" && !view.seatedIds.includes(me);
  const topItems = [...notices, ...(watching ? ["You're sitting this one out."] : [])];
  const topBar = topItems.length > 0 && <Notices items={topItems} />;

  const common = {
    actingId: me,
    isHost,
    onAction,
    onStartGame: () => onAction({ type: "START_GAME", playerId: me, seed: randomSeed() }),
    exit,
    connectedIds,
    error,
    lobby,
    topBar,
    headerExtra,
    postGameActions,
  };
  const HowTo = HOW_TO[view.selectedGame];

  return (
    <>
      {game.mode === "bs-poker" ? (
        <TableScreen view={game} canDealNextRound={isHost} {...common} />
      ) : game.mode === "texas-holdem" ? (
        <HoldemTableScreen view={game} {...common} />
      ) : game.mode === "blackjack" ? (
        <BlackjackTableScreen view={game} {...common} />
      ) : game.mode === "garbage" ? (
        <GarbageTableScreen view={game} {...common} />
      ) : game.mode === "rummy" ? (
        <RummyTableScreen view={game} {...common} />
      ) : game.mode === "go-fish" ? (
        <GoFishTableScreen view={game} {...common} />
      ) : (
        <WarTableScreen view={game} controlIds={game.sides?.some((x) => x.id === me) ? [me] : []} {...common} />
      )}

      {dialog === "picker" && <GamePicker current={view.selectedGame} people={view.players.length} onPick={pick} onClose={() => setDialog(null)} />}
      {dialog === "howto" && <HowTo onClose={() => setDialog(null)} />}
      <Toast error={switched} />
    </>
  );
}
