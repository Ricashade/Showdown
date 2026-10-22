"use client";

import { useState } from "react";
import clsx from "clsx";
import { Check, Link2, UserPlus, X } from "lucide-react";
import type { BsPokerSettings, HandRuleMode, RestrictableHand } from "@/types/bs-poker";
import { MAX_PLAYERS, MIN_PLAYERS, maxCardsCap, type BsPokerView } from "@/lib/bs-poker-game";
import { HAND_TYPE_PLURAL, RESTRICTABLE_HANDS } from "@/lib/bs-poker-engine";
import { Segmented, Stepper, Toggle } from "@/components/ui/controls";

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

interface LobbyProps {
  view: BsPokerView;
  isHost: boolean;
  options: LobbyOptions;
  connectedIds?: Set<string>;
  onUpdateSettings: (patch: Partial<BsPokerSettings>) => void;
  onStart: () => void;
}

export function Lobby({ view, isHost, options, connectedIds, onUpdateSettings, onStart }: LobbyProps) {
  const { settings, players, hostId } = view;
  const hostName = players.find((p) => p.id === hostId)?.name ?? "The host";
  const handCap = maxCardsCap(settings.includeJokers, players.length);
  const canStart = players.length >= MIN_PLAYERS;
  const set = onUpdateSettings;
  const locked = !isHost;

  const setRule = (type: RestrictableHand, patch: Partial<{ mode: HandRuleMode; threshold: number }>) =>
    set({ handRules: { ...settings.handRules, [type]: { ...settings.handRules[type], ...patch } } });

  return (
    <div className="mx-auto grid max-w-6xl gap-x-14 gap-y-10 px-4 py-8 sm:px-8 lg:grid-cols-[1fr_1fr]">
      {/* Seats sit on the table itself. */}
      <section aria-labelledby="seats-heading" className="felt self-start rounded-[2rem] p-6 sm:p-8">
        {options.roomCode && <RoomCode code={options.roomCode} />}

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
                    {view.viewerId === p.id && <span className="ml-1.5 text-sm text-brass-lit">you</span>}
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
            disabled={players.length >= MAX_PLAYERS}
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
                Needs at least {MIN_PLAYERS} players.
              </p>
            )}
          </>
        ) : (
          <p className="mt-8 rounded-full bg-baize-deep/70 px-5 py-4 text-center text-base text-bone">
            Waiting for {hostName} to start the game.
          </p>
        )}
      </section>

      {/* House rules sit in the room, off the table. */}
      <section aria-labelledby="rules-heading">
        <h2 id="rules-heading" className="font-display text-4xl font-bold text-bone">
          House rules
        </h2>
        {locked && <p className="mt-1 text-sm text-ash">Only {hostName} can change these.</p>}

        <div className="mt-6 divide-y divide-leather-lit border-y border-leather-lit">
          <Group title="Wild cards">
            <Toggle
              label="Deuces are wild"
              checked={settings.deucesWild}
              onChange={(v) => set({ deucesWild: v })}
              disabled={locked}
            />
            <Toggle
              label="Add two Jokers"
              checked={settings.includeJokers}
              onChange={(v) => set({ includeJokers: v })}
              disabled={locked}
            />
          </Group>

          <Group title="Hands">
            {RESTRICTABLE_HANDS.map((type) => (
              <HandRuleRow
                key={type}
                type={type}
                rule={settings.handRules[type]}
                maxCards={settings.maxCards}
                locked={locked}
                onChange={(patch) => setRule(type, patch)}
              />
            ))}
          </Group>

          <Group title="Hand sizes">
            <Stepper
              label="Starting cards"
              value={settings.startingCards}
              min={1}
              max={settings.maxCards}
              onChange={(v) => set({ startingCards: v })}
              disabled={locked}
            />
            <Stepper
              label="Maximum cards"
              value={settings.maxCards}
              min={Math.max(1, settings.startingCards)}
              max={handCap}
              onChange={(v) => set({ maxCards: v })}
              disabled={locked}
            />
          </Group>
        </div>

      </section>
    </div>
  );
}

function RoomCode({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/bs-poker/room/${code}`);
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

const RULE_OPTIONS: { value: HandRuleMode; label: string }[] = [
  { value: "enabled", label: "Allowed" },
  { value: "disabled", label: "Banned" },
  { value: "threshold", label: "Until a hand size" },
];

function HandRuleRow({
  type,
  rule,
  maxCards,
  locked,
  onChange,
}: {
  type: RestrictableHand;
  rule: BsPokerSettings["handRules"][RestrictableHand];
  maxCards: number;
  locked: boolean;
  onChange: (patch: Partial<{ mode: HandRuleMode; threshold: number }>) => void;
}) {
  const name = HAND_TYPE_PLURAL[type];
  return (
    <div className={clsx("space-y-2", locked && "opacity-60")}>
      <div className="text-base text-bone">{name}</div>
      <Segmented<HandRuleMode> label={`${name} rule`} value={rule.mode} options={RULE_OPTIONS} onChange={(mode) => onChange({ mode })} disabled={locked} />
      {rule.mode === "threshold" && (
        <Stepper
          label={`Ban ${name.toLowerCase()} at`}
          value={rule.threshold}
          min={1}
          max={maxCards}
          onChange={(threshold) => onChange({ threshold })}
          disabled={locked}
        />
      )}
    </div>
  );
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <fieldset className="space-y-4 py-6">
      <legend className="font-display text-2xl font-bold text-bone">{title}</legend>
      {children}
    </fieldset>
  );
}

