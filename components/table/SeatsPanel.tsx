"use client";

import { useEffect, useRef, useState } from "react";
import clsx from "clsx";
import { ArrowLeftRight, Bot, Check, ChevronDown, Crown, Link2, Minus, Plus, X } from "lucide-react";
import type { BotDifficulty } from "@/types/game";
import { DIFFICULTY_LABEL } from "@/lib/bot-ai";
import { ROOM_PATH } from "@/lib/games";

export interface LobbyOptions {
  /** Online rooms show their code and an invite link. */
  roomCode?: string;
  canRename: (playerId: string) => boolean;
  canRemove: (playerId: string) => boolean;
  onRemove: (playerId: string) => void;
  onRename: (playerId: string, name: string) => void;
  /** Host only: seat a bot. */
  onAddBot?: (difficulty: BotDifficulty) => void;
  /** Shared rooms: matches each player has won tonight, across games. */
  crowns?: Record<string, number>;
  /** Shared rooms: people in the room this game has no seat for. */
  sittingOut?: { id: string; name: string; isBot?: boolean; botDifficulty?: BotDifficulty }[];
  /** Shared rooms: the tables the room can split into, and who sits where. */
  tables?: TablesOption;
  /** Shared rooms: the host's name, for a table they don't sit at. */
  hostName?: string;
  /** Solo: the table holds only as many as play, so nobody (you included) ends up watching. */
  maxSeats?: number;
}

export interface TablesOption {
  list: { id: string; seats: number; players: { id: string; name: string; isBot?: boolean }[] }[];
  /** The viewer's table. */
  mine: string | null;
  /** Seats a table may have, by the game's rules. */
  min: number;
  max: number;
  /** Most tables a room can open. */
  most: number;
  onSit: (tableId: string) => void;
  /** Host only: open or close tables, and set each one's seats. */
  onSetSeats?: (seats: number[]) => void;
  /** Host only: seat anyone (a person or a bot) at a table. */
  onMove?: (playerId: string, tableId: string) => void;
  /** Why the game can't start yet (a table short of players, say), or null. */
  blocked?: string | null;
}

interface SeatsPanelProps {
  players: { id: string; name: string; isHost: boolean; isBot?: boolean; botDifficulty?: BotDifficulty }[];
  viewerId: string | null;
  hostId: string;
  isHost: boolean;
  options: LobbyOptions;
  connectedIds?: Set<string>;
  minPlayers: number;
  maxPlayers: number;
  onStart: () => void;
}

