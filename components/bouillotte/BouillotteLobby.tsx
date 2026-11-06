"use client";

import type { AnteBy, BouillotteSettings } from "@/types/bouillotte";
import { ANTE_CHOICES, BOUILLOTTE_MAX_PLAYERS, BOUILLOTTE_MIN_PLAYERS, STARTING_CHIP_CHOICES, type BouillotteView } from "@/lib/bouillotte-engine";
import { ChoiceStepper, Segmented, Toggle } from "@/components/ui/controls";
import { Group, SeatsPanel, type LobbyOptions } from "@/components/table/SeatsPanel";

interface BouillotteLobbyProps {
  view: BouillotteView;
  isHost: boolean;
  options: LobbyOptions;
  connectedIds?: Set<string>;
  onUpdateSettings: (patch: Partial<BouillotteSettings>) => void;
  onStart: () => void;
}

export function BouillotteLobby({ view, isHost, options, connectedIds, onUpdateSettings, onStart }: BouillotteLobbyProps) {
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
        minPlayers={BOUILLOTTE_MIN_PLAYERS}
        maxPlayers={BOUILLOTTE_MAX_PLAYERS}
        onStart={onStart}
      />

      <section aria-labelledby="rules-heading">
        <h2 id="rules-heading" className="font-display text-4xl font-bold text-bone">
          House rules
        </h2>
        {locked && <p className="mt-1 text-sm text-ash">Only {hostName} can change these.</p>}

        <div className="mt-6 divide-y divide-leather-lit border-y border-leather-lit">
          <Group title="Stakes">
            <ChoiceStepper label="Starting chips" value={settings.startingChips} options={STARTING_CHIP_CHOICES} onChange={(startingChips) => set({ startingChips })} disabled={locked} />
            <ChoiceStepper label="Ante" value={settings.ante} options={ANTE_CHOICES} onChange={(ante) => set({ ante })} disabled={locked} />
            <Segmented<AnteBy>
              label="Who antes"
              value={settings.anteBy}
              options={[
                { value: "everyone", label: "Everyone" },
                { value: "dealer", label: "The dealer, for the table" },
              ]}
              onChange={(anteBy) => set({ anteBy })}
              disabled={locked}
            />
          </Group>

          <Group title="Rules">
            <Toggle label="Carré" description="The player on the dealer's right may bet blind to act last." checked={settings.allowCarre} onChange={(allowCarre) => set({ allowCarre })} disabled={locked} />
            <Toggle label="Brélan favori" description="A pair plus the Retourné of that rank counts as a brélan." checked={settings.brelanFavori} onChange={(brelanFavori) => set({ brelanFavori })} disabled={locked} />
          </Group>
        </div>
      </section>
    </div>
  );
}
