"use client";

import { useEffect, useRef } from "react";
import { RotateCcw, Shuffle, SlidersHorizontal } from "lucide-react";

interface PostGameActionsProps {
  isHost: boolean;
  hostName: string;
  onPlayAgain: () => void;
  onLobby: () => void;
  onSwitch: () => void;
  onLeave: () => void;
  /** Other tables are still playing: the room moves on once they're done too. */
  othersPlaying?: boolean;
}

/** The bottom of every winner screen in a shared room: the host's three ways on. */
export function PostGameActions({ isHost, hostName, onPlayAgain, onLobby, onSwitch, onLeave, othersPlaying = false }: PostGameActionsProps) {
  const firstRef = useRef<HTMLButtonElement>(null);
  useEffect(() => firstRef.current?.focus(), []);
  const secondary = "flex min-h-12 flex-1 items-center justify-center gap-2 rounded-full border border-bone/40 px-5 text-base font-bold text-bone transition hover:border-bone";

  if (!isHost) {
    return (
      <>
        <p className="mt-6 text-base text-bone">{othersPlaying ? "The other tables are still playing." : `Waiting for ${hostName}.`}</p>
        <div className="mt-7 flex">
          <button ref={firstRef} onClick={onLeave} className={secondary}>
            Leave room
          </button>
        </div>
      </>
    );
  }
  return (
    <div className="mt-7 flex flex-wrap gap-3">
      {othersPlaying && <p className="basis-full text-base text-bone">The other tables are still playing.</p>}
      <button
        ref={firstRef}
        onClick={onPlayAgain}
        disabled={othersPlaying}
        className="flex min-h-12 basis-full items-center justify-center gap-2.5 rounded-full bg-brass px-6 font-display text-2xl font-bold text-smoke transition hover:bg-brass-lit disabled:opacity-40"
      >
        <RotateCcw className="size-5" aria-hidden />
        Play again
      </button>
      <button onClick={onLobby} className={secondary}>
        <SlidersHorizontal className="size-4" aria-hidden />
        Lobby
      </button>
      <button onClick={onSwitch} disabled={othersPlaying} className={`${secondary} disabled:opacity-40`}>
        <Shuffle className="size-4" aria-hidden />
        Switch game
      </button>
    </div>
  );
}
