"use client";

import type { SpeedSettings, SpeedWinBy } from "@/types/speed";
import { duelistsOf, SPEED_MAX_PLAYERS, SPEED_MIN_PLAYERS, type SpeedView } from "@/lib/speed-engine";
import { Segmented, Toggle } from "@/components/ui/controls";
import { Group, SeatsPanel, type LobbyOptions } from "@/components/table/SeatsPanel";

interface SpeedLobbyProps {
  view: SpeedView;
  isHost: boolean;
  options: LobbyOptions;
  connectedIds?: Set<string>;
  onUpdateSettings: (patch: Partial<SpeedSettings>) => void;
  onStart: () => void;
}

export function SpeedLobby({ view, isHost, options, connectedIds, onUpdateSettings, onStart }: SpeedLobbyProps) {
  const { settings, players, hostId } = view;
  const hostName = players.find((p) => p.id === hostId)?.name ?? "The host";
  const locked = !isHost;
  const set = onUpdateSettings;
  const duel = duelistsOf(view);
  const pick = (slot: 0 | 1, id: string) => {
    const next: [string, string] = [...duel];
    next[slot] = id;
    // Picking the other player swaps the two.
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
        minPlayers={SPEED_MIN_PLAYERS}
        maxPlayers={SPEED_MAX_PLAYERS}
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
                  <select key={slot} aria-label={`Player ${slot + 1}`} value={duel[slot]} onChange={(e) => pick(slot, e.target.value)} disabled={locked} className={select} style={{ gridColumn: slot === 0 ? 1 : 3 }}>
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

          <Group title="Cards">
            <Toggle label="Same rank goes on too" description="An 8 on an 8." checked={settings.allowSameRank} onChange={(allowSameRank) => set({ allowSameRank })} disabled={locked} />
            <Toggle label="Doubles" description="Two to four of a rank go down in one move." checked={settings.allowDoubles} onChange={(allowDoubles) => set({ allowDoubles })} disabled={locked} />
            <Toggle label="Hand refills itself" description="Off: draw from your stock yourself (Space)." checked={settings.autoDraw} onChange={(autoDraw) => set({ autoDraw })} disabled={locked} />
          </Group>

          <Group title="Winning">
            <Segmented<SpeedWinBy>
              label="Win by"
              value={settings.winBy}
              options={[
                { value: "empty", label: "Last card down" },
                { value: "slap", label: "Slap Speed first" },
              ]}
              onChange={(winBy) => set({ winBy })}
              disabled={locked}
            />
            {settings.winBy === "slap" && <p className="text-sm text-ash">Out of cards? Slap Speed before the other player does, or take back the smaller pile.</p>}
          </Group>
        </div>
      </section>
    </div>
  );
}
