"use client";

import { useEffect, useRef } from "react";

/** What a self-running table does next on its own, and when (ms timestamp). */
export type TableClock<S, A> = (state: S) => { at: number; action: A } | null;

/**
 * Runs a table's timers (bets closing, the dealer drawing, the next round starting). Like
 * useBotDriver, run it only where the full state lives — the online host's tab or the local
 * simulator — and pass `state = null` everywhere else.
 */
export function useTableClock<S extends { version: number }, A>(state: S | null, clock: TableClock<S, A> | undefined, dispatch: (action: A) => void) {
  const dispatchRef = useRef(dispatch);
  dispatchRef.current = dispatch;
  const version = state?.version;

  useEffect(() => {
    if (!state || !clock) return;
    const next = clock(state);
    if (!next) return;
    const timer = setTimeout(() => dispatchRef.current(next.action), Math.max(0, next.at - Date.now()));
    return () => clearTimeout(timer);
    // Re-arm on every new state.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [version, clock]);
}
