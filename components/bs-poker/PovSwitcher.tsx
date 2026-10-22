"use client";

import clsx from "clsx";
import type { PublicPlayer } from "@/lib/bs-poker-game";
import { Toggle } from "@/components/ui/controls";

interface PovSwitcherProps {
  players: PublicPlayer[];
  viewer: string | "god";
  currentTurnId: string | null;
  followTurn: boolean;
  onSelect: (v: string | "god") => void;
  onFollowTurnChange: (v: boolean) => void;
}

/** Developer tool: whose eyes the table is seen through. Dashed edge marks it as not part of the game. */
export function PovSwitcher({ players, viewer, currentTurnId, followTurn, onSelect, onFollowTurnChange }: PovSwitcherProps) {
  const option = (id: string | "god", label: string, extra?: string) => (
    <button
      key={id}
      role="radio"
      aria-checked={viewer === id}
      onClick={() => onSelect(id)}
      className={clsx(
        "min-h-10 rounded-full px-3.5 text-sm transition",
        viewer === id ? "bg-parchment font-bold text-smoke" : "text-parchment hover:text-bone",
        extra,
      )}
    >
      {label}
    </button>
  );

  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-3xl border border-dashed border-ash/50 px-4 py-2">
      <span id="pov-label" className="text-sm text-ash">
        Viewing as
      </span>
      <div role="radiogroup" aria-labelledby="pov-label" className="flex flex-wrap gap-1">
        {players.map((p) =>
          option(
            p.id,
            p.id === currentTurnId ? `${p.name} (turn)` : p.name,
            p.status === "eliminated" ? "line-through opacity-60" : undefined,
          ),
        )}
        {option("god", "Everyone")}
      </div>
      <div className="ml-auto w-56">
        <Toggle label="Follow the turn" checked={followTurn} onChange={onFollowTurnChange} />
      </div>
    </div>
  );
}
