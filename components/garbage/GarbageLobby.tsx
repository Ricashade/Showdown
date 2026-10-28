"use client";

import type { FaceCard, FaceCardPreset, FaceRole, GarbageSettings } from "@/types/garbage";
import { GARBAGE_MAX_PLAYERS, GARBAGE_MIN_PLAYERS, type GarbageView } from "@/lib/garbage-engine";
import { Segmented, Toggle } from "@/components/ui/controls";
import { Group, SeatsPanel, type LobbyOptions } from "@/components/table/SeatsPanel";

interface GarbageLobbyProps {
  view: GarbageView;
  isHost: boolean;
  options: LobbyOptions;
  connectedIds?: Set<string>;
  onUpdateSettings: (patch: Partial<GarbageSettings>) => void;
  onStart: () => void;
}

const FACE_NAMES: Record<FaceCard, string> = { J: "Jacks", Q: "Queens", K: "Kings" };

export function GarbageLobby({ view, isHost, options, connectedIds, onUpdateSettings, onStart }: GarbageLobbyProps) {
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
        minPlayers={GARBAGE_MIN_PLAYERS}
        maxPlayers={GARBAGE_MAX_PLAYERS}
        onStart={onStart}
      />

      <section aria-labelledby="rules-heading">
        <h2 id="rules-heading" className="font-display text-4xl font-bold text-bone">
          House rules
        </h2>
        {locked && <p className="mt-1 text-sm text-ash">Only {hostName} can change these.</p>}

        <div className="mt-6 divide-y divide-leather-lit border-y border-leather-lit">
          <Group title="Face cards">
            <Segmented<FaceCardPreset>
              label="Face cards"
              value={settings.faceCardPreset}
              options={[
                { value: "queens-kings", label: "Q & K wild" },
                { value: "jacks", label: "Jacks wild" },
                { value: "custom", label: "Custom" },
              ]}
              onChange={(faceCardPreset) => set({ faceCardPreset })}
              disabled={locked}
            />
            {settings.faceCardPreset === "custom" ? (
              (["J", "Q", "K"] as const).map((f) => (
                <div key={f} className="flex items-center justify-between gap-4">
                  <span className="text-base text-bone">{FACE_NAMES[f]}</span>
                  <div className="w-52">
                    <Segmented<FaceRole>
                      label={FACE_NAMES[f]}
                      value={settings.faceCards[f]}
                      options={[
                        { value: "wild", label: "Wild" },
                        { value: "dead", label: "Garbage" },
                      ]}
                      onChange={(role) => set({ faceCards: { ...settings.faceCards, [f]: role } })}
                      disabled={locked}
                    />
                  </div>
                </div>
              ))
            ) : (
              <p className="text-sm text-ash">
                {(["J", "Q", "K"] as const)
                  .filter((f) => settings.faceCards[f] === "dead")
                  .map((f) => FACE_NAMES[f])
                  .join(" and ")}{" "}
                are garbage.
              </p>
            )}
          </Group>

          <Group title="Ending a round">
            <Toggle
              label="Last turn for everyone else, then a reveal"
              checked={settings.lastTurn}
              onChange={(lastTurn) => set({ lastTurn })}
              disabled={locked}
            />
          </Group>
        </div>
      </section>
    </div>
  );
}
