"use client";

import type { BlackjackSettings } from "@/types/blackjack";
import {
  BET_SECONDS_OPTIONS,
  BLACKJACK_MAX_PLAYERS,
  BLACKJACK_MIN_PLAYERS,
  DECK_OPTIONS,
  STARTING_CHIP_OPTIONS,
  type BlackjackView,
} from "@/lib/blackjack-engine";
import { ChoiceStepper } from "@/components/ui/controls";
import { Group, SeatsPanel, type LobbyOptions } from "@/components/table/SeatsPanel";

interface BlackjackLobbyProps {
  view: BlackjackView;
  isHost: boolean;
  options: LobbyOptions;
  connectedIds?: Set<string>;
  onUpdateSettings: (patch: Partial<BlackjackSettings>) => void;
  onStart: () => void;
}

export function BlackjackLobby({ view, isHost, options, connectedIds, onUpdateSettings, onStart }: BlackjackLobbyProps) {
  const { settings, players, hostId } = view;
  const hostName = players.find((p) => p.id === hostId)?.name ?? "The host";
  const locked = !isHost;
  const set = onUpdateSettings;

  return (
    <div className="mx-auto grid max-w-6xl gap-x-14 gap-y-10 px-4 py-8 sm:px-8 lg:grid-cols-[1fr_1fr]">
      <SeatsPanel
        players={players}
        viewerId={view.viewerId}
        hostId={hostId}
        isHost={isHost}
        options={options}
        connectedIds={connectedIds}
        minPlayers={BLACKJACK_MIN_PLAYERS}
        maxPlayers={BLACKJACK_MAX_PLAYERS}
        roomPath="/blackjack/room"
        onStart={onStart}
      />

      <section aria-labelledby="rules-heading">
        <h2 id="rules-heading" className="font-display text-4xl font-bold text-bone">
          House rules
        </h2>
        {locked && <p className="mt-1 text-sm text-ash">Only {hostName} can change these.</p>}

        <div className="mt-6 divide-y divide-leather-lit border-y border-leather-lit">
          <Group title="Table">
            <ChoiceStepper
              label="Starting chips"
              value={settings.startingChips}
              options={STARTING_CHIP_OPTIONS}
              onChange={(startingChips) => set({ startingChips })}
              disabled={locked}
            />
            <ChoiceStepper
              label="Decks in the shoe"
              value={settings.decks}
              options={DECK_OPTIONS}
              onChange={(decks) => set({ decks })}
              disabled={locked}
            />
            <ChoiceStepper
              label="Time to bet"
              value={settings.betSeconds}
              options={BET_SECONDS_OPTIONS}
              format={(s) => `${s}s`}
              onChange={(betSeconds) => set({ betSeconds })}
              disabled={locked}
            />
          </Group>
        </div>
      </section>
    </div>
  );
}
