"use client";

import { useMemo } from "react";
import type { BlackjackAction, BlackjackState } from "@/types/blackjack";
import { applyBlackjackAction, blackjackClock, createBlackjackRoom, getBlackjackView } from "@/lib/blackjack-engine";
import { blackjackBots } from "@/lib/bot-ai";
import { ME, useSoloTable } from "@/lib/hooks/use-solo-table";
import { LocalRoomChat } from "@/components/RoomChat";
import { BlackjackTableScreen } from "./BlackjackTableScreen";

const apply = (s: BlackjackState, a: BlackjackAction) => applyBlackjackAction(s, a, Date.now());
const create = () => createBlackjackRoom({ roomId: "local-blackjack", host: { id: ME, name: "You" } });

/** You and the bots you seat, on this screen. */
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
