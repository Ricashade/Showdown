"use client";

import type { WarMode, WarSettings, WarWinCondition } from "@/types/war";
import { duelistsOf, WAR_MAX_PLAYERS, WAR_MIN_PLAYERS, type WarView } from "@/lib/war-engine";
import { Segmented, Toggle } from "@/components/ui/controls";
import { Group, SeatsPanel, type LobbyOptions } from "@/components/table/SeatsPanel";

interface WarLobbyProps {
  view: WarView;
  isHost: boolean;
  options: LobbyOptions;
  connectedIds?: Set<string>;
  onUpdateSettings: (patch: Partial<WarSettings>) => void;
  onStart: () => void;
}

export function WarLobby({ view, isHost, options, connectedIds, onUpdateSettings, onStart }: WarLobbyProps) {
  const { settings, players, hostId } = view;
  const hostName = players.find((p) => p.id === hostId)?.name ?? "The host";
  const locked = !isHost;
  const set = onUpdateSettings;
  const duel = duelistsOf(view);
  const pick = (slot: 0 | 1, id: string) => {
    const next: [string, string] = [...duel];
    next[slot] = id;
    // Picking the other duelist swaps the two.
    if (next[0] === next[1]) next[1 - slot] = duel[slot];
    set({ duelistIds: next });
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
        minPlayers={WAR_MIN_PLAYERS}
        maxPlayers={WAR_MAX_PLAYERS}
        onStart={onStart}
      />

      <section aria-labelledby="rules-heading">
        <h2 id="rules-heading" className="font-display text-4xl font-bold text-bone">
          House rules
        </h2>
        {locked && <p className="mt-1 text-sm text-ash">Only {hostName} can change these.</p>}

        <div className="mt-6 divide-y divide-leather-lit border-y border-leather-lit">
          {players.length > 2 && (
            <Group title="Duel">
              <p className="text-sm text-ash">Two play; everyone else watches.</p>
              <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3">
                {([0, 1] as const).map((slot) => (
                  <select key={slot} aria-label={`Duelist ${slot + 1}`} value={duel[slot]} onChange={(e) => pick(slot, e.target.value)} disabled={locked} className={select} style={{ gridColumn: slot === 0 ? 1 : 3 }}>
                    {players.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name || "Player"}
                      </option>
                    ))}
                  </select>
                ))}
                <span className="col-start-2 row-start-1 font-display text-xl font-bold text-bone">vs</span>
              </div>
              <Toggle label="Winner stays on" checked={settings.winnerStaysOn} onChange={(winnerStaysOn) => set({ winnerStaysOn })} disabled={locked} />
            </Group>
          )}

          <Group title="Game">
            <Segmented<WarMode>
              label="Mode"
              value={settings.mode}
              options={[
                { value: "classic", label: "Classic" },
                { value: "tactical", label: "Tactical (3-card hand)" },
              ]}
              onChange={(mode) => set({ mode })}
              disabled={locked}
            />
            <Segmented<WarWinCondition>
              label="Win by"
              value={settings.winCondition}
              options={[
                { value: "domination", label: "All the cards" },
                { value: "forty", label: "First to 40" },
                { value: "blitz", label: "50 battles" },
              ]}
              onChange={(winCondition) => set({ winCondition })}
              disabled={locked}
            />
          </Group>

          <Group title="Cards">
            <div className="flex items-center justify-between gap-4">
              <span className="text-base text-bone">Face-down cards in a War</span>
              <div className="w-40">
                <Segmented<string>
                  label="Face-down cards in a War"
                  value={String(settings.bounty)}
                  options={["1", "2", "3"].map((v) => ({ value: v, label: v }))}
                  onChange={(v) => set({ bounty: Number(v) as 1 | 2 | 3 })}
                  disabled={locked}
                />
              </div>
            </div>
            <Toggle label="Jokers (beat everything)" checked={settings.jokers} onChange={(jokers) => set({ jokers })} disabled={locked} />
          </Group>
        </div>
      </section>
    </div>
  );
}
