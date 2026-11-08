"use client";

import { useMemo } from "react";
import { applyGarbageAction, createGarbageRoom, getGarbageView } from "@/lib/garbage-engine";
import { garbageBots } from "@/lib/bot-ai";
import { HOUSE_BOTS, ME, seatBots, useSoloTable } from "@/lib/hooks/use-solo-table";
import { LocalRoomChat } from "@/components/RoomChat";
import { GarbageTableScreen } from "./GarbageTableScreen";

const create = () => seatBots(createGarbageRoom({ roomId: "local-garbage", host: { id: ME, name: "You" } }), applyGarbageAction, HOUSE_BOTS.slice(0, 2));

/** You against bots, on this screen. */
export default function LocalGarbage() {
  const { state, dispatch, table } = useSoloTable({ create, apply: applyGarbageAction, bots: garbageBots });
  const view = useMemo(() => getGarbageView(state, ME), [state]);

  return (
    <>
      <GarbageTableScreen view={view} actingId={ME} isHost onAction={dispatch} {...table} />
      <LocalRoomChat state={state} speakerId={ME} />
    </>
  );
}
