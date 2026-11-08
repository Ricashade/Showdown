"use client";

import { useMemo } from "react";
import { applyRummyAction, createRummyRoom, getRummyView } from "@/lib/rummy-engine";
import { rummyBots } from "@/lib/bot-ai";
import { HOUSE_BOTS, ME, seatBots, useSoloTable } from "@/lib/hooks/use-solo-table";
import { LocalRoomChat } from "@/components/RoomChat";
import { RummyTableScreen } from "./RummyTableScreen";

const create = () => seatBots(createRummyRoom({ roomId: "local-rummy", host: { id: ME, name: "You" } }), applyRummyAction, HOUSE_BOTS.slice(0, 2));

/** You against bots, on this screen. */
export default function LocalRummy() {
  const { state, dispatch, table } = useSoloTable({ create, apply: applyRummyAction, bots: rummyBots });
  const view = useMemo(() => getRummyView(state, ME), [state]);

  return (
    <>
      <RummyTableScreen view={view} actingId={ME} isHost onAction={dispatch} {...table} />
      <LocalRoomChat state={state} speakerId={ME} />
    </>
  );
}
