"use client";

import type { GoFishSettings } from "@/types/gofish";
import { GOFISH_MAX_PLAYERS, GOFISH_MIN_PLAYERS, type GoFishView } from "@/lib/gofish-engine";
import { Segmented, Toggle } from "@/components/ui/controls";
import { Group, SeatsPanel, type LobbyOptions } from "@/components/table/SeatsPanel";

interface GoFishLobbyProps {
  view: GoFishView;
  isHost: boolean;
  options: LobbyOptions;
  connectedIds?: Set<string>;
  onUpdateSettings: (patch: Partial<GoFishSettings>) => void;
  onStart: () => void;
}

export function GoFishLobby({ view, isHost, options, connectedIds, onUpdateSettings, onStart }: GoFishLobbyProps) {
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
        minPlayers={GOFISH_MIN_PLAYERS}
        maxPlayers={GOFISH_MAX_PLAYERS}
        onStart={onStart}
      />

      <section aria-labelledby="rules-heading">
        <h2 id="rules-heading" className="font-display text-4xl font-bold text-bone">
          House rules
        </h2>
        {locked && <p className="mt-1 text-sm text-ash">Only {hostName} can change these.</p>}

        <div className="mt-6 divide-y divide-leather-lit border-y border-leather-lit">
          <Group title="Books">
            <Segmented<string>
              label="A book is"
              value={String(settings.bookSize)}
              options={[
                { value: "4", label: "Four of a kind" },
                { value: "2", label: "A pair" },
              ]}
              onChange={(v) => set({ bookSize: v === "2" ? 2 : 4 })}
              disabled={locked}
            />
          </Group>

          <Group title="Fishing">
            <Toggle
              label="Lucky catch"
              description="Draw the rank you asked for and go again."
              checked={settings.luckyCatch}
              onChange={(luckyCatch) => set({ luckyCatch })}
              disabled={locked}
            />
            <div className="flex items-center justify-between gap-4">
              <span className="text-base text-bone">An empty hand draws</span>
              <div className="w-40">
                <Segmented<string>
                  label="An empty hand draws"
                  value={String(settings.refill)}
                  options={[
                    { value: "1", label: "1" },
                    { value: "5", label: "Up to 5" },
                  ]}
                  onChange={(v) => set({ refill: v === "5" ? 5 : 1 })}
                  disabled={locked}
                />
              </div>
            </div>
          </Group>

          <Group title="Memory">
            <Toggle
              label="Memory helper"
              description="Shows which ranks each player is known to hold. Off for hardcore."
              checked={settings.memoryHelper}
              onChange={(memoryHelper) => set({ memoryHelper })}
              disabled={locked}
            />
          </Group>
        </div>
      </section>
    </div>
  );
}