/** The lobby's seat list on felt: room code, seats in turn order, and the start button. */
export function SeatsPanel({ players, viewerId, hostId, isHost, options, connectedIds, minPlayers, maxPlayers, onStart }: SeatsPanelProps) {
  const hostName = players.find((p) => p.id === hostId)?.name ?? options.hostName ?? "The host";
  const blocked = options.tables?.blocked ?? null;
  // The host picking someone up to seat at another table.
  const [moving, setMoving] = useState<Moving | null>(null);
  const canStart = players.length >= minPlayers && !blocked;
  return (
    <section aria-labelledby="seats-heading" className="felt self-start rounded-[2rem] p-6 sm:p-8">
      {options.roomCode && <RoomCode code={options.roomCode} />}

      <h2 id="seats-heading" className="font-display text-4xl font-bold text-bone">
        Seats
      </h2>

      <ol className="mt-5 space-y-2">
        {players.map((p, i) => {
          const online = !connectedIds || connectedIds.has(p.id);
          return (
            <li key={p.id} data-seat-of={p.id} className="flex min-h-12 items-center gap-3 rounded-full bg-baize-deep/70 py-1 pr-2 pl-1.5">
              <span aria-hidden className="grid size-9 shrink-0 place-items-center rounded-full bg-leather font-display text-lg font-bold text-bone">
                {i + 1}
              </span>
              {options.canRename(p.id) && !p.isBot ? (
                <NameInput name={p.name} label={`Name for seat ${i + 1}`} onCommit={(name) => options.onRename(p.id, name)} />
              ) : (
                <span className="min-w-0 flex-1 truncate px-1.5 text-base text-bone">
                  {p.name}
                  {viewerId === p.id && <span className="ml-1.5 text-sm text-brass-lit">you</span>}
                  {p.isBot && <span className="ml-1.5 text-sm text-brass-lit">{DIFFICULTY_LABEL[p.botDifficulty ?? "medium"]} bot</span>}
                </span>
              )}
              {!online && <span className="text-sm text-bone">Reconnecting…</span>}
              <Crowns count={options.crowns?.[p.id]} />
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

      {options.tables && (options.tables.list.length > 1 || options.tables.onSetSeats) && <Tables tables={options.tables} moving={moving} onMoving={setMoving} />}

      {options.sittingOut && options.sittingOut.length > 0 && (
        <>
          <h3 className="mt-6 font-display text-2xl font-bold text-bone">Sitting out</h3>
          <ul className="mt-3 space-y-2">
            {options.sittingOut.map((p) => (
              <li key={p.id} data-seat-of={p.id} className="flex min-h-12 items-center gap-3 rounded-full border border-dashed border-bone/30 py-1 pr-2 pl-4">
                <span className="min-w-0 flex-1 truncate text-base text-bone">
                  {p.name}
                  {viewerId === p.id && <span className="ml-1.5 text-sm text-brass-lit">you</span>}
                  {p.isBot && <span className="ml-1.5 text-sm text-brass-lit">{DIFFICULTY_LABEL[p.botDifficulty ?? "medium"]} bot</span>}
                </span>
                <Crowns count={options.crowns?.[p.id]} />
                {options.tables?.onMove && (
                  <button
                    onClick={() => setMoving(moving?.id === p.id ? null : { id: p.id, name: p.name, from: null })}
                    aria-pressed={moving?.id === p.id}
                    className={clsx(
                      "flex min-h-10 items-center gap-1.5 rounded-full px-3.5 text-sm font-bold transition",
                      moving?.id === p.id ? "bg-brass text-smoke" : "border border-bone/40 text-bone hover:border-bone",
                    )}
                  >
                    <ArrowLeftRight className="size-4" aria-hidden /> Move
                  </button>
                )}
                {options.canRemove(p.id) && (
                  <button
                    onClick={() => options.onRemove(p.id)}
                    className="grid size-10 place-items-center rounded-full text-bone transition hover:bg-black/25"
                    aria-label={`Remove ${p.name}`}
                  >
                    <X className="size-4" />
                  </button>
                )}
              </li>
            ))}
          </ul>
        </>
      )}

      {options.onAddBot && (
        <div role="group" aria-label="Add a bot" className="mt-4 flex flex-wrap items-center gap-2">
          <span className="flex items-center gap-1.5 pr-1 text-sm font-bold text-bone">
            <Bot className="size-4" aria-hidden /> Add a bot
          </span>
          {(["easy", "medium", "hard"] as const).map((d) => (
            <button
              key={d}
              onClick={() => options.onAddBot!(d)}
              disabled={players.length >= Math.min(maxPlayers, options.maxSeats ?? maxPlayers)}
              aria-label={`Add ${DIFFICULTY_LABEL[d].toLowerCase()} bot`}
              className="min-h-11 rounded-full border border-bone/40 px-4 text-sm font-bold text-bone transition hover:border-bone disabled:opacity-40"
            >
              {DIFFICULTY_LABEL[d]}
            </button>
          ))}
        </div>
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
              {blocked ?? `Needs at least ${minPlayers} players.`}
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

function RoomCode({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}${ROOM_PATH}/${code}`);
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


/** Someone the host has picked up to seat at another table. */
interface Moving {
  id: string;
  name: string;
  /** Their table now, or null if they're sitting out. */
  from: string | null;
}

/**
 * The tables a room splits into: who sits at each (opened underneath), a seat to take at one with
 * room, and for the host, how many tables and seats, and moving anyone: pick them up (click or
 * drag their name), then put them down at another table.
 */
function Tables({ tables: t, moving, onMoving }: { tables: TablesOption; moving: Moving | null; onMoving: (m: Moving | null) => void }) {
  const [open, setOpen] = useState<string | null>(null);
  const [over, setOver] = useState<string | null>(null);
  const seats = t.list.map((x) => x.seats);
  const set = (i: number, n: number) => t.onSetSeats?.(seats.map((v, j) => (j === i ? n : v)));
  const step = "grid size-9 place-items-center rounded-full text-bone transition hover:bg-black/25 disabled:opacity-35";
  const takes = (table: TablesOption["list"][number]) => !!moving && moving.from !== table.id && table.players.length < table.seats;
  const place = (tableId: string) => {
    if (moving) t.onMove?.(moving.id, tableId);
    onMoving(null);
    setOver(null);
  };

  useEffect(() => {
    if (!moving) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onMoving(null);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [moving, onMoving]);

  return (
    <div className="mt-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-display text-2xl font-bold text-bone">Tables</h3>
        {t.onSetSeats && t.list.length < t.most && (
          <button
            onClick={() => t.onSetSeats!([...seats, t.max])}
            className="flex min-h-11 items-center gap-1.5 rounded-full border border-bone/40 px-4 text-sm font-bold text-bone transition hover:border-bone"
          >
            <Plus className="size-4" aria-hidden /> Add a table
          </button>
        )}
      </div>

      {moving && (
        <div role="status" className="mt-3 flex items-center justify-between gap-3 rounded-2xl bg-brass/15 py-1.5 pr-1.5 pl-4 text-sm text-bone ring-1 ring-brass/60">
          <span className="flex min-w-0 items-center gap-2">
            <ArrowLeftRight className="size-4 shrink-0 text-brass-lit" aria-hidden />
            <span className="truncate">
              Moving <span className="font-bold">{moving.name}</span> · pick a table
            </span>
          </span>
          <button onClick={() => onMoving(null)} className="min-h-9 shrink-0 rounded-full px-3 font-bold text-bone hover:bg-black/25">
            Cancel
          </button>
        </div>
      )}

      <ul className="mt-3 space-y-2">
        {t.list.map((table, i) => {
          const full = table.players.length >= table.seats;
          const label = `Table ${i + 1}`;
          const target = takes(table);
          return (
            <li
              key={table.id}
              onDragOver={(e) => {
                if (!target) return;
                e.preventDefault();
                setOver(table.id);
              }}
              onDragLeave={() => setOver((o) => (o === table.id ? null : o))}
              onDrop={(e) => {
                e.preventDefault();
                if (target) place(table.id);
              }}
              className={clsx("rounded-3xl bg-baize-deep/70 py-1.5 pr-2 pl-2 transition", over === table.id && target && "ring-2 ring-brass-lit")}
            >
              <div className="flex min-h-9 flex-wrap items-center gap-x-3 gap-y-1">
                {/* Who's at the table opens underneath, so long names never get cut off. */}
                <button
                  onClick={() => setOpen((o) => (o === table.id ? null : table.id))}
                  aria-expanded={open === table.id}
                  aria-controls={`${table.id}-who`}
                  className="flex min-h-10 flex-1 items-center gap-3 rounded-full pr-2 pl-2 text-left transition hover:bg-black/15"
                >
                  <span className="font-display text-lg font-bold text-bone">{label}</span>
                  <span className="text-sm text-parchment tabular-nums">
                    {table.players.length} of {table.seats}
                  </span>
                  <ChevronDown aria-hidden className={clsx("ml-auto size-4 text-bone transition", open === table.id && "rotate-180")} />
                </button>
                {t.onSetSeats && !moving && (
                  <span role="group" aria-label={`Seats at ${label.toLowerCase()}`} className="flex items-center">
                    <button onClick={() => set(i, table.seats - 1)} disabled={table.seats <= t.min} aria-label={`Fewer seats at ${label.toLowerCase()}`} className={step}>
                      <Minus className="size-4" />
                    </button>
                    <button onClick={() => set(i, table.seats + 1)} disabled={table.seats >= t.max} aria-label={`More seats at ${label.toLowerCase()}`} className={step}>
                      <Plus className="size-4" />
                    </button>
                  </span>
                )}
                {moving ? (
                  moving.from === table.id ? (
                    <span className="pr-2 text-sm text-parchment">Here now</span>
                  ) : (
                    <button
                      onClick={() => place(table.id)}
                      disabled={full}
                      className="min-h-10 rounded-full bg-brass px-4 text-sm font-bold text-smoke transition hover:bg-brass-lit disabled:opacity-40"
                    >
                      {full ? "Full" : "Move here"}
                    </button>
                  )
                ) : t.mine === table.id ? (
                  <span className="pr-2 text-sm text-brass-lit">You&apos;re here</span>
                ) : (
                  <button
                    onClick={() => t.onSit(table.id)}
                    disabled={full}
                    className="min-h-10 rounded-full border border-bone/40 px-4 text-sm font-bold text-bone transition hover:border-bone disabled:opacity-40"
                  >
                    {full ? "Full" : "Sit here"}
                  </button>
                )}
                {t.onSetSeats && !moving && t.list.length > 1 && i === t.list.length - 1 && (
                  <button onClick={() => t.onSetSeats!(seats.slice(0, -1))} aria-label={`Close ${label.toLowerCase()}`} className={step}>
                    <X className="size-4" />
                  </button>
                )}
              </div>
              {open === table.id && (
                <ul id={`${table.id}-who`} aria-label={`At ${label.toLowerCase()}`} className="mt-1.5 mb-1 flex flex-wrap gap-1.5 px-2">
                  {table.players.length === 0 ? (
                    <li className="px-1 text-sm text-parchment">No one yet</li>
                  ) : (
                    table.players.map((p) => {
                      const picked = moving?.id === p.id;
                      const chip = clsx(
                        "flex min-h-9 items-center gap-1.5 rounded-full px-3 text-sm transition",
                        picked ? "bg-brass font-bold text-smoke ring-2 ring-brass-lit" : "bg-black/25 text-bone",
                      );
                      const body = (
                        <>
                          {p.isBot && <Bot className={clsx("size-3.5", picked ? "text-smoke/75" : "text-brass-lit")} aria-label="Bot" />}
                          {p.name}
                        </>
                      );
                      return (
                        <li key={p.id}>
                          {t.onMove ? (
                            <button
                              draggable
                              onDragStart={(e) => {
                                e.dataTransfer.effectAllowed = "move";
                                e.dataTransfer.setData("text/plain", p.id);
                                onMoving({ id: p.id, name: p.name, from: table.id });
                              }}
                              onDragEnd={() => setOver(null)}
                              onClick={() => onMoving(picked ? null : { id: p.id, name: p.name, from: table.id })}
                              aria-pressed={picked}
                              aria-label={`Move ${p.name}`}
                              title="Click or drag to another table"
                              className={clsx(chip, "cursor-grab active:cursor-grabbing", !picked && "hover:bg-black/40 hover:ring-1 hover:ring-brass")}
                            >
                              {body}
                            </button>
                          ) : (
                            <span className={chip}>{body}</span>
                          )}
                        </li>
                      );
                    })
                  )}
                </ul>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/**
 * Your name, edited in place: it's saved when you press Enter or click away (Escape puts the old
 * one back), not as each letter is typed.
 */
function NameInput({ name, label, onCommit }: { name: string; label: string; onCommit: (name: string) => void }) {
  const [draft, setDraft] = useState(name);
  const editing = useRef(false);
  const cancelled = useRef(false);
  // Someone else's change (or your own, saved) shows once you're not mid-edit.
  useEffect(() => {
    if (!editing.current) setDraft(name);
  }, [name]);
  const commit = () => {
    editing.current = false;
    const next = draft.trim();
    if (cancelled.current || !next || next === name) setDraft(name);
    else onCommit(next);
    cancelled.current = false;
  };
  return (
    <input
      value={draft}
      maxLength={20}
      onFocus={() => (editing.current = true)}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") e.currentTarget.blur();
        if (e.key === "Escape") {
          cancelled.current = true;
          e.currentTarget.blur();
        }
      }}
      enterKeyHint="done"
      className="min-w-0 flex-1 rounded-md bg-transparent px-1.5 py-1.5 text-base text-bone outline-none focus-visible:bg-black/20 focus-visible:outline-2 focus-visible:outline-brass-lit"
      aria-label={label}
    />
  );
}

/** Matches won tonight, shown once there's at least one. */
function Crowns({ count }: { count?: number }) {
  if (!count) return null;
  return (
    <span className="flex items-center gap-1 pr-1 font-display text-lg font-bold text-brass-lit tabular-nums" aria-label={`${count} ${count === 1 ? "win" : "wins"} tonight`}>
      <Crown className="size-4" aria-hidden />
      {count}
    </span>
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
