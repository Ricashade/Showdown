"use client";

import { useMemo } from "react";
import type { PlayerSeed } from "@/types/game";
import { applyThirteenAction, createThirteenRoom, getThirteenView } from "@/lib/thirteen-engine";
import { thirteenBots } from "@/lib/bot-ai";
import { ME, seatBots, useSoloTable } from "@/lib/hooks/use-solo-table";
import { LocalRoomChat } from "@/components/RoomChat";
import { ThirteenTableScreen } from "./ThirteenTableScreen";

/** The demo's two bots. */
const BOTS: PlayerSeed[] = [
  { id: "bot-vinnie", name: "Shark Vinnie", isBot: true, botDifficulty: "hard" },
  { id: "bot-ivy", name: "Ice Cold Ivy", isBot: true, botDifficulty: "medium" },
];

const create = () => seatBots(createThirteenRoom({ roomId: "local-thirteen", host: { id: ME, name: "You" } }), applyThirteenAction, BOTS);

/** You against bots, on this screen. */
export default function LocalThirteen() {
  const { state, dispatch, table } = useSoloTable({ create, apply: applyThirteenAction, bots: thirteenBots });
  const view = useMemo(() => getThirteenView(state, ME), [state]);

  return (
    <>
      <ThirteenTableScreen view={view} actingId={ME} isHost onAction={dispatch} {...table} />
      <LocalRoomChat state={state} speakerId={ME} />
    </>
  );
}
