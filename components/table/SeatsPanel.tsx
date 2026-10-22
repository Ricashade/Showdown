"use client";

import { useState } from "react";
import { Check, Link2, UserPlus, X } from "lucide-react";

export interface LobbyOptions {
  /** Online rooms show their code and an invite link. */
  roomCode?: string;
  canRename: (playerId: string) => boolean;
  canRemove: (playerId: string) => boolean;
  onRemove: (playerId: string) => void;
  onRename: (playerId: string, name: string) => void;
  /** Local simulator only: add another seat on this screen. */
  onAddPlayer?: () => void;
}

interface SeatsPanelProps {
  players: { id: string; name: string; isHost: boolean }[];
  viewerId: string | null;
  hostId: string;
  isHost: boolean;
  options: LobbyOptions;
  connectedIds?: Set<string>;
  minPlayers: number;
  maxPlayers: number;
  /** Path of this game's room pages, for the invite link. */
  roomPath: string;
  onStart: () => void;
}

/** The lobby's seat list on felt: room code, seats in turn order, and the start button. */
export function SeatsPanel({ players, viewerId, hostId, isHost, options, connectedIds, minPlayers, maxPlayers, roomPath, onStart }: SeatsPanelProps) {
  const hostName = players.find((p) => p.id === hostId)?.name ?? "The host";
  const canStart = players.length >= minPlayers;
  return (
    <section aria-labelledby="seats-heading" className="felt self-start rounded-[2rem] p-6 sm:p-8">
      {options.roomCode && <RoomCode code={options.roomCode} roomPath={roomPath} />}

      <h2 id="seats-heading" className="font-display text-4xl font-bold text-bone">
        Seats
      </h2>

      <ol className="mt-5 space-y-2">
        {players.map((p, i) => {
          const online = !connectedIds || connectedIds.has(p.id);
          return (
            <li key={p.id} className="flex min-h-12 items-center gap-3 rounded-full bg-baize-deep/70 py-1 pr-2 pl-1.5">
              <span aria-hidden className="grid size-9 shrink-0 place-items-center rounded-full bg-leather font-display text-lg font-bold text-bone">
                {i + 1}
              </span>
              {options.canRename(p.id) ? (
                <input
                  value={p.name}
                  onChange={(e) => options.onRename(p.id, e.target.value)}
                  className="min-w-0 flex-1 rounded-md bg-transparent px-1.5 py-1.5 text-base text-bone outline-none focus-visible:bg-black/20 focus-visible:outline-2 focus-visible:outline-brass-lit"
                  aria-label={`Name for seat ${i + 1}`}
                />
              ) : (
                <span className="min-w-0 flex-1 truncate px-1.5 text-base text-bone">
                  {p.name}
                  {viewerId === p.id && <span className="ml-1.5 text-sm text-brass-lit">you</span>}
                </span>
              )}
              {!online && <span className="text-sm text-bone">Reconnecting…</span>}
              {p.isHost ? (
                <span className="pr-3 text-sm text-brass-lit">Host</span>
              ) : options.canRemove(p.id) ? (
                <button
                  onClick={() => options.onRemove(p.id)}
                  className="grid size-10 place-items-center rounded-full text-bone transition hover:bg-black/25"
                  aria-label={`Remove ${p.name || `seat ${i + 1}`}`}
                >
                  <X className="size-4" />
                </button>
              ) : null}
            </li>
          );
        })}
      </ol>

      {options.onAddPlayer && (
        <button
          onClick={options.onAddPlayer}
          disabled={players.length >= maxPlayers}
          className="mt-4 flex min-h-11 items-center gap-2 rounded-full border border-bone/40 px-4 text-sm font-bold text-bone transition hover:border-bone disabled:opacity-40"
        >
          <UserPlus className="size-4" /> Add a player
        </button>
      )}

      {isHost ? (
        <>
          <button
            onClick={onStart}
            disabled={!canStart}
            aria-describedby={canStart ? undefined : "start-note"}
            className="mt-8 min-h-14 w-full rounded-full bg-brass font-display text-2xl font-bold text-smoke shadow-lg transition hover:bg-brass-lit disabled:opacity-40"
          >
            Start game
          </button>
          {!canStart && (
            <p id="start-note" className="mt-2 text-center text-sm text-bone">
              Needs at least {minPlayers} players.
            </p>
          )}
        </>
      ) : (
        <p className="mt-8 rounded-full bg-baize-deep/70 px-5 py-4 text-center text-base text-bone">
          Waiting for {hostName} to start the game.
        </p>
      )}
    </section>
  );
}

function RoomCode({ code, roomPath }: { code: string; roomPath: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}${roomPath}/${code}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard blocked: the code is on screen to read out instead.
    }
  };
  return (
    <div className="mb-7 flex flex-wrap items-end justify-between gap-3 border-b border-baize-deep pb-6">
      <div>
        <p className="text-sm text-bone">Room code</p>
        <p className="font-display text-6xl leading-none font-extrabold tracking-[0.12em] text-bone" aria-label={`Room code ${code.split("").join(" ")}`}>
          {code}
        </p>
      </div>
      <button
        onClick={copy}
        className="flex min-h-11 items-center gap-2 rounded-full border border-bone/40 px-4 text-sm font-bold text-bone transition hover:border-bone"
      >
        {copied ? <Check className="size-4" /> : <Link2 className="size-4" />}
        <span aria-live="polite">{copied ? "Link copied" : "Copy invite link"}</span>
      </button>
    </div>
  );
}


/** A titled group of house-rule controls. */
export function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <fieldset className="space-y-4 py-6">
      <legend className="font-display text-2xl font-bold text-bone">{title}</legend>
      {children}
    </fieldset>
  );
}
