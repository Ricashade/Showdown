"use client";

import { useMemo } from "react";
import type { BlackjackAction, BlackjackState } from "@/types/blackjack";
import { applyBlackjackAction, blackjackClock, createBlackjackRoom, getBlackjackView } from "@/lib/blackjack-engine";
import { blackjackBots } from "@/lib/bot-ai";
import { HOUSE_BOTS, ME, seatBots, useSoloTable } from "@/lib/hooks/use-solo-table";
import { LocalRoomChat } from "@/components/RoomChat";
import { BlackjackTableScreen } from "./BlackjackTableScreen";

const apply = (s: BlackjackState, a: BlackjackAction) => applyBlackjackAction(s, a, Date.now());
const create = () => seatBots(createBlackjackRoom({ roomId: "local-blackjack", host: { id: ME, name: "You" } }), apply, HOUSE_BOTS.slice(0, 2));

/** You against bots, on this screen. */
export default function LocalBlackjack() {
  const { state, dispatch, table } = useSoloTable({ create, apply, bots: blackjackBots, clock: blackjackClock });
  const view = useMemo(() => getBlackjackView(state, ME), [state]);

  return (
    <>
      <BlackjackTableScreen view={view} actingId={ME} isHost onAction={dispatch} {...table} />
      <LocalRoomChat state={state} speakerId={ME} />
    </>
  );
}
