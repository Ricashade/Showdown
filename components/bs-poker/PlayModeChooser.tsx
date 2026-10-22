"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createSession, getTransport, type TransportKind } from "@/lib/multiplayer/session";
import { generateRoomCode, isRoomCode, normalizeRoomCode } from "@/lib/multiplayer/room-code";
import { NameField, rememberName, useRememberedName } from "./NameField";

export default function PlayModeChooser() {
  const router = useRouter();
  const [name, setName] = useRememberedName();
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState<"create" | "join" | null>(null);
  const [transport, setTransport] = useState<TransportKind>("supabase");
  useEffect(() => setTransport(getTransport().kind), []);

  const hasName = name.trim().length > 0;
  const codeOk = isRoomCode(code);

  const go = async (kind: "create" | "join") => {
    if (!hasName || (kind === "join" && !codeOk)) return;
    setBusy(kind);
    rememberName(name);
    const roomCode = kind === "create" ? generateRoomCode() : code;
    await createSession(roomCode, name, kind === "create" ? "host" : "guest");
    router.push(`/bs-poker/room/${roomCode}`);
  };

  return (
    <main className="mx-auto max-w-5xl px-4 py-8 sm:px-8">
      <header className="flex items-center justify-between gap-3">
        <h1 className="font-display text-4xl font-extrabold text-bone">BS Poker</h1>
        <Link href="/" className="flex min-h-11 items-center px-2 text-base text-parchment underline-offset-4 hover:text-bone hover:underline">
          Main menu
        </Link>
      </header>

      <div className="mt-10 grid gap-10 lg:grid-cols-[1.2fr_1fr]">
        <section aria-labelledby="online-heading" className="felt rounded-[2rem] p-6 sm:p-9">
          <h2 id="online-heading" className="font-display text-5xl font-extrabold text-bone">
            Play online
          </h2>

          <div className="mt-7 max-w-md">
            <NameField value={name} onChange={setName} id="player-name" />
          </div>

          <div className="mt-8 grid gap-8 sm:grid-cols-2">
            <div>
              <h3 className="font-display text-2xl font-bold text-bone">Host a game</h3>
              <button
                onClick={() => go("create")}
                disabled={!hasName || busy !== null}
                className="mt-4 min-h-12 w-full rounded-full bg-brass font-display text-2xl font-bold text-smoke transition hover:bg-brass-lit disabled:opacity-40"
              >
                {busy === "create" ? "Creating…" : "Create a room"}
              </button>
            </div>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void go("join");
              }}
            >
              <h3 className="font-display text-2xl font-bold text-bone">Join a game</h3>
              <label htmlFor="room-code" className="mt-2 block text-sm text-bone">
                Room code
              </label>
              <input
                id="room-code"
                value={code}
                onChange={(e) => setCode(normalizeRoomCode(e.target.value))}
                inputMode="text"
                autoCapitalize="characters"
                autoComplete="off"
                placeholder="ABCD"
                className="mt-1.5 min-h-12 w-full rounded-2xl bg-baize-deep px-4 font-display text-3xl font-bold tracking-[0.3em] text-bone uppercase ring-1 ring-bone/30 placeholder:text-bone/40 focus-visible:outline-2 focus-visible:outline-brass-lit"
              />
              <button
                disabled={!hasName || !codeOk || busy !== null}
                className="mt-3 min-h-12 w-full rounded-full border-2 border-bone/70 font-display text-2xl font-bold text-bone transition hover:border-bone disabled:opacity-40"
              >
                {busy === "join" ? "Joining…" : "Join room"}
              </button>
            </form>
          </div>
          {!hasName && <p className="mt-6 text-sm text-bone">Enter your name first.</p>}
          {transport === "tabs" && (
            <p role="status" className="mt-6 rounded-2xl bg-baize-deep/80 px-4 py-3 text-sm text-bone">
              Test mode: no Supabase keys, so rooms only connect tabs in this browser.
            </p>
          )}
        </section>

        <section aria-labelledby="local-heading" className="self-start">
          <h2 id="local-heading" className="font-display text-4xl font-bold text-bone">
            Local simulator
          </h2>
          <Link
            href="/bs-poker/local"
            className="mt-5 inline-flex min-h-12 items-center rounded-full border border-bone/40 px-6 text-base font-bold text-bone hover:border-bone"
          >
            Open the simulator
          </Link>
        </section>
      </div>
    </main>
  );
}
