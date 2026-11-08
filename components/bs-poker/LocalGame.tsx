"use client";

import { useMemo } from "react";
import { applyAction, createRoom, getPlayerView } from "@/lib/bs-poker-game";
import { bsPokerBots } from "@/lib/bot-ai";
import { HOUSE_BOTS, ME, seatBots, useSoloTable } from "@/lib/hooks/use-solo-table";
import { LocalRoomChat } from "@/components/RoomChat";
import { TableScreen } from "./TableScreen";

const create = () => seatBots(createRoom({ roomId: "local-bs-poker", host: { id: ME, name: "You" } }), applyAction, HOUSE_BOTS.slice(0, 2));

/** You against bots, on this screen. */
export default function LocalGame() {
  const { state, dispatch, table } = useSoloTable({ create, apply: applyAction, bots: bsPokerBots });
  const view = useMemo(() => getPlayerView(state, ME), [state]);

  return (
    <>
      <TableScreen view={view} actingId={ME} isHost onAction={dispatch} canDealNextRound {...table} />
      <LocalRoomChat state={state} speakerId={ME} />
    </>
  );
}
