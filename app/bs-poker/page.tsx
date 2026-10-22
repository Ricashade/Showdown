import type { Metadata } from "next";
import PlayModeChooser from "@/components/bs-poker/PlayModeChooser";

export const metadata: Metadata = { title: "BS Poker | Showdown" };

export default function BsPokerPage() {
  return <PlayModeChooser />;
}
