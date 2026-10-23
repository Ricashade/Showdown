"use client";

import { useEffect, useRef } from "react";
import { thinkingTime, type BotRunner } from "@/lib/bot-ai";

/**
 * Plays the bots' turns. Run it only where the full game state lives — the online host's
 * tab or the local simulator — so each bot move is made exactly once and then broadcast.
 * Pass `state = null` everywhere else (guests).
 */
export function useBotDriver<S extends { version: number }, A>(state: S | null, bots: BotRunner<S, A>, dispatch: (action: A) => void) {
  const latest = useRef(state);
  latest.current = state;
  const dispatchRef = useRef(dispatch);
  dispatchRef.current = dispatch;

  const pending = state ? bots.pending(state) : null;
  const version = state?.version;

  useEffect(() => {
    if (!pending) return;
    const { botId, justDealt } = pending;
    const timer = setTimeout(() => {
      const now = latest.current;
      // Only act if nothing changed while we were "thinking".
      if (!now || now.version !== version || bots.pending(now)?.botId !== botId) return;
      const action = bots.decide(now, botId);
      if (action) dispatchRef.current(action);
    }, thinkingTime() + justDealt);
    return () => clearTimeout(timer);
    // Re-arm on every new state; `pending` is derived from it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [version, pending?.botId, bots]);
}
