"use client";

import { useMemo } from "react";
import { applyHoldemAction, createHoldemRoom, getHoldemView } from "@/lib/holdem-game";
import { holdemBots } from "@/lib/bot-ai";
import { HOUSE_BOTS, ME, seatBots, useSoloTable } from "@/lib/hooks/use-solo-table";
import { LocalRoomChat } from "@/components/RoomChat";
import { HoldemTableScreen } from "./HoldemTableScreen";

const create = () => seatBots(createHoldemRoom({ roomId: "local-holdem", host: { id: ME, name: "You" } }), applyHoldemAction, HOUSE_BOTS);

/** You against bots, on this screen. */
export default function LocalHoldem() {
  const { state, dispatch, table } = useSoloTable({ create, apply: applyHoldemAction, bots: holdemBots });
  const view = useMemo(() => getHoldemView(state, ME), [state]);

  return (
    <>
      <HoldemTableScreen view={view} actingId={ME} isHost onAction={dispatch} {...table} />
      <LocalRoomChat state={state} speakerId={ME} />
    </>
  );
}
