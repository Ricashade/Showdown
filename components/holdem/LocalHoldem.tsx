"use client";

import { useMemo } from "react";
import { applyHoldemAction, createHoldemRoom, getHoldemView } from "@/lib/holdem-game";
import { holdemBots } from "@/lib/bot-ai";
import { ME, useSoloTable } from "@/lib/hooks/use-solo-table";
import { LocalRoomChat } from "@/components/RoomChat";
import { HoldemTableScreen } from "./HoldemTableScreen";

const create = () => createHoldemRoom({ roomId: "local-holdem", host: { id: ME, name: "You" } });

/** You and the bots you seat, on this screen. */
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
