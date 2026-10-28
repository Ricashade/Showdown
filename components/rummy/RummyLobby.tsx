"use client";

import type { AceRule, RummySettings, RummyVariant } from "@/types/rummy";
import { RUMMY_MAX_PLAYERS, RUMMY_MIN_PLAYERS, TARGET_OPTIONS, type RummyView } from "@/lib/rummy-engine";
import { Segmented, Toggle } from "@/components/ui/controls";
import { Group, SeatsPanel, type LobbyOptions } from "@/components/table/SeatsPanel";

interface RummyLobbyProps {
  view: RummyView;
  isHost: boolean;
  options: LobbyOptions;
  connectedIds?: Set<string>;
  onUpdateSettings: (patch: Partial<RummySettings>) => void;
  onStart: () => void;
}

export function RummyLobby({ view, isHost, options, connectedIds, onUpdateSettings, onStart }: RummyLobbyProps) {
  const { settings, players, hostId } = view;
  const hostName = players.find((p) => p.id === hostId)?.name ?? "The host";
  const locked = !isHost;
  const set = onUpdateSettings;
  const row = (label: string, control: React.ReactNode) => (
    <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
      <span className="text-base text-bone">{label}</span>
      <div className="w-full sm:w-auto sm:min-w-72">{control}</div>
    </div>
  );

  return (
    <div className="mx-auto grid max-w-6xl gap-x-14 gap-y-10 px-4 py-8 sm:px-8 lg:grid-cols-[1fr_1fr]">
      <SeatsPanel
        players={players}
        viewerId={view.viewerId}
        hostId={hostId}
        isHost={isHost}
        options={options}
        connectedIds={connectedIds}
        minPlayers={RUMMY_MIN_PLAYERS}
        maxPlayers={RUMMY_MAX_PLAYERS}
        roomPath="/rummy/room"
        onStart={onStart}
      />

      <section aria-labelledby="rules-heading">
        <h2 id="rules-heading" className="font-display text-4xl font-bold text-bone">
          House rules
        </h2>
        {locked && <p className="mt-1 text-sm text-ash">Only {hostName} can change these.</p>}

        <div className="mt-6 divide-y divide-leather-lit border-y border-leather-lit">
          <Group title="Game">
            <Segmented<RummyVariant>
              label="Variant"
              value={settings.variant}
              options={[
                { value: "classic", label: "Classic" },
                { value: "rummy500", label: "Rummy 500" },
              ]}
              onChange={(variant) => set({ variant })}
              disabled={locked}
            />
            {settings.variant === "rummy500" && <p className="text-sm text-ash">Any card in the discard pile can be taken, with everything on top of it, if you play it that turn.</p>}
            {row(
              "Play to",
              <Segmented<string>
                label="Play to"
                value={String(settings.targetScore)}
                options={TARGET_OPTIONS.map((t) => ({ value: String(t), label: t === null ? "One hand" : String(t) }))}
                onChange={(v) => set({ targetScore: v === "null" ? null : Number(v) })}
                disabled={locked}
              />,
            )}
          </Group>

          <Group title="Cards">
            {row(
              "Aces",
              <Segmented<AceRule>
                label="Aces"
                value={settings.aceRule}
                options={[
                  { value: "low", label: "Low" },
                  { value: "both", label: "High or low" },
                  { value: "wrap", label: "Wrap K-A-2" },
                ]}
                onChange={(aceRule) => set({ aceRule })}
                disabled={locked}
              />,
            )}
            {row(
              "Cards each with two players",
              <Segmented<string>
                label="Cards each with two players"
                value={String(settings.twoPlayerHand)}
                options={[
                  { value: "10", label: "10" },
                  { value: "13", label: "13" },
                ]}
                onChange={(v) => set({ twoPlayerHand: v === "13" ? 13 : 10 })}
                disabled={locked}
              />,
            )}
            <Toggle label="Wild Jokers" checked={settings.jokers} onChange={(jokers) => set({ jokers })} disabled={locked} />
          </Group>
        </div>
      </section>
    </div>
  );
}
