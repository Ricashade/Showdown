"use client";

import { useMemo } from "react";
import type { PlayerSeed } from "@/types/game";
import { applyBouillotteAction, createBouillotteRoom, getBouillotteView } from "@/lib/bouillotte-engine";
import { bouillotteBots } from "@/lib/bot-ai";
import { ME, seatBots, useSoloTable } from "@/lib/hooks/use-solo-table";
import { LocalRoomChat } from "@/components/RoomChat";
import { BouillotteTableScreen } from "./BouillotteTableScreen";

/** The demo's three players. */
const BOTS: PlayerSeed[] = [
  { id: "bot-vinnie", name: "Shark Vinnie", isBot: true, botDifficulty: "hard" },
  { id: "bot-ivy", name: "Ice Cold Ivy", isBot: true, botDifficulty: "medium" },
  { id: "bot-benny", name: "Bot Benny", isBot: true, botDifficulty: "easy" },
];

const create = () => seatBots(createBouillotteRoom({ roomId: "local-bouillotte", host: { id: ME, name: "You" } }), applyBouillotteAction, BOTS);

/** You against bots, on this screen. */
export default function LocalBouillotte() {
  const { state, dispatch, table } = useSoloTable({ create, apply: applyBouillotteAction, bots: bouillotteBots });
  const view = useMemo(() => getBouillotteView(state, ME), [state]);

  return (
    <>
      <BouillotteTableScreen view={view} actingId={ME} isHost onAction={dispatch} {...table} />
      <LocalRoomChat state={state} speakerId={ME} />
    </>
  );
}
