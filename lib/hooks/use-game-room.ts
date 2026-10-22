"use client";

import { useSyncExternalStore } from "react";
import type { GameTransport } from "@/lib/multiplayer/transport";

export function useGameRoom<S, A>(transport: GameTransport<S, A>): S {
  return useSyncExternalStore(transport.subscribe, transport.getSnapshot, transport.getSnapshot);
}
