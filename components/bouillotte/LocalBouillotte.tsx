"use client";

import { useMemo } from "react";
import { applyBouillotteAction, createBouillotteRoom, getBouillotteView } from "@/lib/bouillotte-engine";
import { bouillotteBots } from "@/lib/bot-ai";
import { ME, useSoloTable } from "@/lib/hooks/use-solo-table";
import { LocalRoomChat } from "@/components/RoomChat";
import { BouillotteTableScreen } from "./BouillotteTableScreen";


const create = () => createBouillotteRoom({ roomId: "local-bouillotte", host: { id: ME, name: "You" } });

/** You and the bots you seat, on this screen. */
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
