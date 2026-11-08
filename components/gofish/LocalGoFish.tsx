"use client";

import { useMemo } from "react";
import { applyGoFishAction, createGoFishRoom, getGoFishView } from "@/lib/gofish-engine";
import { goFishBots } from "@/lib/bot-ai";
import { HOUSE_BOTS, ME, seatBots, useSoloTable } from "@/lib/hooks/use-solo-table";
import { LocalRoomChat } from "@/components/RoomChat";
import { GoFishTableScreen } from "./GoFishTableScreen";

const create = () => seatBots(createGoFishRoom({ roomId: "local-go-fish", host: { id: ME, name: "You" } }), applyGoFishAction, HOUSE_BOTS.slice(0, 2));

/** You against bots, on this screen. */
export default function LocalGoFish() {
  const { state, dispatch, table } = useSoloTable({ create, apply: applyGoFishAction, bots: goFishBots });
  const view = useMemo(() => getGoFishView(state, ME), [state]);

  return (
    <>
      <GoFishTableScreen view={view} actingId={ME} isHost onAction={dispatch} {...table} />
      <LocalRoomChat state={state} speakerId={ME} />
    </>
  );
}
