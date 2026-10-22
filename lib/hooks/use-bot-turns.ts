"use client";

import { useEffect } from "react";
import type { BsPokerAction, BsPokerState } from "@/types/bs-poker";
import { getLegalActions, getPlayer, getPlayerView } from "@/lib/bs-poker-game";
import { getBotController } from "@/lib/turn-controller";

/**
 * When it's a bot's turn and a controller is registered for its difficulty,
 * ask it for a move after a short "thinking" delay. Inert until bots exist.
 * (Online, this would run server-side instead.)
 */
export function useBotTurns(state: BsPokerState, dispatch: (a: BsPokerAction) => void, delayMs = 900) {
  const turnId = state.phase === "bidding" ? state.currentTurnPlayerId : null;
  const bot = turnId ? getPlayer(state, turnId) : undefined;
  const version = state.version;

  useEffect(() => {
    if (!bot?.isBot) return;
    const controller = getBotController(bot.botDifficulty);
    if (!controller) return;
    let cancelled = false;
    const timer = setTimeout(async () => {
      const decision = await controller.decide(getPlayerView(state, bot.id), getLegalActions(state, bot.id));
      if (!cancelled) dispatch(decision);
    }, delayMs);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
    // Re-run only when the game advances.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [version, bot?.id]);
}
