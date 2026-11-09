"use client";

import { useMemo } from "react";
import type { SpeedAction, SpeedState } from "@/types/speed";
import { applySpeedAction, createSpeedRoom, getSpeedView, speedClock } from "@/lib/speed-engine";
import { speedBots } from "@/lib/bot-ai";
import { ME, useSoloTable } from "@/lib/hooks/use-solo-table";
import { LocalRoomChat } from "@/components/RoomChat";
import { SpeedTableScreen } from "./SpeedTableScreen";

const apply = (s: SpeedState, a: SpeedAction) => applySpeedAction(s, a, Date.now());

/** You and a bot you seat, on this screen. */
export default function LocalSpeed() {
  const { state, dispatch, table } = useSoloTable({
    create: () => createSpeedRoom({ roomId: "local-speed", host: { id: ME, name: "You" } }),
    apply,
    bots: speedBots,
    clock: speedClock,
    seats: 2,
  });
  const view = useMemo(() => getSpeedView(state, ME), [state]);

  return (
    <>
      <SpeedTableScreen view={view} actingId={ME} isHost onAction={dispatch} {...table} />
      <LocalRoomChat state={state} speakerId={ME} />
    </>
  );
}
