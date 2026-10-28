import type { ComponentType } from "react";
import type { GameId } from "@/lib/games";
import { BsPokerHowTo } from "@/components/rules/BsPokerHowTo";
import { HoldemHowTo } from "@/components/holdem/HoldemHowTo";
import { BlackjackHowTo } from "@/components/blackjack/BlackjackHowTo";
import { GarbageHowTo } from "@/components/garbage/GarbageHowTo";
import { RummyHowTo } from "@/components/rummy/RummyHowTo";
import { WarHowTo } from "@/components/war/WarHowTo";

/** Every game's rules and demo as a dialog, so nobody has to leave the room to read them. */
export const HOW_TO: Record<GameId, ComponentType<{ onClose: () => void }>> = {
  "bs-poker": BsPokerHowTo,
  "texas-holdem": HoldemHowTo,
  blackjack: BlackjackHowTo,
  garbage: GarbageHowTo,
  rummy: RummyHowTo,
  war: WarHowTo,
};
