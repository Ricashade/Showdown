"use client";

import { useState } from "react";
import type { GameInfo } from "@/lib/games";
import { useOnlineRoom } from "@/lib/hooks/use-online-room";
import { createSession, type RoomSession } from "@/lib/multiplayer/session";
import type { GameDefinition, GuestStatus, RoomAction, RoomState } from "@/lib/multiplayer/room";
import type { BotDifficulty } from "@/types/game";
import { newBot, type BotRunner } from "@/lib/bot-ai";
import { useBotDriver } from "@/lib/hooks/use-bot-driver";
import { useTableClock, type TableClock } from "@/lib/hooks/use-table-clock";
import type { HeaderExit } from "@/components/table/chrome";
import { NameField, rememberName, useRememberedName } from "@/components/bs-poker/NameField";
import { RoomLink, useRoomTransition } from "@/components/ui/RoomTransition";

const GUEST_MESSAGES: Partial<Record<GuestStatus, { title: string; body: string; retry?: boolean }>> = {
  connecting: { title: "Connecting…", body: "Opening the room." },
  "finding-host": { title: "Looking for the table…", body: "Waiting for the host to answer." },
  "waiting-for-seat": { title: "Found the table", body: "Taking a seat…" },
  "not-found": {
    title: "No table with that code",
    body: "Nobody is hosting this room right now. Check the code with your host.",
    retry: true,
  },
  removed: { title: "You were removed from this room", body: "The host took you off the seat list." },
  closed: { title: "This room is closed", body: "Ask the host for a new code to play again." },
};

export interface ReadyRoom<V, A> {
  view: V;
  me: string;
  isHost: boolean;
  act: (action: A) => void;
  removePlayer: (playerId: string) => void;
  /** Host only: seat a bot. */
  addBot: (difficulty: BotDifficulty) => void;
  connectedIds: Set<string>;
  error: { message: string; id: number } | null;
  /** The header's way out, right for this player and phase. */
  exit: HeaderExit;
  notices: string[];
}

interface ShellProps<S extends RoomState & { version: number }, A extends RoomAction, V extends { phase: string }> {
  info: GameInfo;
  game: GameDefinition<S, A, V>;
  bots: BotRunner<S, A>;
  /** Timers a self-running table needs (Blackjack's dealer), run by the host. */
  clock?: TableClock<S, A>;
  code: string;
  createState: (host: { id: string; name: string }) => S;
  returnToLobby: (hostId: string) => A;
  children: (room: ReadyRoom<V, A>) => React.ReactNode;
}

/** Everything an online room needs around the table: joining, connection states, leaving. */
export function OnlineRoomShell<S extends RoomState & { version: number }, A extends RoomAction, V extends { phase: string }>({
  info,
  game,
  bots,
  clock,
  code,
  createState,
  returnToLobby,
  children,
}: ShellProps<S, A, V>) {
  const rooms = useRoomTransition();
  const roomKey = info.roomKey(code);
  const { room, transport, setSession, act, removePlayer, leave } = useOnlineRoom(game, { roomKey, code, createState });
  // Bots are played by the host's tab only, from the full state it holds.
  const hostState = room.phase === "ready" ? room.hostState : null;
  useBotDriver(hostState, bots, act);
  useTableClock(hostState, clock, act);

  const leaveAndGoBack = async () => {
    await rooms.go(info.path, { ready: leave() });
  };

  if (room.phase === "needs-name") {
    return <JoinFromLink info={info} code={code} onJoined={setSession} />;
  }
  if (room.phase === "connecting") return <StatusScreen info={info} code={code} title="Connecting…" body="Opening the room." />;
  if (room.phase === "failed") return <StatusScreen info={info} code={code} title="Couldn't open the room" body={room.message} />;

  const { role, me, status, view, connectedIds, error, hostName } = room;
  const isHost = role === "host";

  if (!view || status === "removed" || status === "closed") {
    const msg =
      status === "rejected"
        ? { title: "Can't join this table", body: error?.message ?? "The host couldn't seat you." }
        : (GUEST_MESSAGES[status as GuestStatus] ?? { title: "Connecting…", body: "Opening the room." });
    return (
      <StatusScreen
        info={info}
        code={code}
        title={msg.title}
        body={status === "waiting-for-seat" && hostName ? `Found ${hostName}'s table. Taking a seat…` : msg.body}
        retry={"retry" in msg && msg.retry}
        onLeave={leaveAndGoBack}
      />
    );
  }

  const inLobby = view.phase === "lobby";
  const exit: HeaderExit = isHost
    ? inLobby
      ? { label: "Close room", confirm: "Close this room for everyone?", onExit: leaveAndGoBack }
      : { label: "End match", confirm: "End this match and go back to the lobby?", onExit: () => act(returnToLobby(me)) }
    : { label: "Leave room", confirm: inLobby ? "Leave this room?" : "Leave this game?", onExit: leaveAndGoBack };

  const notices = [
    transport === "tabs" && "Test mode: no Supabase keys, so this room only connects tabs in this browser.",
    status === "host-away" && `${hostName ?? "The host"} lost connection.`,
  ].filter(Boolean) as string[];

  const addBot = (difficulty: BotDifficulty) => {
    const names = hostState?.players.map((p) => (p as { name?: string }).name ?? "") ?? [];
    act(game.join(newBot(difficulty, names)));
  };

  return <>{children({ view, me, isHost, act, removePlayer, addBot, connectedIds, error, exit, notices })}</>;
}

