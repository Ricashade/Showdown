"use client";

import { useMemo } from "react";
import { applyThirteenAction, createThirteenRoom, getThirteenView, THIRTEEN_SEATS } from "@/lib/thirteen-engine";
import { thirteenBots } from "@/lib/bot-ai";
import { ME, useSoloTable } from "@/lib/hooks/use-solo-table";
import { LocalRoomChat } from "@/components/RoomChat";
import { ThirteenTableScreen } from "./ThirteenTableScreen";


const create = () => createThirteenRoom({ roomId: "local-thirteen", host: { id: ME, name: "You" } });

/** You and the bots you seat, on this screen. */
export default function LocalThirteen() {
  const { state, dispatch, table } = useSoloTable({ create, apply: applyThirteenAction, bots: thirteenBots, seats: THIRTEEN_SEATS });
  const view = useMemo(() => getThirteenView(state, ME), [state]);

  return (
    <>
      <ThirteenTableScreen view={view} actingId={ME} isHost onAction={dispatch} {...table} />
      <LocalRoomChat state={state} speakerId={ME} />
    </>
  );
}
