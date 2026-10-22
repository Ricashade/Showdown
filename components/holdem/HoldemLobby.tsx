"use client";

import type { HoldemSettings } from "@/types/holdem";
import {
  BLIND_EVERY_OPTIONS,
  BLIND_MULTIPLIERS,
  HOLDEM_MAX_PLAYERS,
  HOLDEM_MIN_PLAYERS,
  SMALL_BLIND_OPTIONS,
  STARTING_CHIP_OPTIONS,
  type HoldemView,
} from "@/lib/holdem-game";
import { ChoiceStepper, Segmented } from "@/components/ui/controls";
import { Group, SeatsPanel, type LobbyOptions } from "@/components/table/SeatsPanel";

interface HoldemLobbyProps {
  view: HoldemView;
  isHost: boolean;
  options: LobbyOptions;
  connectedIds?: Set<string>;
  onUpdateSettings: (patch: Partial<HoldemSettings>) => void;
  onStart: () => void;
}

export function HoldemLobby({ view, isHost, options, connectedIds, onUpdateSettings, onStart }: HoldemLobbyProps) {
  const { settings, players, hostId } = view;
  const hostName = players.find((p) => p.id === hostId)?.name ?? "The host";
  const locked = !isHost;
  const set = onUpdateSettings;
  const rise = settings.blindIncrease;
  // At least 10 big blinds in a starting stack.
  const blindChoices = SMALL_BLIND_OPTIONS.filter((sb) => sb * 20 <= settings.startingChips);

  return (
    <div className="mx-auto grid max-w-6xl gap-x-14 gap-y-10 px-4 py-8 sm:px-8 lg:grid-cols-[1fr_1fr]">
      <SeatsPanel
        players={players}
        viewerId={view.viewerId}
        hostId={hostId}
        isHost={isHost}
        options={options}
        connectedIds={connectedIds}
        minPlayers={HOLDEM_MIN_PLAYERS}
        maxPlayers={HOLDEM_MAX_PLAYERS}
        roomPath="/texas-holdem/room"
        onStart={onStart}
      />

      <section aria-labelledby="rules-heading">
        <h2 id="rules-heading" className="font-display text-4xl font-bold text-bone">
          House rules
        </h2>
        {locked && <p className="mt-1 text-sm text-ash">Only {hostName} can change these.</p>}

        <div className="mt-6 divide-y divide-leather-lit border-y border-leather-lit">
          <Group title="Chips">
            <ChoiceStepper
              label="Starting chips"
              value={settings.startingChips}
              options={STARTING_CHIP_OPTIONS}
              onChange={(startingChips) => set({ startingChips })}
              disabled={locked}
            />
            <ChoiceStepper
              label="Blinds"
              value={settings.smallBlind}
              options={blindChoices}
              format={(sb) => `${sb.toLocaleString("en-US")}/${(sb * 2).toLocaleString("en-US")}`}
              onChange={(smallBlind) => set({ smallBlind })}
              disabled={locked}
            />
          </Group>

          <Group title="Blinds go up">
            <Segmented<"never" | "every_n_hands">
              label="Blinds go up"
              value={rise.mode}
              options={[
                { value: "never", label: "Never" },
                { value: "every_n_hands", label: "Every few hands" },
              ]}
              onChange={(mode) => set({ blindIncrease: { ...rise, mode } })}
              disabled={locked}
            />
            {rise.mode === "every_n_hands" && (
              <>
                <ChoiceStepper
                  label="Every"
                  value={rise.everyHands}
                  options={BLIND_EVERY_OPTIONS}
                  format={(n) => `${n} ${n === 1 ? "hand" : "hands"}`}
                  onChange={(everyHands) => set({ blindIncrease: { ...rise, everyHands } })}
                  disabled={locked}
                />
                <div className="flex items-center justify-between gap-4">
                  <span className="text-base text-bone">Multiply by</span>
                  <div className="w-44">
                    <Segmented<string>
                      label="Multiply blinds by"
                      value={String(rise.multiplier)}
                      options={BLIND_MULTIPLIERS.map((m) => ({ value: String(m), label: `×${m}` }))}
                      onChange={(m) => set({ blindIncrease: { ...rise, multiplier: Number(m) } })}
                      disabled={locked}
                    />
                  </div>
                </div>
              </>
            )}
          </Group>
        </div>
      </section>
    </div>
  );
}