function StatusScreen({
  info,
  code,
  title,
  body,
  retry,
  onLeave,
}: {
  info: GameInfo;
  code: string;
  title: string;
  body: string;
  retry?: boolean;
  onLeave?: () => void;
}) {
  const back = info.path === "/" ? "Main menu" : `Back to ${info.title}`;
  return (
    <main className="mx-auto flex min-h-screen max-w-xl flex-col justify-center px-4 sm:px-8">
      <p className="text-base text-ash">Room {code}</p>
      <h1 className="mt-1 font-display text-5xl font-extrabold text-bone" aria-live="polite">
        {title}
      </h1>
      <p className="mt-3 text-lg text-parchment">{body}</p>
      <div className="mt-8 flex flex-wrap gap-3">
        {retry && (
          <button
            onClick={() => window.location.reload()}
            className="min-h-12 rounded-full bg-brass px-6 font-display text-xl font-bold text-smoke hover:bg-brass-lit"
          >
            Try again
          </button>
        )}
        {onLeave ? (
          <button onClick={onLeave} className="min-h-12 rounded-full border border-bone/40 px-6 text-base font-bold text-bone hover:border-bone">
            {back}
          </button>
        ) : (
          <RoomLink href={info.path} className="flex min-h-12 items-center rounded-full border border-bone/40 px-6 text-base font-bold text-bone hover:border-bone">
            {back}
          </RoomLink>
        )}
      </div>
    </main>
  );
}

/** Someone opened an invite link: ask their name, then take a seat. */
function JoinFromLink({ info, code, onJoined }: { info: GameInfo; code: string; onJoined: (s: RoomSession) => void }) {
  const [name, setName] = useRememberedName();
  const [busy, setBusy] = useState(false);
  return (
    <main className="mx-auto flex min-h-screen max-w-xl flex-col justify-center px-4 sm:px-8">
      <p className="text-base text-ash">Room</p>
      <h1 className="font-display text-7xl leading-none font-extrabold tracking-[0.12em] text-bone">{code}</h1>
      <form
        className="mt-8 space-y-4"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!name.trim()) return;
          setBusy(true);
          rememberName(name);
          onJoined(await createSession(info.roomKey(code), code, name, "guest"));
        }}
      >
        <NameField value={name} onChange={setName} id="join-link-name" />
        <button
          disabled={!name.trim() || busy}
          className="min-h-12 w-full rounded-full bg-brass font-display text-2xl font-bold text-smoke hover:bg-brass-lit disabled:opacity-40"
        >
          Take a seat
        </button>
      </form>
      <RoomLink href={info.path} className="mt-6 text-base text-parchment underline underline-offset-4 hover:text-bone">
        {info.path === "/" ? "Main menu" : `Back to ${info.title}`}
      </RoomLink>
    </main>
  );
}
