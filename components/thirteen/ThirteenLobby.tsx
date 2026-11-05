"use client";

import type { BombTiebreaker, ThirteenSettings } from "@/types/thirteen";
import { THIRTEEN_MAX_PLAYERS, THIRTEEN_MIN_PLAYERS, trioOf, type ThirteenView } from "@/lib/thirteen-engine";
import { Segmented, Toggle } from "@/components/ui/controls";
import { Group, SeatsPanel, type LobbyOptions } from "@/components/table/SeatsPanel";

interface ThirteenLobbyProps {
  view: ThirteenView;
  isHost: boolean;
  options: LobbyOptions;
  connectedIds?: Set<string>;
  onUpdateSettings: (patch: Partial<ThirteenSettings>) => void;
  onStart: () => void;
}

export function ThirteenLobby({ view, isHost, options, connectedIds, onUpdateSettings, onStart }: ThirteenLobbyProps) {
  const { settings, players, hostId } = view;
  const hostName = players.find((p) => p.id === hostId)?.name ?? "The host";
  const locked = !isHost;
  const set = onUpdateSettings;
  const trio = trioOf(view) as [string, string, string];
  const pick = (slot: number, id: string) => {
    const next = [...trio] as [string, string, string];
    // Picking someone already seated swaps the two seats.
    const was = next.indexOf(id);
    if (was >= 0) next[was] = trio[slot];
    next[slot] = id;
    set({ seatIds: next });
  };
  const select = "min-h-11 w-full rounded-2xl bg-smoke px-3 text-base text-bone ring-1 ring-leather-lit focus-visible:outline-2 focus-visible:outline-brass-lit disabled:opacity-50";

  return (
    <div className="mx-auto grid max-w-6xl gap-x-14 gap-y-10 px-4 py-8 sm:px-8 lg:grid-cols-[1fr_1fr]">
      <SeatsPanel
        players={players}
        viewerId={view.viewerId}
        hostId={hostId}
        isHost={isHost}
        options={options}
        connectedIds={connectedIds}
        minPlayers={THIRTEEN_MIN_PLAYERS}
        maxPlayers={THIRTEEN_MAX_PLAYERS}
        onStart={onStart}
      />

      <section aria-labelledby="rules-heading">
        <h2 id="rules-heading" className="font-display text-4xl font-bold text-bone">
          House rules
        </h2>
        {locked && <p className="mt-1 text-sm text-ash">Only {hostName} can change these.</p>}

        <div className="mt-6 divide-y divide-leather-lit border-y border-leather-lit">
          {players.length > 3 && (
            <Group title="At the table">
              <p className="text-sm text-ash">Three play; everyone else watches.</p>
              <div className="grid gap-2 sm:grid-cols-3">
                {[0, 1, 2].map((slot) => (
                  <select key={slot} aria-label={`Seat ${slot + 1}`} value={trio[slot]} onChange={(e) => pick(slot, e.target.value)} disabled={locked} className={select}>
                    {players.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name || "Player"}
                      </option>
                    ))}
                  </select>
                ))}
              </div>
              <Toggle
                label="Winner stays on"
                description="Whoever holds the most cards at the end gives up their seat."
                checked={settings.winnerStaysOn}
                onChange={(winnerStaysOn) => set({ winnerStaysOn })}
                disabled={locked}
              />
            </Group>
          )}

          <Group title="Bombs">
            <Toggle label="Bomb back in after passing" checked={settings.bombAfterPass} onChange={(bombAfterPass) => set({ bombAfterPass })} disabled={locked} />
            <div className="space-y-2">
              <span className="block text-base text-bone">Two bombs of the same tier and rank</span>
              <Segmented<BombTiebreaker>
                label="Two bombs of the same tier and rank"
                value={settings.bombTiebreaker}
                options={[
                  { value: "natural", label: "No Jokers wins" },
                  { value: "strict", label: "Neither wins" },
                  { value: "challenger", label: "Later one wins" },
                ]}
                onChange={(bombTiebreaker) => set({ bombTiebreaker })}
                disabled={locked}
              />
            </div>
          </Group>

          <Group title="Lead">
            <Toggle
              label="3♠ opens every hand"
              description="Otherwise the last hand's winner leads."
              checked={settings.threeSpadesEveryHand}
              onChange={(threeSpadesEveryHand) => set({ threeSpadesEveryHand })}
              disabled={locked}
            />
          </Group>
        </div>
      </section>
    </div>
  );
}
