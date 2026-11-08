"use client";

import { useMemo } from "react";
import { applyWarAction, createWarRoom, getWarView } from "@/lib/war-engine";
import { warBots } from "@/lib/bot-ai";
import { HOUSE_BOTS, ME, seatBots, useSoloTable } from "@/lib/hooks/use-solo-table";
import { LocalRoomChat } from "@/components/RoomChat";
import { WarTableScreen } from "./WarTableScreen";

const create = () => seatBots(createWarRoom({ roomId: "local-war", host: { id: ME, name: "You" } }), applyWarAction, HOUSE_BOTS.slice(0, 1));

/** You against bots, on this screen. */
export default function LocalWar() {
  const { state, dispatch, table } = useSoloTable({ create, apply: applyWarAction, bots: warBots });
  const view = useMemo(() => getWarView(state, ME), [state]);

  return (
    <>
      <WarTableScreen view={view} actingId={ME} isHost onAction={dispatch} controlIds={state.sides?.some((x) => x.id === ME) ? [ME] : []} {...table} />
      <LocalRoomChat state={state} speakerId={ME} />
    </>
  );
}
