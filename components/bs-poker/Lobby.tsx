"use client";

import clsx from "clsx";
import type { BsPokerSettings, HandRuleMode, RestrictableHand } from "@/types/bs-poker";
import { MAX_PLAYERS, MIN_PLAYERS, maxCardsCap, type BsPokerView } from "@/lib/bs-poker-game";
import { HAND_TYPE_PLURAL, RESTRICTABLE_HANDS } from "@/lib/bs-poker-engine";
import { Segmented, Stepper, Toggle } from "@/components/ui/controls";
import { Group, SeatsPanel, type LobbyOptions } from "@/components/table/SeatsPanel";

export type { LobbyOptions };

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
  const set = onUpdateSettings;
  const locked = !isHost;

  const setRule = (type: RestrictableHand, patch: Partial<{ mode: HandRuleMode; threshold: number }>) =>
    set({ handRules: { ...settings.handRules, [type]: { ...settings.handRules[type], ...patch } } });

  return (
    <div className="mx-auto grid max-w-6xl gap-x-14 gap-y-10 px-4 py-8 sm:px-8 lg:grid-cols-[1fr_1fr]">
      <SeatsPanel
        players={players}
        viewerId={view.viewerId}
        hostId={hostId}
        isHost={isHost}
        options={options}
        connectedIds={connectedIds}
        minPlayers={MIN_PLAYERS}
        maxPlayers={MAX_PLAYERS}
        roomPath="/bs-poker/room"
        onStart={onStart}
      />

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


