"use client";

import { useMemo } from "react";
import { applyWarAction, createWarRoom, getWarView } from "@/lib/war-engine";
import { warBots } from "@/lib/bot-ai";
import { ME, useSoloTable } from "@/lib/hooks/use-solo-table";
import { LocalRoomChat } from "@/components/RoomChat";
import { WarTableScreen } from "./WarTableScreen";

/** A War is two duelists; solo, that's you and one bot. */
const WAR_DUELISTS = 2;

const create = () => createWarRoom({ roomId: "local-war", host: { id: ME, name: "You" } });

/** You and the bots you seat, on this screen. */
export default function LocalWar() {
  const { state, dispatch, table } = useSoloTable({ create, apply: applyWarAction, bots: warBots, seats: WAR_DUELISTS });
  const view = useMemo(() => getWarView(state, ME), [state]);

  return (
    <>
      <WarTableScreen view={view} actingId={ME} isHost onAction={dispatch} controlIds={state.sides?.some((x) => x.id === ME) ? [ME] : []} {...table} />
      <LocalRoomChat state={state} speakerId={ME} />
    </>
  );
}
