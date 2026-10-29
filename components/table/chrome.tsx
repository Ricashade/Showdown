"use client";

import { useEffect, useState } from "react";
import { RoomLink } from "@/components/ui/RoomTransition";
import { AnimatePresence, motion } from "framer-motion";

export interface HeaderExit {
  label: string;
  /** Ask before leaving, e.g. "End this game and go back to the lobby?" */
  confirm?: string;
  onExit: () => void;
}

/** Game title (with anything that goes beside it) plus one way out. Without `exit`, links to the main menu. */
export function ScreenHeader({ title, exit, extra }: { title: string; exit?: HeaderExit; extra?: React.ReactNode }) {
  const [confirming, setConfirming] = useState(false);
  return (
    <header className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 pt-5 sm:px-8">
      {extra ? (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <h1 className="font-display text-4xl font-extrabold text-bone">{title}</h1>
          {extra}
        </div>
      ) : (
        <h1 className="font-display text-4xl font-extrabold text-bone">{title}</h1>
      )}
      {!exit ? (
        <RoomLink href="/" className="flex min-h-11 items-center px-2 text-base text-parchment underline-offset-4 hover:text-bone hover:underline">
          Main menu
        </RoomLink>
      ) : confirming && exit.confirm ? (
        <div role="group" aria-label={exit.confirm} className="flex flex-wrap items-center gap-2">
          <span className="text-base text-parchment">{exit.confirm}</span>
          <button
            onClick={() => {
              setConfirming(false);
              exit.onExit();
            }}
            className="min-h-11 rounded-full border border-bone/50 px-4 text-sm font-bold text-bone hover:border-bone"
          >
            {exit.label}
          </button>
          <button
            autoFocus
            onClick={() => {
              setConfirming(false);
              requestAnimationFrame(() => document.getElementById("header-exit")?.focus());
            }}
            className="min-h-11 rounded-full bg-brass px-4 text-sm font-bold text-smoke hover:bg-brass-lit"
          >
            Stay
          </button>
        </div>
      ) : (
        <button
          id="header-exit"
          onClick={() => (exit.confirm ? setConfirming(true) : exit.onExit())}
          className="min-h-11 px-2 text-base text-parchment underline-offset-4 hover:text-bone hover:underline"
        >
          {exit.label}
        </button>
      )}
    </header>
  );
}

/** Brief error message; a new `id` shows the same message again. */
export function Toast({ error }: { error?: { message: string; id: number } | null }) {
  const [toast, setToast] = useState<string | null>(null);
  useEffect(() => {
    if (!error) return;
    setToast(error.message);
    const t = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(t);
  }, [error]);
  return (
    <AnimatePresence>
      {toast && (
        <motion.div
          role="alert"
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0 }}
          className="fixed bottom-5 left-1/2 z-[60] w-max max-w-[calc(100vw-2rem)] -translate-x-1/2 rounded-2xl bg-bone px-5 py-3 text-base font-bold text-smoke shadow-xl"
        >
          {toast}
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/** Dashed notices above the table (test mode, host lost connection…). */
export function Notices({ items }: { items: string[] }) {
  if (items.length === 0) return null;
  return (
    <div className="space-y-2">
      {items.map((n) => (
        <p key={n} role="status" className="rounded-3xl border border-dashed border-ash/50 px-4 py-3 text-sm text-parchment">
          {n}
        </p>
      ))}
    </div>
  );
}
