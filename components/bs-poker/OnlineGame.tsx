"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useOnlineRoom } from "@/lib/hooks/use-online-room";
import { createSession } from "@/lib/multiplayer/session";
import type { GuestStatus } from "@/lib/multiplayer/room";
import { TableScreen, type HeaderExit } from "./TableScreen";
import { NameField, rememberName, useRememberedName } from "./NameField";

const randomSeed = () => crypto.getRandomValues(new Uint32Array(1))[0];

const GUEST_MESSAGES: Partial<Record<GuestStatus, { title: string; body: string; retry?: boolean }>> = {
  connecting: { title: "Connecting…", body: "Opening the room." },
  "finding-host": { title: "Looking for the table…", body: "Waiting for the host to answer." },
  "waiting-for-seat": { title: "Found the table", body: "Taking a seat…" },
  "not-found": {
    title: "No table with that code",
    body: "Nobody is hosting this room right now. Check the code with your host, or ask them to keep the room open.",
    retry: true,
  },
  removed: { title: "You were removed from this room", body: "The host took you off the seat list." },
  closed: { title: "This room is closed", body: "The host closed the room. Ask them for a new code to play again." },
};

export default function OnlineGame({ code }: { code: string }) {
  const router = useRouter();
  const { room, transport, setSession, act, removePlayer, leave } = useOnlineRoom(code);

  const leaveAndGoBack = async () => {
    await leave();
    router.push("/bs-poker");
  };

  if (room.phase === "needs-name") {
    return <JoinFromLink code={code} onJoined={setSession} />;
  }
  if (room.phase === "connecting") {
    return <StatusScreen code={code} title="Connecting…" body="Opening the room." />;
  }
  if (room.phase === "failed") {
    return <StatusScreen code={code} title="Couldn't open the room" body={room.message} />;
  }

  const { role, me, status, view, connectedIds, error, hostName } = room;
  const isHost = role === "host";

  if (!view) {
    const msg =
      status === "rejected"
        ? { title: "Can't join this table", body: error?.message ?? "The host couldn't seat you." }
        : (GUEST_MESSAGES[status as GuestStatus] ?? { title: "Connecting…", body: "Opening the room." });
    return (
      <StatusScreen
        code={code}
        title={msg.title}
        body={status === "waiting-for-seat" && hostName ? `Found ${hostName}'s table. Taking a seat…` : msg.body}
        retry={"retry" in msg && msg.retry}
        onLeave={leaveAndGoBack}
      />
    );
  }

  if (status === "removed" || status === "closed") {
    const msg = GUEST_MESSAGES[status]!;
    return <StatusScreen code={code} title={msg.title} body={msg.body} onLeave={leaveAndGoBack} />;
  }

  const inLobby = view.phase === "lobby";
  const exit: HeaderExit = isHost
    ? inLobby
      ? { label: "Close room", confirm: "Close this room for everyone?", onExit: leaveAndGoBack }
      : {
          label: "End game",
          confirm: "End this game for everyone and go back to the lobby?",
          onExit: () => act({ type: "RETURN_TO_LOBBY", playerId: me }),
        }
    : {
        label: "Leave room",
        confirm: inLobby ? "Leave this room?" : "Leave this game? Your seat stays empty until it ends.",
        onExit: leaveAndGoBack,
      };

  const notices = [
    transport === "tabs" &&
      "Test mode: no Supabase keys, so this room only connects tabs in this browser.",
    status === "host-away" && `${hostName ?? "The host"} lost connection. The game picks up again when they're back.`,
  ].filter(Boolean) as string[];

  return (
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
        onRename: (id, name) => act({ type: "RENAME_PLAYER", playerId: id, name }),
      }}
      topBar={
        notices.length > 0 && (
          <div className="space-y-2">
            {notices.map((n) => (
              <p key={n} role="status" className="rounded-3xl border border-dashed border-ash/50 px-4 py-3 text-sm text-parchment">
                {n}
              </p>
            ))}
          </div>
        )
      }
    />
  );
}

function StatusScreen({
  code,
  title,
  body,
  retry,
  onLeave,
}: {
  code: string;
  title: string;
  body: string;
  retry?: boolean;
  onLeave?: () => void;
}) {
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
            Back to BS Poker
          </button>
        ) : (
          <Link href="/bs-poker" className="flex min-h-12 items-center rounded-full border border-bone/40 px-6 text-base font-bold text-bone hover:border-bone">
            Back to BS Poker
          </Link>
        )}
      </div>
    </main>
  );
}

/** Someone opened an invite link: ask their name, then take a seat. */
function JoinFromLink({ code, onJoined }: { code: string; onJoined: (s: Awaited<ReturnType<typeof createSession>>) => void }) {
  const [name, setName] = useRememberedName();
  const [busy, setBusy] = useState(false);
  return (
    <main className="mx-auto flex min-h-screen max-w-xl flex-col justify-center px-4 sm:px-8">
      <p className="text-base text-ash">You&apos;re invited to room</p>
      <h1 className="font-display text-7xl leading-none font-extrabold tracking-[0.12em] text-bone">{code}</h1>
      <form
        className="mt-8 space-y-4"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!name.trim()) return;
          setBusy(true);
          rememberName(name);
          onJoined(await createSession(code, name, "guest"));
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
      <Link href="/bs-poker" className="mt-6 text-base text-parchment underline underline-offset-4 hover:text-bone">
        Back to BS Poker
      </Link>
    </main>
  );
}
