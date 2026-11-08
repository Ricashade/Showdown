"use client";

import { useMemo } from "react";
import type { SpeedAction, SpeedState } from "@/types/speed";
import { applySpeedAction, createSpeedRoom, getSpeedView, speedClock } from "@/lib/speed-engine";
import { speedBots } from "@/lib/bot-ai";
import { HOUSE_BOTS, ME, seatBots, useSoloTable } from "@/lib/hooks/use-solo-table";
import { LocalRoomChat } from "@/components/RoomChat";
import { SpeedTableScreen } from "./SpeedTableScreen";

const apply = (s: SpeedState, a: SpeedAction) => applySpeedAction(s, a, Date.now());

/** You against a bot. From the reflex drill, a quicker one. */
export default function LocalSpeed({ fromDemo = false }: { fromDemo?: boolean }) {
  const { state, dispatch, table } = useSoloTable({
    create: () => seatBots(createSpeedRoom({ roomId: "local-speed", host: { id: ME, name: "You" } }), apply, [fromDemo ? HOUSE_BOTS[0] : HOUSE_BOTS[1]]),
    apply,
    bots: speedBots,
    clock: speedClock,
  });
  // You're playing, or watching if you seat two bots against each other.
  const view = useMemo(() => getSpeedView(state, ME), [state]);

  return (
    <>
      <SpeedTableScreen view={view} actingId={ME} isHost onAction={dispatch} {...table} />
      <LocalRoomChat state={state} speakerId={ME} />
    </>
  );
}
