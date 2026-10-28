"use client";

import { useEffect, useRef } from "react";
import clsx from "clsx";
import { motion } from "framer-motion";
import { X } from "lucide-react";
import { GAMES, type GameId } from "@/lib/games";
import { GAME_IDS, seatsFor } from "@/lib/party-engine";
import { Fan } from "@/components/rules/HowToDialog";
import { GAME_ART } from "@/components/menu/game-art";

/** How the room would sit at this game, when that isn't simply "everyone plays". */
function fit(id: GameId, people: number) {
  const { min, max } = seatsFor(id);
  if (people < min) return `Needs ${min}`;
  if (id === "war" && people > 2) return `2 play, ${people - 2} watch`;
  if (people > max) return `${people - max} sit out`;
  return null;
}

/** The host picks what the room plays next. */
export function GamePicker({ current, people, onPick, onClose }: { current: GameId; people: number; onPick: (id: GameId) => void; onClose: () => void }) {
  const currentRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    currentRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <motion.div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/75 p-3 sm:p-6" initial={{ opacity: 0 }} animate={{ opacity: 1 }} onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="picker-title"
        onClick={(e) => e.stopPropagation()}
        className="my-auto w-full max-w-3xl rounded-[2rem] bg-smoke-raised p-5 shadow-2xl ring-1 ring-leather-lit sm:p-8"
      >
        <div className="flex items-center justify-between gap-3">
          <h2 id="picker-title" className="font-display text-4xl font-extrabold text-bone">
            Pick a game
          </h2>
          <button onClick={onClose} aria-label="Close" className="grid size-11 shrink-0 place-items-center rounded-full text-bone hover:bg-black/30">
            <X className="size-5" />
          </button>
        </div>

        <ul className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {GAME_IDS.map((id) => {
            const on = id === current;
            const note = fit(id, people);
            return (
              <li key={id}>
                <button
                  ref={on ? currentRef : undefined}
                  onClick={() => onPick(id)}
                  aria-current={on}
                  className={clsx(
                    "felt flex h-full min-h-32 w-full flex-col justify-between gap-4 rounded-3xl border-4 p-5 text-left transition hover:brightness-110",
                    on ? "border-brass" : "border-transparent",
                  )}
                  style={{ boxShadow: "inset 0 0 40px rgba(0, 0, 0, 0.45)" }}
                >
                  <Fan spec={GAME_ART[id].show} />
                  <span>
                    <span className="block font-display text-3xl leading-none font-extrabold text-bone">{GAMES[id].title}</span>
                    {note && <span className="mt-1.5 block text-sm text-bone">{note}</span>}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </motion.div>
  );
}
